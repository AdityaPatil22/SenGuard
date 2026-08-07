6ddbac2 feat: background evaluation with SSE progress streaming
---STAT---
 backend/app/api/v1/evaluations.py  | 81 ++++++++++++++++++++++++++++++++++++--
 backend/app/services/evaluation.py |  6 +--
 2 files changed, 78 insertions(+), 9 deletions(-)
---DIFF---
diff --git a/backend/app/api/v1/evaluations.py b/backend/app/api/v1/evaluations.py
index d847fa5..9ba8fbb 100644
--- a/backend/app/api/v1/evaluations.py
+++ b/backend/app/api/v1/evaluations.py
@@ -1,26 +1,52 @@
+import asyncio
+import json
 import uuid
 
-from fastapi import APIRouter, Depends, Query
+from fastapi import APIRouter, Depends, Query, Response
+from fastapi.responses import StreamingResponse
 from sqlalchemy.ext.asyncio import AsyncSession
 
 from app.auth.dependencies import get_current_user
+from app.auth.jwt import decode_token
+from app.core.exceptions import NotFoundError, UnauthorizedError
 from app.core.response import success
-from app.db.session import get_db
+from app.db.session import async_session, get_db
+from app.models.evaluation import EvaluationStatus
 from app.models.user import User
 from app.schemas.evaluation import EvaluationCreate
 from app.services.audit import create_audit_log
 from app.services.evaluation import EvaluationService
+from app.services.evaluation_progress import EvaluationProgress, progress_store
 
 router = APIRouter(prefix="/evaluations", tags=["evaluations"])
 
 
+async def _run_evaluation_background(evaluation_id: str):
+    progress = progress_store.get(evaluation_id)
+    if not progress:
+        return
+
+    async with async_session() as session:
+        try:
+            service = EvaluationService(session)
+            await service.run(uuid.UUID(evaluation_id))
+            await session.commit()
+            progress.complete()
+        except Exception as e:
+            await session.rollback()
+            progress.fail(str(e))
+        finally:
+            await asyncio.sleep(60)
+            progress_store.pop(evaluation_id, None)
+
+
 def _serialize(evaluation) -> dict:
     return {
         "id": str(evaluation.id),
         "status": evaluation.status,
         "risk_score": evaluation.risk_score,
         "summary": evaluation.summary,
         "model_name": evaluation.model_name,
         "node_results": evaluation.node_results,
         "error_message": evaluation.error_message,
         "project_id": str(evaluation.project_id) if evaluation.project_id else None,
@@ -83,35 +109,82 @@ async def get_evaluation(
     return success(data=_serialize(evaluation), message="Evaluation retrieved")
 
 
 @router.post("/{evaluation_id}/run")
 async def run_evaluation(
     evaluation_id: str,
     db: AsyncSession = Depends(get_db),
     current_user: User = Depends(get_current_user),
 ):
     service = EvaluationService(db)
+    evaluation = await service.get(uuid.UUID(evaluation_id))
+
+    if evaluation.status == EvaluationStatus.RUNNING:
+        return Response(
+            content=json.dumps(
+                success(data=_serialize(evaluation), message="Evaluation already running")
+            ),
+            media_type="application/json",
+            status_code=202,
+        )
+
+    evaluation = await service.repo.update(evaluation, {"status": EvaluationStatus.RUNNING})
 
     await create_audit_log(
         db,
         action="evaluation_started",
         resource_type="evaluation",
         resource_id=evaluation_id,
         user_id=current_user.id,
     )
 
-    evaluation = await service.run(uuid.UUID(evaluation_id))
-    return success(data=_serialize(evaluation), message="Evaluation completed")
+    progress = EvaluationProgress()
+    progress_store[evaluation_id] = progress
+
+    asyncio.create_task(_run_evaluation_background(evaluation_id))
+
+    return Response(
+        content=json.dumps(success(data=_serialize(evaluation), message="Evaluation started")),
+        media_type="application/json",
+        status_code=202,
+    )
 
 
 @router.get("/{evaluation_id}/status")
 async def get_evaluation_status(
     evaluation_id: str,
     db: AsyncSession = Depends(get_db),
     _current_user: User = Depends(get_current_user),
 ):
     service = EvaluationService(db)
     evaluation = await service.get(uuid.UUID(evaluation_id))
     return success(
         data={"id": str(evaluation.id), "status": evaluation.status},
         message="Evaluation status",
     )
+
+
+@router.get("/{evaluation_id}/stream")
+async def stream_evaluation(
+    evaluation_id: str,
+    token: str = Query(...),
+):
+    try:
+        decode_token(token, expected_type="access")
+    except UnauthorizedError:
+        return Response(
+            content=json.dumps({"success": False, "message": "Unauthorized", "data": None}),
+            media_type="application/json",
+            status_code=401,
+        )
+
+    progress = progress_store.get(evaluation_id)
+
+    async def event_generator():
+        if not progress:
+            yield f"data: {json.dumps({'type': 'evaluation:complete'})}\n\n"
+            return
+
+        async for event in progress.stream():
+            yield f"data: {json.dumps(event)}\n\n"
+
+    return StreamingResponse(event_generator(), media_type="text/event-stream")
diff --git a/backend/app/services/evaluation.py b/backend/app/services/evaluation.py
index 511333e..0ec8f8d 100644
--- a/backend/app/services/evaluation.py
+++ b/backend/app/services/evaluation.py
@@ -70,25 +70,20 @@ class EvaluationService:
             return await self.repo.get_by_project(project_id, skip, limit)
         if evaluation_type:
             return await self.repo.get_by_type(evaluation_type, skip, limit)
         if status:
             return await self.repo.get_by_status(status, skip, limit)
         return await self.repo.get_all(skip, limit)
 
     async def run(self, evaluation_id: uuid.UUID) -> Evaluation:
         evaluation = await self.get(evaluation_id)
 
-        if evaluation.status == EvaluationStatus.RUNNING:
-            raise BadRequestError("Evaluation already running")
-
-        await self.repo.update(evaluation, {"status": EvaluationStatus.RUNNING})
-
         try:
             project = await self.db.get(Project, evaluation.project_id) if evaluation.project_id else None
 
             dataset_samples: list[str] = []
             if evaluation.dataset_id:
                 ds = await self.db.get(Dataset, evaluation.dataset_id)
                 if ds and ds.file_path:
                     storage = get_storage_from_settings()
                     if await storage.exists(ds.file_path):
                         raw = await storage.load(ds.file_path)
@@ -99,20 +94,21 @@ class EvaluationService:
             if project and project.repo_url:
                 try:
                     repo_path = await clone_repo(project.repo_url)
                     repo_files = extract_key_files(repo_path)
                 except Exception as e:
                     logger.warning("Failed to clone repo %s: %s", project.repo_url, e)
 
             try:
                 result = await get_evaluation_workflow().ainvoke(
                     {
+                        "evaluation_id": str(evaluation.id),
                         "project_id": str(evaluation.project_id),
                         "project_name": project.name if project else "Unknown",
                         "project_description": project.description or "" if project else "",
                         "model_name": evaluation.model_name,
                         "dataset_samples": dataset_samples,
                         "repo_files": repo_files,
                         "repo_path": repo_path,
                         "has_repo": bool(repo_files),
                     }
                 )
