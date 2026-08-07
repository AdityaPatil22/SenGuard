98b679c feat: SSE pipeline stepper with real-time node progress
6ddbac2 feat: background evaluation with SSE progress streaming
58759e2 feat: add evaluation progress store and wire nodes to emit events
7ceec35 feat: add project detail page with risk trending chart
04d57e4 chore: add recharts dependency
---STAT---
 backend/app/api/v1/evaluations.py            |  81 +++++-
 backend/app/langgraph/nodes.py               |  30 +++
 backend/app/langgraph/state.py               |   1 +
 backend/app/services/evaluation.py           |   6 +-
 backend/app/services/evaluation_progress.py  |  64 +++++
 frontend/package-lock.json                   | 363 ++++++++++++++++++++++++++-
 frontend/package.json                        |   1 +
 frontend/src/components/pipeline-stepper.tsx |  67 +++++
 frontend/src/hooks/use-evaluations.ts        |  59 ++++-
 frontend/src/pages/evaluation-detail.tsx     |  17 +-
 frontend/src/pages/project-detail.tsx        | 180 +++++++++++++
 frontend/src/pages/projects.tsx              |   7 +-
 frontend/src/routes/index.tsx                |   2 +
 13 files changed, 848 insertions(+), 30 deletions(-)
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
diff --git a/backend/app/langgraph/nodes.py b/backend/app/langgraph/nodes.py
index e2e780e..e883ba2 100644
--- a/backend/app/langgraph/nodes.py
+++ b/backend/app/langgraph/nodes.py
@@ -1,18 +1,19 @@
 import json
 import logging
 
 from google import genai
 
 from app.config.settings import get_settings
 from app.langgraph.state import EvaluationState
 from app.scanners import ScanResults, compute_base_risk_score, run_all_scanners
+from app.services.evaluation_progress import progress_store
 
 logger = logging.getLogger(__name__)
 
 _client = None
 
 
 def _get_client() -> genai.Client:
     global _client
     if _client is None:
         settings = get_settings()
@@ -35,26 +36,34 @@ async def _ask_gemini_json(prompt: str) -> dict:
     text = text.strip()
     if text.startswith("```"):
         text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
     return json.loads(text)
 
 
 # ── Phase 1: Deterministic Scan ──────────────────────────────────────────
 
 
 async def deterministic_scan(state: EvaluationState) -> EvaluationState:
+    eval_id = state.get("evaluation_id")
+    progress = progress_store.get(eval_id) if eval_id else None
+    if progress:
+        progress.start_node("deterministic_scan")
+
     repo_files = state.get("repo_files") or []
     dataset_samples = state.get("dataset_samples") or []
     repo_path = state.get("repo_path")
 
     results: ScanResults = await run_all_scanners(repo_files, dataset_samples, repo_path)
     state["scanner_results"] = results.to_dict()
+
+    if progress:
+        progress.complete_node("deterministic_scan")
     return state
 
 
 # ── Phase 2: LLM Analysis ───────────────────────────────────────────────
 
 
 def _format_repo_context(state: EvaluationState) -> str:
     repo_files = state.get("repo_files") or []
     if not repo_files:
         return ""
@@ -66,20 +75,25 @@ def _format_repo_context(state: EvaluationState) -> str:
 
 def _format_dataset_context(state: EvaluationState) -> str:
     samples = state.get("dataset_samples") or []
     if not samples:
         return ""
     preview = "\n".join(samples[:20])
     return f"\n\n--- DATASET SAMPLE ({len(samples)} rows) ---\n{preview}"
 
 
 async def llm_analysis(state: EvaluationState) -> EvaluationState:
+    eval_id = state.get("evaluation_id")
+    progress = progress_store.get(eval_id) if eval_id else None
+    if progress:
+        progress.start_node("llm_analysis")
+
     scanner_results = state.get("scanner_results", {})
     findings = scanner_results.get("findings", [])
     summary = scanner_results.get("summary", {})
     description = state.get("project_description") or "No description provided."
     model_name = state.get("model_name") or "unspecified LLM"
     has_repo = state.get("has_repo", False)
     repo_context = _format_repo_context(state)
     dataset_context = _format_dataset_context(state)
 
     if has_repo:
@@ -132,24 +146,31 @@ Return JSON with:
         state["llm_analysis_result"] = result
     except Exception as e:
         logger.exception("llm_analysis node failed")
         state["llm_analysis_result"] = {
             "interpreted_findings": [],
             "supplementary_findings": [],
             "summary": f"LLM analysis failed: {e}",
         }
         state.setdefault("errors", []).append(f"AI analysis failed: {e}")
 
+    if progress:
+        progress.complete_node("llm_analysis")
     return state
 
 
 async def risk_scoring(state: EvaluationState) -> EvaluationState:
+    eval_id = state.get("evaluation_id")
+    progress = progress_store.get(eval_id) if eval_id else None
+    if progress:
+        progress.start_node("risk_scoring")
+
     scanner_results = state.get("scanner_results", {})
     llm_analysis = state.get("llm_analysis_result", {})
     findings = scanner_results.get("findings", [])
 
     from app.scanners import Finding as FindingClass
 
     finding_objects = [
         FindingClass(
             source=f.get("source", ""),
             severity=f.get("severity", "low"),
@@ -210,24 +231,31 @@ Return JSON with:
             "risk_level": "low"
             if base_score <= 25
             else "medium"
             if base_score <= 50
             else "high"
             if base_score <= 75
             else "critical",
         }
         state.setdefault("errors", []).append(f"Risk scoring AI failed: {e}")
 
+    if progress:
+        progress.complete_node("risk_scoring")
     return state
 
 
 async def report_generation(state: EvaluationState) -> EvaluationState:
+    eval_id = state.get("evaluation_id")
+    progress = progress_store.get(eval_id) if eval_id else None
+    if progress:
+        progress.start_node("report_generation")
+
     scanner_results = state.get("scanner_results", {})
     llm_analysis_result = state.get("llm_analysis_result", {})
     risk_breakdown = state.get("risk_breakdown", {})
     risk_score = state.get("risk_score", 0)
     project_name = state.get("project_name", "Unknown")
     has_repo = state.get("has_repo", False)
     scanners_used = scanner_results.get("scanners_used", [])
     findings = scanner_results.get("findings", [])
     interpreted = llm_analysis_result.get("interpreted_findings", [])
     supplementary = llm_analysis_result.get("supplementary_findings", [])
@@ -265,11 +293,13 @@ Keep it concise and actionable. Under 800 words."""
 
     try:
         state["report"] = await _ask_gemini(prompt)
     except Exception as e:
         logger.exception("report_generation node failed")
         state["report"] = (
             f"# Evaluation Report — {project_name}\n\nRisk Score: {risk_score}/100\n\nReport generation failed: {e}"
         )
         state.setdefault("errors", []).append(f"Report generation failed: {e}")
 
+    if progress:
+        progress.complete_node("report_generation")
     return state
diff --git a/backend/app/langgraph/state.py b/backend/app/langgraph/state.py
index 41db95f..d84c10d 100644
--- a/backend/app/langgraph/state.py
+++ b/backend/app/langgraph/state.py
@@ -4,20 +4,21 @@ from typing import Any, TypedDict
 class EvaluationState(TypedDict, total=False):
     # Inputs
     project_id: str
     project_name: str
     project_description: str
     model_name: str | None
     dataset_samples: list[str]
     repo_files: list[dict[str, str]]
     repo_path: str | None
     has_repo: bool
+    evaluation_id: str | None
 
     # Phase 1: deterministic scan results
     scanner_results: dict[str, Any]
 
     # Phase 2: LLM analysis
     llm_analysis_result: dict[str, Any]
     risk_score: float | None
     risk_breakdown: dict[str, Any] | None
     report: str | None
     error: str | None
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
diff --git a/backend/app/services/evaluation_progress.py b/backend/app/services/evaluation_progress.py
new file mode 100644
index 0000000..6bba79e
--- /dev/null
+++ b/backend/app/services/evaluation_progress.py
@@ -0,0 +1,64 @@
+import asyncio
+from datetime import datetime, timezone
+from typing import AsyncGenerator
+
+PIPELINE_NODES = ["deterministic_scan", "llm_analysis", "risk_scoring", "report_generation"]
+
+
+class EvaluationProgress:
+    def __init__(self):
+        self._events: list[dict] = []
+        self._done = asyncio.Event()
+        self._waiters: list[asyncio.Event] = []
+
+    def _emit(self, event: dict):
+        event["timestamp"] = datetime.now(timezone.utc).isoformat()
+        self._events.append(event)
+        for waiter in self._waiters:
+            waiter.set()
+
+    def start_node(self, name: str):
+        self._emit({"type": "node_start", "node": name})
+
+    def complete_node(self, name: str):
+        self._emit({"type": "node_complete", "node": name})
+
+    def fail_node(self, name: str, error: str):
+        self._emit({"type": "node_fail", "node": name, "error": error})
+
+    def complete(self):
+        self._emit({"type": "complete"})
+        self._done.set()
+
+    def fail(self, error: str):
+        self._emit({"type": "fail", "error": error})
+        self._done.set()
+
+    async def stream(self) -> AsyncGenerator[dict, None]:
+        index = 0
+        keepalive_interval = 30
+        last_keepalive = asyncio.get_event_loop().time()
+
+        while True:
+            while index < len(self._events):
+                yield self._events[index]
+                index += 1
+
+            if self._done.is_set():
+                break
+
+            waiter = asyncio.Event()
+            self._waiters.append(waiter)
+
+            try:
+                await asyncio.wait_for(waiter.wait(), timeout=keepalive_interval)
+            except asyncio.TimeoutError:
+                now = asyncio.get_event_loop().time()
+                if now - last_keepalive >= keepalive_interval:
+                    yield {"type": "keepalive", "timestamp": datetime.now(timezone.utc).isoformat()}
+                    last_keepalive = now
+            finally:
+                self._waiters.remove(waiter)
+
+
+progress_store: dict[str, EvaluationProgress] = {}
diff --git a/frontend/package-lock.json b/frontend/package-lock.json
index f091e7a..9b866aa 100644
--- a/frontend/package-lock.json
+++ b/frontend/package-lock.json
@@ -14,20 +14,21 @@
         "@tanstack/react-query": "^5.60.0",
         "axios": "^1.7.0",
         "class-variance-authority": "^0.7.0",
         "clsx": "^2.1.1",
         "lucide-react": "^0.460.0",
         "motion": "^12.43.0",
         "react": "^19.0.0",
         "react-dom": "^19.0.0",
         "react-markdown": "^10.1.0",
         "react-router-dom": "^7.0.0",
+        "recharts": "^3.10.1",
         "sonner": "^2.0.7",
         "tailwind-merge": "^2.6.0",
         "tw-animate-css": "^1.4.0",
         "zustand": "^5.0.0"
       },
       "devDependencies": {
         "@eslint/js": "^9.15.0",
         "@tailwindcss/vite": "^4.0.0",
         "@testing-library/jest-dom": "^6.6.0",
         "@testing-library/react": "^16.1.0",
@@ -1817,20 +1818,46 @@
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "@nodelib/fs.scandir": "2.1.5",
         "fastq": "^1.6.0"
       },
       "engines": {
         "node": ">= 8"
       }
     },
+    "node_modules/@reduxjs/toolkit": {
+      "version": "2.12.0",
+      "resolved": "https://registry.npmjs.org/@reduxjs/toolkit/-/toolkit-2.12.0.tgz",
+      "integrity": "sha512-KiT+RzZbp6mQET+Mg+h2c97+9j1sNflUxQkIHI7Yuzf6Peu+OYpmkn6nbHWmLLWj+1ZODUJFwGZ7gx3L9R9EOw==",
+      "license": "MIT",
+      "dependencies": {
+        "@standard-schema/spec": "^1.0.0",
+        "@standard-schema/utils": "^0.3.0",
+        "immer": "^11.0.0",
+        "redux": "^5.0.1",
+        "redux-thunk": "^3.1.0",
+        "reselect": "^5.1.0"
+      },
+      "peerDependencies": {
+        "react": "^16.9.0 || ^17.0.0 || ^18 || ^19",
+        "react-redux": "^7.2.1 || ^8.1.3 || ^9.0.0"
+      },
+      "peerDependenciesMeta": {
+        "react": {
+          "optional": true
+        },
+        "react-redux": {
+          "optional": true
+        }
+      }
+    },
     "node_modules/@rolldown/pluginutils": {
       "version": "1.0.0-beta.27",
       "resolved": "https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.0-beta.27.tgz",
       "integrity": "sha512-+d0F4MKMCbeVUJwG96uQ4SgAznZNSq93I3V+9NHA4OpvqG8mRCpGdKmK8l/dl02h2CCDHwW2FqilnTyDcAnqjA==",
       "dev": true,
       "license": "MIT"
     },
     "node_modules/@rollup/rollup-android-arm-eabi": {
       "version": "4.62.2",
       "resolved": "https://registry.npmjs.org/@rollup/rollup-android-arm-eabi/-/rollup-android-arm-eabi-4.62.2.tgz",
@@ -2233,20 +2260,32 @@
       "integrity": "sha512-tlqY9xq5ukxTUZBmoOp+m61cqwQD5pHJtFY3Mn8CA8ps6yghLH/Hw8UPdqg4OLmFW3IFlcXnQNmo/dh8HzXYIQ==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=18"
       },
       "funding": {
         "url": "https://github.com/sponsors/sindresorhus"
       }
     },
+    "node_modules/@standard-schema/spec": {
+      "version": "1.1.0",
+      "resolved": "https://registry.npmjs.org/@standard-schema/spec/-/spec-1.1.0.tgz",
+      "integrity": "sha512-l2aFy5jALhniG5HgqrD6jXLi/rUWrKvqN/qJx6yoJsgKhblVd+iqqU4RCXavm/jPityDo5TCvKMnpjKnOriy0w==",
+      "license": "MIT"
+    },
+    "node_modules/@standard-schema/utils": {
+      "version": "0.3.0",
+      "resolved": "https://registry.npmjs.org/@standard-schema/utils/-/utils-0.3.0.tgz",
+      "integrity": "sha512-e7Mew686owMaPJVNNLs55PUvgz371nKgwsc4vxE49zsODpJEnxgxRo2y/OKrqueavXgZNMDVj3DdHFlaSAeU8g==",
+      "license": "MIT"
+    },
     "node_modules/@tailwindcss/node": {
       "version": "4.3.2",
       "resolved": "https://registry.npmjs.org/@tailwindcss/node/-/node-4.3.2.tgz",
       "integrity": "sha512-yWP/sqEcBLaD8JuA6zNwxoYKr75qxTioYwlRwekj5Jr/I5GXnoJfjetH/psLUIv74cYTH2lBUEzBkinthoYcBg==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "@jridgewell/remapping": "^2.3.5",
         "enhanced-resolve": "5.21.6",
         "jiti": "^2.7.0",
@@ -2748,20 +2787,83 @@
     "node_modules/@types/babel__traverse": {
       "version": "7.28.0",
       "resolved": "https://registry.npmjs.org/@types/babel__traverse/-/babel__traverse-7.28.0.tgz",
       "integrity": "sha512-8PvcXf70gTDZBgt9ptxJ8elBeBjcLOAcOtoO/mPJjtji1+CdGbHgm77om1GrsPxsiE+uXIpNSK64UYaIwQXd4Q==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "@babel/types": "^7.28.2"
       }
     },
+    "node_modules/@types/d3-array": {
+      "version": "3.2.2",
+      "resolved": "https://registry.npmjs.org/@types/d3-array/-/d3-array-3.2.2.tgz",
+      "integrity": "sha512-hOLWVbm7uRza0BYXpIIW5pxfrKe0W+D5lrFiAEYR+pb6w3N2SwSMaJbXdUfSEv+dT4MfHBLtn5js0LAWaO6otw==",
+      "license": "MIT"
+    },
+    "node_modules/@types/d3-color": {
+      "version": "3.1.3",
+      "resolved": "https://registry.npmjs.org/@types/d3-color/-/d3-color-3.1.3.tgz",
+      "integrity": "sha512-iO90scth9WAbmgv7ogoq57O9YpKmFBbmoEoCHDB2xMBY0+/KVrqAaCDyCE16dUspeOvIxFFRI+0sEtqDqy2b4A==",
+      "license": "MIT"
+    },
+    "node_modules/@types/d3-ease": {
+      "version": "3.0.2",
+      "resolved": "https://registry.npmjs.org/@types/d3-ease/-/d3-ease-3.0.2.tgz",
+      "integrity": "sha512-NcV1JjO5oDzoK26oMzbILE6HW7uVXOHLQvHshBUW4UMdZGfiY6v5BeQwh9a9tCzv+CeefZQHJt5SRgK154RtiA==",
+      "license": "MIT"
+    },
+    "node_modules/@types/d3-interpolate": {
+      "version": "3.0.4",
+      "resolved": "https://registry.npmjs.org/@types/d3-interpolate/-/d3-interpolate-3.0.4.tgz",
+      "integrity": "sha512-mgLPETlrpVV1YRJIglr4Ez47g7Yxjl1lj7YKsiMCb27VJH9W8NVM6Bb9d8kkpG/uAQS5AmbA48q2IAolKKo1MA==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/d3-color": "*"
+      }
+    },
+    "node_modules/@types/d3-path": {
+      "version": "3.1.1",
+      "resolved": "https://registry.npmjs.org/@types/d3-path/-/d3-path-3.1.1.tgz",
+      "integrity": "sha512-VMZBYyQvbGmWyWVea0EHs/BwLgxc+MKi1zLDCONksozI4YJMcTt8ZEuIR4Sb1MMTE8MMW49v0IwI5+b7RmfWlg==",
+      "license": "MIT"
+    },
+    "node_modules/@types/d3-scale": {
+      "version": "4.0.9",
+      "resolved": "https://registry.npmjs.org/@types/d3-scale/-/d3-scale-4.0.9.tgz",
+      "integrity": "sha512-dLmtwB8zkAeO/juAMfnV+sItKjlsw2lKdZVVy6LRr0cBmegxSABiLEpGVmSJJ8O08i4+sGR6qQtb6WtuwJdvVw==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/d3-time": "*"
+      }
+    },
+    "node_modules/@types/d3-shape": {
+      "version": "3.1.8",
+      "resolved": "https://registry.npmjs.org/@types/d3-shape/-/d3-shape-3.1.8.tgz",
+      "integrity": "sha512-lae0iWfcDeR7qt7rA88BNiqdvPS5pFVPpo5OfjElwNaT2yyekbM0C9vK+yqBqEmHr6lDkRnYNoTBYlAgJa7a4w==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/d3-path": "*"
+      }
+    },
+    "node_modules/@types/d3-time": {
+      "version": "3.0.4",
+      "resolved": "https://registry.npmjs.org/@types/d3-time/-/d3-time-3.0.4.tgz",
+      "integrity": "sha512-yuzZug1nkAAaBlBBikKZTgzCeA+k1uy4ZFwWANOfKw5z5LRhV0gNA7gNkKm7HoK+HRN0wX3EkxGk0fpbWhmB7g==",
+      "license": "MIT"
+    },
+    "node_modules/@types/d3-timer": {
+      "version": "3.0.2",
+      "resolved": "https://registry.npmjs.org/@types/d3-timer/-/d3-timer-3.0.2.tgz",
+      "integrity": "sha512-Ps3T8E8dZDam6fUyNiMkekK3XUsaUEik+idO9/YjPtfj2qruF8tFBXS7XhtE4iIXBLxhmLjP3SXpLhVf21I9Lw==",
+      "license": "MIT"
+    },
     "node_modules/@types/debug": {
       "version": "4.1.13",
       "resolved": "https://registry.npmjs.org/@types/debug/-/debug-4.1.13.tgz",
       "integrity": "sha512-KSVgmQmzMwPlmtljOomayoR89W4FynCAi3E8PPs7vmDVPe84hT+vGPKkJfThkmXs0x0jAaa9U8uW8bbfyS2fWw==",
       "license": "MIT",
       "dependencies": {
         "@types/ms": "*"
       }
     },
     "node_modules/@types/estree": {
@@ -2828,20 +2930,26 @@
       "peerDependencies": {
         "@types/react": "^19.2.0"
       }
     },
     "node_modules/@types/unist": {
       "version": "3.0.3",
       "resolved": "https://registry.npmjs.org/@types/unist/-/unist-3.0.3.tgz",
       "integrity": "sha512-ko/gIFJRv177XgZsZcBwnqJN5x/Gien8qNOn0D5bQU/zAzVf9Zt3BlcUiLqhV9y4ARk0GbT3tnUiPNgnTXzc/Q==",
       "license": "MIT"
     },
+    "node_modules/@types/use-sync-external-store": {
+      "version": "0.0.6",
+      "resolved": "https://registry.npmjs.org/@types/use-sync-external-store/-/use-sync-external-store-0.0.6.tgz",
+      "integrity": "sha512-zFDAD+tlpf2r4asuHEj0XH6pY6i0g5NeAHPn+15wk3BV6JA69eERFXC1gyGThDkVa1zCyKr5jox1+2LbV/AMLg==",
+      "license": "MIT"
+    },
     "node_modules/@types/validate-npm-package-name": {
       "version": "4.0.2",
       "resolved": "https://registry.npmjs.org/@types/validate-npm-package-name/-/validate-npm-package-name-4.0.2.tgz",
       "integrity": "sha512-lrpDziQipxCEeK5kWxvljWYhUvOiB2A9izZd9B2AFarYAkqZshb4lPbRs7zKEic6eGtH8V/2qJW+dPp9OtF6bw==",
       "dev": true,
       "license": "MIT"
     },
     "node_modules/@typescript-eslint/eslint-plugin": {
       "version": "8.63.0",
       "resolved": "https://registry.npmjs.org/@typescript-eslint/eslint-plugin/-/eslint-plugin-8.63.0.tgz",
@@ -4180,20 +4288,141 @@
       "integrity": "sha512-guoltQEx+9aMf2gDZ0s62EcV8lsXR+0w8915TC3ITdn2YueuNjdAYh/levpU9nFaoChh9RUS5ZdQMrKfVEN9tw==",
       "dev": true,
       "license": "MIT"
     },
     "node_modules/csstype": {
       "version": "3.2.3",
       "resolved": "https://registry.npmjs.org/csstype/-/csstype-3.2.3.tgz",
       "integrity": "sha512-z1HGKcYy2xA8AGQfwrn0PAy+PB7X/GSj3UVJW9qKyn43xWa+gl5nXmU4qqLMRzWVLFC8KusUX8T/0kCiOYpAIQ==",
       "license": "MIT"
     },
+    "node_modules/d3-array": {
+      "version": "3.2.4",
+      "resolved": "https://registry.npmjs.org/d3-array/-/d3-array-3.2.4.tgz",
+      "integrity": "sha512-tdQAmyA18i4J7wprpYq8ClcxZy3SC31QMeByyCFyRt7BVHdREQZ5lpzoe5mFEYZUWe+oq8HBvk9JjpibyEV4Jg==",
+      "license": "ISC",
+      "dependencies": {
+        "internmap": "1 - 2"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-color": {
+      "version": "3.1.0",
+      "resolved": "https://registry.npmjs.org/d3-color/-/d3-color-3.1.0.tgz",
+      "integrity": "sha512-zg/chbXyeBtMQ1LbD/WSoW2DpC3I0mpmPdW+ynRTj/x2DAWYrIY7qeZIHidozwV24m4iavr15lNwIwLxRmOxhA==",
+      "license": "ISC",
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-ease": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/d3-ease/-/d3-ease-3.0.1.tgz",
+      "integrity": "sha512-wR/XK3D3XcLIZwpbvQwQ5fK+8Ykds1ip7A2Txe0yxncXSdq1L9skcG7blcedkOX+ZcgxGAmLX1FrRGbADwzi0w==",
+      "license": "BSD-3-Clause",
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-format": {
+      "version": "3.1.2",
+      "resolved": "https://registry.npmjs.org/d3-format/-/d3-format-3.1.2.tgz",
+      "integrity": "sha512-AJDdYOdnyRDV5b6ArilzCPPwc1ejkHcoyFarqlPqT7zRYjhavcT3uSrqcMvsgh2CgoPbK3RCwyHaVyxYcP2Arg==",
+      "license": "ISC",
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-interpolate": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/d3-interpolate/-/d3-interpolate-3.0.1.tgz",
+      "integrity": "sha512-3bYs1rOD33uo8aqJfKP3JWPAibgw8Zm2+L9vBKEHJ2Rg+viTR7o5Mmv5mZcieN+FRYaAOWX5SJATX6k1PWz72g==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-color": "1 - 3"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-path": {
+      "version": "3.1.0",
+      "resolved": "https://registry.npmjs.org/d3-path/-/d3-path-3.1.0.tgz",
+      "integrity": "sha512-p3KP5HCf/bvjBSSKuXid6Zqijx7wIfNW+J/maPs+iwR35at5JCbLUT0LzF1cnjbCHWhqzQTIN2Jpe8pRebIEFQ==",
+      "license": "ISC",
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-scale": {
+      "version": "4.0.2",
+      "resolved": "https://registry.npmjs.org/d3-scale/-/d3-scale-4.0.2.tgz",
+      "integrity": "sha512-GZW464g1SH7ag3Y7hXjf8RoUuAFIqklOAq3MRl4OaWabTFJY9PN/E1YklhXLh+OQ3fM9yS2nOkCoS+WLZ6kvxQ==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-array": "2.10.0 - 3",
+        "d3-format": "1 - 3",
+        "d3-interpolate": "1.2.0 - 3",
+        "d3-time": "2.1.1 - 3",
+        "d3-time-format": "2 - 4"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-shape": {
+      "version": "3.2.0",
+      "resolved": "https://registry.npmjs.org/d3-shape/-/d3-shape-3.2.0.tgz",
+      "integrity": "sha512-SaLBuwGm3MOViRq2ABk3eLoxwZELpH6zhl3FbAoJ7Vm1gofKx6El1Ib5z23NUEhF9AsGl7y+dzLe5Cw2AArGTA==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-path": "^3.1.0"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-time": {
+      "version": "3.1.0",
+      "resolved": "https://registry.npmjs.org/d3-time/-/d3-time-3.1.0.tgz",
+      "integrity": "sha512-VqKjzBLejbSMT4IgbmVgDjpkYrNWUYJnbCGo874u7MMKIWsILRX+OpX/gTk8MqjpT1A/c6HY2dCA77ZN0lkQ2Q==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-array": "2 - 3"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-time-format": {
+      "version": "4.1.0",
+      "resolved": "https://registry.npmjs.org/d3-time-format/-/d3-time-format-4.1.0.tgz",
+      "integrity": "sha512-dJxPBlzC7NugB2PDLwo9Q8JiTR3M3e4/XANkreKSUxF8vvXKqm1Yfq4Q5dl8budlunRVlUUaDUgFt7eA8D6NLg==",
+      "license": "ISC",
+      "dependencies": {
+        "d3-time": "1 - 3"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/d3-timer": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/d3-timer/-/d3-timer-3.0.1.tgz",
+      "integrity": "sha512-ndfJ/JxxMd3nw31uyKoY2naivF+r29V+Lc0svZxe1JvvIRmi8hUsrMvdOwgS1o6uBHmiz91geQ0ylPP0aj1VUA==",
+      "license": "ISC",
+      "engines": {
+        "node": ">=12"
+      }
+    },
     "node_modules/data-urls": {
       "version": "5.0.0",
       "resolved": "https://registry.npmjs.org/data-urls/-/data-urls-5.0.0.tgz",
       "integrity": "sha512-ZYP5VBHshaDAiVZxjbRVcFJpc+4xGgT0bK3vzy1HLN8jTO975HEbuYzZJcHoQEY5K1a0z8YayJkyVETa08eNTg==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "whatwg-mimetype": "^4.0.0",
         "whatwg-url": "^14.0.0"
       },
@@ -4234,20 +4463,26 @@
         }
       }
     },
     "node_modules/decimal.js": {
       "version": "10.6.0",
       "resolved": "https://registry.npmjs.org/decimal.js/-/decimal.js-10.6.0.tgz",
       "integrity": "sha512-YpgQiITW3JXGntzdUmyUR1V812Hn8T1YVXhCu+wO3OpS4eU9l4YdD3qjyiKdV6mvV29zapkMeD390UVEf2lkUg==",
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/decimal.js-light": {
+      "version": "2.5.1",
+      "resolved": "https://registry.npmjs.org/decimal.js-light/-/decimal.js-light-2.5.1.tgz",
+      "integrity": "sha512-qIMFpTMZmny+MMIitAB6D7iVPEorVw6YQRWkvarTkT4tBeSLLiHzcwj6q0MmYSFCiVpiqPJTJEYIrpcPzVEIvg==",
+      "license": "MIT"
+    },
     "node_modules/decode-named-character-reference": {
       "version": "1.3.0",
       "resolved": "https://registry.npmjs.org/decode-named-character-reference/-/decode-named-character-reference-1.3.0.tgz",
       "integrity": "sha512-GtpQYB283KrPp6nRw50q3U9/VfOutZOe103qlN7BPP6Ad27xYnOIWv4lPzo8HCAL+mMZofJ9KEy30fq6MfaK6Q==",
       "license": "MIT",
       "dependencies": {
         "character-entities": "^2.0.0"
       },
       "funding": {
         "type": "github",
@@ -4588,20 +4823,31 @@
       "dependencies": {
         "es-errors": "^1.3.0",
         "get-intrinsic": "^1.2.6",
         "has-tostringtag": "^1.0.2",
         "hasown": "^2.0.2"
       },
       "engines": {
         "node": ">= 0.4"
       }
     },
+    "node_modules/es-toolkit": {
+      "version": "1.50.0",
+      "resolved": "https://registry.npmjs.org/es-toolkit/-/es-toolkit-1.50.0.tgz",
+      "integrity": "sha512-OyZKhUVvEep9ITEiwHn8GKnMRQIVqoSIX7WnRbkWgJkllCujilqP2rD0u979tkl8wqyc8ICwlc1UBVv/Sl1G6w==",
+      "license": "MIT",
+      "workspaces": [
+        "docs",
+        "benchmarks",
+        "tests/types"
+      ]
+    },
     "node_modules/esbuild": {
       "version": "0.25.12",
       "resolved": "https://registry.npmjs.org/esbuild/-/esbuild-0.25.12.tgz",
       "integrity": "sha512-bbPBYYrtZbkt6Os6FiTLCTFxvq4tt3JKall1vRwshA3fdVztsLAatFaZobhkBC8/BrPetoa0oksYoKXoG4ryJg==",
       "dev": true,
       "hasInstallScript": true,
       "license": "MIT",
       "bin": {
         "esbuild": "bin/esbuild"
       },
@@ -4881,20 +5127,26 @@
     "node_modules/etag": {
       "version": "1.8.1",
       "resolved": "https://registry.npmjs.org/etag/-/etag-1.8.1.tgz",
       "integrity": "sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">= 0.6"
       }
     },
+    "node_modules/eventemitter3": {
+      "version": "5.0.4",
+      "resolved": "https://registry.npmjs.org/eventemitter3/-/eventemitter3-5.0.4.tgz",
+      "integrity": "sha512-mlsTRyGaPBjPedk6Bvw+aqbsXDtoAyAzm5MO7JgU+yVRyMQ5O8bD4Kcci7BS85f93veegeCPkL8R4GLClnjLFw==",
+      "license": "MIT"
+    },
     "node_modules/eventsource": {
       "version": "3.0.7",
       "resolved": "https://registry.npmjs.org/eventsource/-/eventsource-3.0.7.tgz",
       "integrity": "sha512-CRT1WTyuQoD771GW56XEZFQ/ZoSfWid1alKGDYMmkt2yl8UXrVR4pspqWNEcqKvVIzg6PAltWjxcSSPrboA4iA==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "eventsource-parser": "^3.0.1"
       },
       "engines": {
@@ -5723,20 +5975,30 @@
     "node_modules/ignore": {
       "version": "5.3.2",
       "resolved": "https://registry.npmjs.org/ignore/-/ignore-5.3.2.tgz",
       "integrity": "sha512-hsBTNUqQTDwkWtcdYI2i06Y/nUBEsNEDJKjWdigLvegy8kDuJAS8uRlpkkcQpyEXL0Z/pjDy5HBmMjRCJ2gq+g==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">= 4"
       }
     },
+    "node_modules/immer": {
+      "version": "11.1.16",
+      "resolved": "https://registry.npmjs.org/immer/-/immer-11.1.16.tgz",
+      "integrity": "sha512-Xs7H9rBc+kti1J6RueUvbEBkmOz7jqj11XYgf+YMXAYzu8EeE7hwZ9poLXdVfVnGmJu7QAf41T7H2KuF6QoK6Q==",
+      "license": "MIT",
+      "funding": {
+        "type": "opencollective",
+        "url": "https://opencollective.com/immer"
+      }
+    },
     "node_modules/import-fresh": {
       "version": "3.3.1",
       "resolved": "https://registry.npmjs.org/import-fresh/-/import-fresh-3.3.1.tgz",
       "integrity": "sha512-TR3KfrTZTYLPB6jUjfx6MF9WcWrHL9su5TObK4ZkYgBdWKPOFoSoQIdEuTuR82pmtxH2spWG9h6etwfr1pLBqQ==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "parent-module": "^1.0.0",
         "resolve-from": "^4.0.0"
       },
@@ -5773,20 +6035,29 @@
       "integrity": "sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==",
       "dev": true,
       "license": "ISC"
     },
     "node_modules/inline-style-parser": {
       "version": "0.2.7",
       "resolved": "https://registry.npmjs.org/inline-style-parser/-/inline-style-parser-0.2.7.tgz",
       "integrity": "sha512-Nb2ctOyNR8DqQoR0OwRG95uNWIC0C1lCgf5Naz5H6Ji72KZ8OcFZLz2P5sNgwlyoJ8Yif11oMuYs5pBQa86csA==",
       "license": "MIT"
     },
+    "node_modules/internmap": {
+      "version": "2.0.3",
+      "resolved": "https://registry.npmjs.org/internmap/-/internmap-2.0.3.tgz",
+      "integrity": "sha512-5Hh7Y1wQbvY5ooGgPbDaL5iYLAPzMTUrjMulskHLH6wnv/A+1q5rgEaiuqEjB+oxGXIVZs1FF+R/KPN3ZSQYYg==",
+      "license": "ISC",
+      "engines": {
+        "node": ">=12"
+      }
+    },
     "node_modules/ip-address": {
       "version": "10.4.0",
       "resolved": "https://registry.npmjs.org/ip-address/-/ip-address-10.4.0.tgz",
       "integrity": "sha512-oSK96Grm3aP6OrS263xVxbNDGVL7rzBtYdpGqlDG8iQdoenDoTs/nkki+DflYbAEE8Xl6o5YxhxlrKvI3nqKXQ==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">= 12"
       }
     },
@@ -8335,21 +8606,20 @@
         "scheduler": "^0.27.0"
       },
       "peerDependencies": {
         "react": "^19.2.7"
       }
     },
     "node_modules/react-is": {
       "version": "17.0.2",
       "resolved": "https://registry.npmjs.org/react-is/-/react-is-17.0.2.tgz",
       "integrity": "sha512-w2GsyukL62IJnlaff/nRegPQR94C/XXamvMWmSHRJ4y7Ts/4ocGRmTHvOs8PSE6pB3dWOrD/nueuU5sduBsQ4w==",
-      "dev": true,
       "license": "MIT",
       "peer": true
     },
     "node_modules/react-markdown": {
       "version": "10.1.0",
       "resolved": "https://registry.npmjs.org/react-markdown/-/react-markdown-10.1.0.tgz",
       "integrity": "sha512-qKxVopLT/TyA6BX3Ue5NwabOsAzm0Q7kAPwq6L+wWDwisYs7R8vZ0nRXqq6rkueboxpkjvLGU9fWifiX/ZZFxQ==",
       "license": "MIT",
       "dependencies": {
         "@types/hast": "^3.0.0",
@@ -8366,20 +8636,43 @@
       },
       "funding": {
         "type": "opencollective",
         "url": "https://opencollective.com/unified"
       },
       "peerDependencies": {
         "@types/react": ">=18",
         "react": ">=18"
       }
     },
+    "node_modules/react-redux": {
+      "version": "9.3.0",
+      "resolved": "https://registry.npmjs.org/react-redux/-/react-redux-9.3.0.tgz",
+      "integrity": "sha512-KQopgqFo/p/fgmAs5qz6p5RWaNAzq40WAu7fJIXnQpYxFPbJYtsJPWvGeF2rOBaY/kEuV77AVsX8TsQzKm+A/g==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/use-sync-external-store": "^0.0.6",
+        "use-sync-external-store": "^1.4.0"
+      },
+      "peerDependencies": {
+        "@types/react": "^18.2.25 || ^19",
+        "react": "^18.0 || ^19",
+        "redux": "^5.0.0"
+      },
+      "peerDependenciesMeta": {
+        "@types/react": {
+          "optional": true
+        },
+        "redux": {
+          "optional": true
+        }
+      }
+    },
     "node_modules/react-refresh": {
       "version": "0.17.0",
       "resolved": "https://registry.npmjs.org/react-refresh/-/react-refresh-0.17.0.tgz",
       "integrity": "sha512-z6F7K9bV85EfseRCp2bzrpyQ0Gkw1uLoCel9XBVWPg/TjRj94SkJzUTGfOa4bs7iJvBWtQG0Wq7wnI0syw3EBQ==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=0.10.0"
       }
     },
@@ -8431,34 +8724,79 @@
         "ast-types": "^0.16.1",
         "esprima": "~4.0.0",
         "source-map": "~0.6.1",
         "tiny-invariant": "^1.3.3",
         "tslib": "^2.0.1"
       },
       "engines": {
         "node": ">= 4"
       }
     },
+    "node_modules/recharts": {
+      "version": "3.10.1",
+      "resolved": "https://registry.npmjs.org/recharts/-/recharts-3.10.1.tgz",
+      "integrity": "sha512-QXFrvt6IVcw7eeZCoyXTwkIJAX3Dv1nyVhMicXJ47GsGDDpcN8z6o644DibE9XjpBTThtsomLKnTV6lc+cVFUA==",
+      "license": "MIT",
+      "workspaces": [
+        "www"
+      ],
+      "dependencies": {
+        "@reduxjs/toolkit": "^1.9.0 || 2.x.x",
+        "clsx": "^2.1.1",
+        "decimal.js-light": "^2.5.1",
+        "es-toolkit": "^1.39.3",
+        "eventemitter3": "^5.0.1",
+        "immer": "^11.1.8",
+        "react-redux": "8.x.x || 9.x.x",
+        "reselect": "5.2.0",
+        "tiny-invariant": "^1.3.3",
+        "use-sync-external-store": "^1.2.2",
+        "victory-vendor": "^37.0.2"
+      },
+      "engines": {
+        "node": ">=18"
+      },
+      "peerDependencies": {
+        "react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0",
+        "react-dom": "^16.0.0 || ^17.0.0 || ^18.0.0 || ^19.0.0",
+        "react-is": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"
+      }
+    },
     "node_modules/redent": {
       "version": "3.0.0",
       "resolved": "https://registry.npmjs.org/redent/-/redent-3.0.0.tgz",
       "integrity": "sha512-6tDA8g98We0zd0GvVeMT9arEOnTw9qM03L9cJXaCjrip1OO764RDBLBfrB4cwzNGDj5OA5ioymC9GkizgWJDUg==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "indent-string": "^4.0.0",
         "strip-indent": "^3.0.0"
       },
       "engines": {
         "node": ">=8"
       }
     },
+    "node_modules/redux": {
+      "version": "5.0.1",
+      "resolved": "https://registry.npmjs.org/redux/-/redux-5.0.1.tgz",
+      "integrity": "sha512-M9/ELqF6fy8FwmkpnF0S3YKOqMyoWJ4+CS5Efg2ct3oY9daQvd/Pc71FpGZsVsbl3Cpb+IIcjBDUnnyBdQbq4w==",
+      "license": "MIT"
+    },
+    "node_modules/redux-thunk": {
+      "version": "3.1.0",
+      "resolved": "https://registry.npmjs.org/redux-thunk/-/redux-thunk-3.1.0.tgz",
+      "integrity": "sha512-NW2r5T6ksUKXCabzhL9z+h206HQw/NJkcLm1GPImRQ8IzfXwRGqjVhKJGauHirT0DAuyy6hjdnMZaRoAcy0Klw==",
+      "license": "MIT",
+      "peerDependencies": {
+        "redux": "^5.0.0"
+      }
+    },
     "node_modules/remark-parse": {
       "version": "11.0.0",
       "resolved": "https://registry.npmjs.org/remark-parse/-/remark-parse-11.0.0.tgz",
       "integrity": "sha512-FCxlKLNGknS5ba/1lmpYijMUzX2esxW5xQqjWxw2eHFfS2MSdaHVINFmhjo+qN1WhZhNimq0dZATN9pH0IDrpA==",
       "license": "MIT",
       "dependencies": {
         "@types/mdast": "^4.0.0",
         "mdast-util-from-markdown": "^2.0.0",
         "micromark-util-types": "^2.0.0",
         "unified": "^11.0.0"
@@ -9291,21 +9629,20 @@
       },
       "funding": {
         "type": "opencollective",
         "url": "https://opencollective.com/webpack"
       }
     },
     "node_modules/tiny-invariant": {
       "version": "1.3.3",
       "resolved": "https://registry.npmjs.org/tiny-invariant/-/tiny-invariant-1.3.3.tgz",
       "integrity": "sha512-+FbBPE1o9QAYvviau/qC5SE3caw21q3xkvWKBtja5vgqOWIHHJ3ioaq1VPfn/Szqctz2bU/oYeKd9/z5BL+PVg==",
-      "dev": true,
       "license": "MIT"
     },
     "node_modules/tinybench": {
       "version": "2.9.0",
       "resolved": "https://registry.npmjs.org/tinybench/-/tinybench-2.9.0.tgz",
       "integrity": "sha512-0+DUvqWMValLmha6lr4kD8iAMK1HzV0/aKnCtWb9v9641TnP/MFb7Pc2bxoxQjTXAErryXVgUOfv2YqNllqGeg==",
       "dev": true,
       "license": "MIT"
     },
     "node_modules/tinyexec": {
@@ -9843,20 +10180,42 @@
       "license": "MIT",
       "dependencies": {
         "@types/unist": "^3.0.0",
         "unist-util-stringify-position": "^4.0.0"
       },
       "funding": {
         "type": "opencollective",
         "url": "https://opencollective.com/unified"
       }
     },
+    "node_modules/victory-vendor": {
+      "version": "37.3.6",
+      "resolved": "https://registry.npmjs.org/victory-vendor/-/victory-vendor-37.3.6.tgz",
+      "integrity": "sha512-SbPDPdDBYp+5MJHhBCAyI7wKM3d5ivekigc2Dk2s7pgbZ9wIgIBYGVw4zGHBml/qTFbexrofXW6Gu4noGxrOwQ==",
+      "license": "MIT AND ISC",
+      "dependencies": {
+        "@types/d3-array": "^3.0.3",
+        "@types/d3-ease": "^3.0.0",
+        "@types/d3-interpolate": "^3.0.1",
+        "@types/d3-scale": "^4.0.2",
+        "@types/d3-shape": "^3.1.0",
+        "@types/d3-time": "^3.0.0",
+        "@types/d3-timer": "^3.0.0",
+        "d3-array": "^3.1.6",
+        "d3-ease": "^3.0.1",
+        "d3-interpolate": "^3.0.1",
+        "d3-scale": "^4.0.2",
+        "d3-shape": "^3.1.0",
+        "d3-time": "^3.0.0",
+        "d3-timer": "^3.0.1"
+      }
+    },
     "node_modules/vite": {
       "version": "6.4.3",
       "resolved": "https://registry.npmjs.org/vite/-/vite-6.4.3.tgz",
       "integrity": "sha512-NTKlcQjlAK7MlQoyb6LgaqHc8sso/pVyUJYWMws3jg21uTJw/LddqIFPcPqP6PzpgbIcZyKI85sFE4HBrQDA8A==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "esbuild": "^0.25.0",
         "fdir": "^6.4.4",
         "picomatch": "^4.0.2",
diff --git a/frontend/package.json b/frontend/package.json
index 98131aa..6852196 100644
--- a/frontend/package.json
+++ b/frontend/package.json
@@ -19,20 +19,21 @@
     "@tanstack/react-query": "^5.60.0",
     "axios": "^1.7.0",
     "class-variance-authority": "^0.7.0",
     "clsx": "^2.1.1",
     "lucide-react": "^0.460.0",
     "motion": "^12.43.0",
     "react": "^19.0.0",
     "react-dom": "^19.0.0",
     "react-markdown": "^10.1.0",
     "react-router-dom": "^7.0.0",
+    "recharts": "^3.10.1",
     "sonner": "^2.0.7",
     "tailwind-merge": "^2.6.0",
     "tw-animate-css": "^1.4.0",
     "zustand": "^5.0.0"
   },
   "devDependencies": {
     "@eslint/js": "^9.15.0",
     "@tailwindcss/vite": "^4.0.0",
     "@testing-library/jest-dom": "^6.6.0",
     "@testing-library/react": "^16.1.0",
diff --git a/frontend/src/components/pipeline-stepper.tsx b/frontend/src/components/pipeline-stepper.tsx
new file mode 100644
index 0000000..15083e6
--- /dev/null
+++ b/frontend/src/components/pipeline-stepper.tsx
@@ -0,0 +1,67 @@
+import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
+
+import { cn } from "@/lib/utils";
+
+export type NodeStatus = "pending" | "running" | "completed" | "failed";
+
+interface PipelineStepperProps {
+  nodes: Record<string, NodeStatus>;
+}
+
+const STEPS = [
+  { key: "deterministic_scan", label: "Scanning" },
+  { key: "llm_analysis", label: "AI Analysis" },
+  { key: "risk_scoring", label: "Risk Scoring" },
+  { key: "report_generation", label: "Report Generation" },
+] as const;
+
+export function PipelineStepper({ nodes }: PipelineStepperProps) {
+  return (
+    <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 space-y-3">
+      <p className="text-sm font-medium">Pipeline Progress</p>
+      <div className="flex items-center justify-between gap-2">
+        {STEPS.map((step, idx) => {
+          const status = nodes[step.key] || "pending";
+          const isLast = idx === STEPS.length - 1;
+
+          return (
+            <div key={step.key} className="flex items-center gap-2 flex-1">
+              <div className="flex flex-col items-center gap-1.5 flex-1">
+                <div className={cn(
+                  "flex h-8 w-8 items-center justify-center rounded-full border-2",
+                  status === "pending" && "border-muted bg-muted/50",
+                  status === "running" && "border-warning bg-warning/10",
+                  status === "completed" && "border-success bg-success/10",
+                  status === "failed" && "border-destructive bg-destructive/10"
+                )}>
+                  {status === "pending" && <Circle className="h-4 w-4 text-muted-foreground" />}
+                  {status === "running" && <Loader2 className="h-4 w-4 text-warning animate-spin" />}
+                  {status === "completed" && <CheckCircle2 className="h-4 w-4 text-success" />}
+                  {status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
+                </div>
+                <span className={cn(
+                  "text-xs font-medium text-center",
+                  status === "pending" && "text-muted-foreground",
+                  status === "running" && "text-warning",
+                  status === "completed" && "text-success",
+                  status === "failed" && "text-destructive"
+                )}>
+                  {step.label}
+                </span>
+              </div>
+              {!isLast && (
+                <div className={cn(
+                  "h-0.5 flex-1 -mt-6",
+                  status === "completed" ? "bg-success" : "bg-muted"
+                )} />
+              )}
+            </div>
+          );
+        })}
+      </div>
+      <p className="text-xs text-muted-foreground text-center">
+        This typically takes 1-3 minutes. This page updates automatically.
+      </p>
+    </div>
+  );
+}
diff --git a/frontend/src/hooks/use-evaluations.ts b/frontend/src/hooks/use-evaluations.ts
index 9f358e3..fbde36b 100644
--- a/frontend/src/hooks/use-evaluations.ts
+++ b/frontend/src/hooks/use-evaluations.ts
@@ -1,30 +1,79 @@
 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
+import { useEffect, useRef, useState, useCallback } from "react";
 
 import { getEvaluations, createEvaluation, runEvaluation } from "@/services/evaluations";
 import type { CreateEvaluationRequest } from "@/types/api";
+import type { NodeStatus } from "@/components/pipeline-stepper";
 
 export function useEvaluations() {
   return useQuery({
     queryKey: ["evaluations"],
     queryFn: getEvaluations,
   });
 }
 
 export function useCreateEvaluation() {
   const qc = useQueryClient();
   return useMutation({
     mutationFn: (body: CreateEvaluationRequest) => createEvaluation(body),
     onSuccess: () => qc.invalidateQueries({ queryKey: ["evaluations"] }),
   });
 }
 
 export function useRunEvaluation() {
-  const qc = useQueryClient();
   return useMutation({
     mutationFn: (id: string) => runEvaluation(id),
-    onSuccess: () => {
-      qc.invalidateQueries({ queryKey: ["evaluations"] });
-      qc.invalidateQueries({ queryKey: ["reports"] });
-    },
   });
 }
+
+export function useEvaluationStream(evaluationId: string | undefined, enabled: boolean) {
+  const [nodes, setNodes] = useState<Record<string, NodeStatus>>({});
+  const [isDone, setIsDone] = useState(false);
+  const qc = useQueryClient();
+  const esRef = useRef<EventSource | null>(null);
+
+  const invalidateQueries = useCallback(() => {
+    qc.invalidateQueries({ queryKey: ["evaluations"] });
+    qc.invalidateQueries({ queryKey: ["reports"] });
+  }, [qc]);
+
+  useEffect(() => {
+    if (!enabled || !evaluationId || isDone) return;
+
+    const token = localStorage.getItem("access_token");
+    if (!token) return;
+
+    const baseUrl = import.meta.env.VITE_API_URL || "/api/v1";
+    const url = `${baseUrl}/evaluations/${evaluationId}/stream?token=${token}`;
+
+    const es = new EventSource(url);
+    esRef.current = es;
+
+    es.onmessage = (e) => {
+      const event = JSON.parse(e.data);
+
+      if (event.type === "node:start") {
+        setNodes((prev) => ({ ...prev, [event.node]: "running" }));
+      } else if (event.type === "node:complete") {
+        setNodes((prev) => ({ ...prev, [event.node]: "completed" }));
+      } else if (event.type === "node:failed") {
+        setNodes((prev) => ({ ...prev, [event.node]: "failed" }));
+      } else if (event.type === "evaluation:complete" || event.type === "evaluation:failed") {
+        setIsDone(true);
+        invalidateQueries();
+        es.close();
+      }
+    };
+
+    es.onerror = () => {
+      invalidateQueries();
+      es.close();
+    };
+
+    return () => {
+      es.close();
+    };
+  }, [evaluationId, enabled, isDone, invalidateQueries]);
+
+  return { nodes, isDone };
+}
diff --git a/frontend/src/pages/evaluation-detail.tsx b/frontend/src/pages/evaluation-detail.tsx
index b7a4960..1ef308a 100644
--- a/frontend/src/pages/evaluation-detail.tsx
+++ b/frontend/src/pages/evaluation-detail.tsx
@@ -23,21 +23,22 @@ import {
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import {
   Collapsible,
   CollapsibleContent,
   CollapsibleTrigger,
 } from "@/components/ui/collapsible";
 import { Separator } from "@/components/ui/separator";
 import { Skeleton } from "@/components/ui/skeleton";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
-import { useEvaluations } from "@/hooks/use-evaluations";
+import { PipelineStepper } from "@/components/pipeline-stepper";
+import { useEvaluations, useEvaluationStream } from "@/hooks/use-evaluations";
 import { useProjects } from "@/hooks/use-projects";
 import type { EvaluationStatus } from "@/types/api";
 import { riskColor, riskLabel } from "@/lib/utils";
 
 // ---------------------------------------------------------------------------
 // Shared constants
 // ---------------------------------------------------------------------------
 
 const STATUS_CONFIG: Record<
   EvaluationStatus,
@@ -304,20 +305,21 @@ export function EvaluationDetailPage() {
       ? projects.find((p) => p.id === evaluation.project_id)?.name ?? "Unknown Project"
       : evaluation.evaluation_type === "dataset"
         ? "Dataset Evaluation"
         : "Standalone Evaluation"
     : "";
 
   const status = (evaluation?.status.toLowerCase() ?? "pending") as EvaluationStatus;
   const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
   const StatusIcon = config.icon;
   const isRunning = status === "running";
+  const { nodes } = useEvaluationStream(evaluation?.id, isRunning);
 
   const nodeResults = evaluation?.node_results as Record<string, unknown> | null;
   const scanners = nodeResults?.scanners as Record<string, unknown> | undefined;
   const llmAnalysis = nodeResults?.llm_analysis as Record<string, unknown> | undefined;
 
   // Loading state
   if (isLoading) {
     return (
       <div className="space-y-6">
         <Skeleton className="h-5 w-48" />
@@ -394,32 +396,21 @@ export function EvaluationDetailPage() {
         <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
           <p className="text-sm font-medium text-warning mb-1">Completed with errors</p>
           <p className="text-sm text-foreground whitespace-pre-wrap">{evaluation.error_message}</p>
           <p className="text-xs text-muted-foreground mt-2">
             The risk score shown is based on deterministic scanners only. AI analysis was unavailable.
           </p>
         </div>
       )}
 
       {/* Pipeline stepper */}
-      {isRunning && (
-        <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 space-y-3">
-          <div className="flex items-center gap-2">
-            <Loader2 className="h-4 w-4 text-warning animate-spin" />
-            <p className="text-sm font-medium">Pipeline running&hellip;</p>
-          </div>
-          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
-            <div className="h-full w-1/3 rounded-full bg-warning animate-pulse" />
-          </div>
-          <p className="text-xs text-muted-foreground text-center">This typically takes 1-3 minutes. This page updates automatically.</p>
-        </div>
-      )}
+      {isRunning && <PipelineStepper nodes={nodes} />}
 
       {/* Tabbed content */}
       <Tabs defaultValue="findings">
         <TabsList>
           <TabsTrigger value="findings">Findings</TabsTrigger>
           <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
           <TabsTrigger value="report">Report</TabsTrigger>
         </TabsList>
 
         <TabsContent value="findings">
diff --git a/frontend/src/pages/project-detail.tsx b/frontend/src/pages/project-detail.tsx
new file mode 100644
index 0000000..ee1ed32
--- /dev/null
+++ b/frontend/src/pages/project-detail.tsx
@@ -0,0 +1,180 @@
+import { useMemo } from "react";
+import { useParams, Link } from "react-router-dom";
+import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
+
+import { Badge } from "@/components/ui/badge";
+import {
+  Breadcrumb,
+  BreadcrumbItem,
+  BreadcrumbLink,
+  BreadcrumbList,
+  BreadcrumbPage,
+  BreadcrumbSeparator,
+} from "@/components/ui/breadcrumb";
+import { Button } from "@/components/ui/button";
+import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Skeleton } from "@/components/ui/skeleton";
+import { useProjects } from "@/hooks/use-projects";
+import { useEvaluations } from "@/hooks/use-evaluations";
+import type { ProjectStatus } from "@/types/api";
+import { riskColor, riskLabel } from "@/lib/utils";
+
+const STATUS_VARIANT: Record<ProjectStatus, "default" | "secondary" | "destructive" | "success" | "warning"> = {
+  draft: "secondary",
+  submitted: "default",
+  evaluating: "warning",
+  evaluated: "default",
+  approved: "success",
+  rejected: "destructive",
+};
+
+function formatChartDate(iso: string) {
+  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
+}
+
+export function ProjectDetailPage() {
+  const { id } = useParams();
+  const { data: projects = [], isLoading: loadingProjects } = useProjects();
+  const { data: evaluations = [], isLoading: loadingEvals } = useEvaluations();
+
+  const project = projects.find((p) => p.id === id);
+
+  const chartData = useMemo(() => {
+    if (!id) return [];
+    return evaluations
+      .filter((e) => e.project_id === id && e.status === "completed" && e.risk_score != null)
+      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
+      .map((e) => ({
+        date: e.created_at,
+        score: e.risk_score!,
+        label: formatChartDate(e.created_at),
+      }));
+  }, [id, evaluations]);
+
+  const latestRiskScore = chartData.length > 0 ? chartData[chartData.length - 1]!.score : null;
+
+  const isLoading = loadingProjects || loadingEvals;
+
+  if (isLoading) {
+    return (
+      <div className="space-y-6">
+        <Skeleton className="h-5 w-48" />
+        <Skeleton className="h-24 w-full" />
+        <Skeleton className="h-64 w-full" />
+      </div>
+    );
+  }
+
+  if (!project) {
+    return (
+      <div className="flex flex-col items-center justify-center py-24 text-center">
+        <h2 className="text-lg font-semibold mb-2">Project not found</h2>
+        <p className="text-sm text-muted-foreground mb-4">
+          The project you're looking for doesn't exist or has been removed.
+        </p>
+        <Button variant="outline" size="sm" render={<Link to="/projects" />}>
+          Back to Projects
+        </Button>
+      </div>
+    );
+  }
+
+  return (
+    <div className="space-y-6">
+      <Breadcrumb>
+        <BreadcrumbList>
+          <BreadcrumbItem>
+            <BreadcrumbLink render={<Link to="/projects" />}>Projects</BreadcrumbLink>
+          </BreadcrumbItem>
+          <BreadcrumbSeparator />
+          <BreadcrumbItem>
+            <BreadcrumbPage>{project.name}</BreadcrumbPage>
+          </BreadcrumbItem>
+        </BreadcrumbList>
+      </Breadcrumb>
+
+      <div className="space-y-4">
+        <div className="flex items-start justify-between gap-4">
+          <div>
+            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
+            {project.description && (
+              <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
+            )}
+          </div>
+          <div className="flex items-center gap-2">
+            <Badge variant={STATUS_VARIANT[project.status]}>{project.status}</Badge>
+            {latestRiskScore != null && (
+              <div className="flex items-center gap-2 pl-3 border-l">
+                <span className={`text-lg font-bold font-mono ${riskColor(latestRiskScore)}`}>
+                  {latestRiskScore.toFixed(0)}
+                </span>
+                <span className={`text-xs font-medium ${riskColor(latestRiskScore)}`}>
+                  {riskLabel(latestRiskScore)}
+                </span>
+              </div>
+            )}
+          </div>
+        </div>
+      </div>
+
+      <Card>
+        <CardHeader>
+          <CardTitle className="text-base">Risk Trending</CardTitle>
+        </CardHeader>
+        <CardContent>
+          {chartData.length === 0 ? (
+            <div className="flex items-center justify-center py-16 text-center">
+              <p className="text-sm text-muted-foreground">No completed evaluations yet</p>
+            </div>
+          ) : chartData.length === 1 ? (
+            <div className="flex items-center justify-center py-16 text-center">
+              <p className="text-sm text-muted-foreground">
+                Run at least two evaluations to see a trend line
+              </p>
+            </div>
+          ) : (
+            <ResponsiveContainer width="100%" height={300}>
+              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
+                <XAxis
+                  dataKey="label"
+                  stroke="var(--muted-foreground)"
+                  fontSize={12}
+                  tickLine={false}
+                  axisLine={false}
+                />
+                <YAxis
+                  domain={[0, 100]}
+                  stroke="var(--muted-foreground)"
+                  fontSize={12}
+                  tickLine={false}
+                  axisLine={false}
+                />
+                <Tooltip
+                  contentStyle={{
+                    backgroundColor: "var(--card)",
+                    border: "1px solid var(--border)",
+                    borderRadius: "var(--radius)",
+                    color: "var(--foreground)",
+                  }}
+                  labelStyle={{ color: "var(--foreground)" }}
+                  itemStyle={{ color: "var(--chart-1)" }}
+                />
+                <ReferenceLine y={25} stroke="var(--success)" strokeDasharray="3 3" />
+                <ReferenceLine y={50} stroke="var(--warning)" strokeDasharray="3 3" />
+                <ReferenceLine y={75} stroke="var(--destructive)" strokeDasharray="3 3" />
+                <Line
+                  type="monotone"
+                  dataKey="score"
+                  stroke="var(--chart-1)"
+                  strokeWidth={2}
+                  dot={{ fill: "var(--chart-1)", r: 4 }}
+                  activeDot={{ r: 6 }}
+                />
+              </LineChart>
+            </ResponsiveContainer>
+          )}
+        </CardContent>
+      </Card>
+    </div>
+  );
+}
diff --git a/frontend/src/pages/projects.tsx b/frontend/src/pages/projects.tsx
index 7fc1d32..10e9be5 100644
--- a/frontend/src/pages/projects.tsx
+++ b/frontend/src/pages/projects.tsx
@@ -1,12 +1,13 @@
 import { FolderKanban, Github, Pencil, Plus, Search, Trash2 } from "lucide-react";
 import { useState, useMemo, type FormEvent } from "react";
+import { Link } from "react-router-dom";
 import { toast } from "sonner";
 
 import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
@@ -218,21 +219,25 @@ export function ProjectsPage() {
                 <TableHead>Status</TableHead>
                 <TableHead className="hidden lg:table-cell">Repository</TableHead>
                 <TableHead className="hidden md:table-cell">Description</TableHead>
                 <TableHead className="hidden sm:table-cell">Created</TableHead>
                 <TableHead className="w-24" />
               </TableRow>
             </TableHeader>
             <TableBody>
               {filteredProjects.map((p) => (
                 <TableRow key={p.id}>
-                  <TableCell className="font-medium">{p.name}</TableCell>
+                  <TableCell className="font-medium">
+                    <Link to={`/projects/${p.id}`} className="hover:underline underline-offset-4">
+                      {p.name}
+                    </Link>
+                  </TableCell>
                   <TableCell>
                     <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                   </TableCell>
                   <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                     {p.repo_full_name ? (
                       <a
                         href={p.repo_url ?? "#"}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="hover:underline flex items-center gap-1"
diff --git a/frontend/src/routes/index.tsx b/frontend/src/routes/index.tsx
index 57021fb..628c16d 100644
--- a/frontend/src/routes/index.tsx
+++ b/frontend/src/routes/index.tsx
@@ -1,34 +1,36 @@
 import { createBrowserRouter, Navigate } from "react-router-dom";
 
 import { AppLayout } from "@/layouts/app-layout";
 import { AuthCallbackPage } from "@/pages/auth-callback";
 import { DashboardPage } from "@/pages/dashboard";
 import { DatasetsPage } from "@/pages/datasets";
 import { EvaluationsPage } from "@/pages/evaluations";
 import { EvaluationDetailPage } from "@/pages/evaluation-detail";
 import { ProjectsPage } from "@/pages/projects";
+import { ProjectDetailPage } from "@/pages/project-detail";
 import { ReportsPage } from "@/pages/reports";
 import { ReportDetailPage } from "@/pages/report-detail";
 import { SettingsPage } from "@/pages/settings";
 
 export const router = createBrowserRouter([
   {
     path: "/auth/callback",
     element: <AuthCallbackPage />,
   },
   {
     path: "/",
     element: <AppLayout />,
     children: [
       { index: true, element: <DashboardPage /> },
       { path: "projects", element: <ProjectsPage /> },
+      { path: "projects/:id", element: <ProjectDetailPage /> },
       { path: "datasets", element: <DatasetsPage /> },
       { path: "evaluations", element: <EvaluationsPage /> },
       { path: "evaluations/:id", element: <EvaluationDetailPage /> },
       { path: "reports", element: <ReportsPage /> },
       { path: "reports/:id", element: <ReportDetailPage /> },
       { path: "settings", element: <SettingsPage /> },
     ],
   },
   {
     path: "*",
