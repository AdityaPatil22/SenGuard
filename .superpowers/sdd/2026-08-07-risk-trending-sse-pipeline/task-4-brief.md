# Task 4: Backend SSE Endpoint + Background Evaluation

**Files:**
- Modify: `backend/app/api/v1/evaluations.py` (change run endpoint to 202 + background task, add SSE stream endpoint)
- Modify: `backend/app/services/evaluation.py` (pass evaluation_id to state, remove status-to-RUNNING update)

**Interfaces:**
- Consumes: `progress_store`, `EvaluationProgress` from `app.services.evaluation_progress` (created in Task 3), `EvaluationService`, `async_session` from `app.db.session`, `decode_token` from `app.auth.jwt`
- Produces:
  - `POST /evaluations/{id}/run` returns 202 with `{ success: true, message: "Evaluation started", data: {...} }`
  - `GET /evaluations/{id}/stream` returns `text/event-stream` with SSE events, auth via `?token=` query param

## Existing Code Context

### `backend/app/api/v1/evaluations.py` (current run endpoint)
```python
@router.post("/{evaluation_id}/run")
async def run_evaluation(
    evaluation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = EvaluationService(db)

    await create_audit_log(
        db,
        action="evaluation_started",
        resource_type="evaluation",
        resource_id=evaluation_id,
        user_id=current_user.id,
    )

    evaluation = await service.run(uuid.UUID(evaluation_id))
    return success(data=_serialize(evaluation), message="Evaluation completed")
```

### `backend/app/services/evaluation.py` — `run` method (current)
```python
async def run(self, evaluation_id: uuid.UUID) -> Evaluation:
    evaluation = await self.get(evaluation_id)

    if evaluation.status == EvaluationStatus.RUNNING:
        raise BadRequestError("Evaluation already running")

    await self.repo.update(evaluation, {"status": EvaluationStatus.RUNNING})

    try:
        # ... clones repo, loads dataset, runs pipeline via ainvoke ...
        result = await get_evaluation_workflow().ainvoke({
            "project_id": str(evaluation.project_id),
            # ... other state fields ...
        })
        # ... updates evaluation with results ...
    except Exception as e:
        await self.repo.update(evaluation, {"status": EvaluationStatus.FAILED, "error_message": str(e)})

    return evaluation
```

### `backend/app/db/session.py` (session factory)
```python
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

### `backend/app/auth/jwt.py` (decode_token)
```python
from app.auth.jwt import decode_token
# decode_token(token: str, expected_type: str) -> dict — raises on invalid
```

### `backend/app/core/response.py`
```python
def success(data=None, message="Success"):
    return {"success": True, "message": message, "data": data}
```

## Changes Required

### 1. `backend/app/services/evaluation.py`
- Remove the `if evaluation.status == EvaluationStatus.RUNNING` check and the `await self.repo.update(evaluation, {"status": EvaluationStatus.RUNNING})` line from `run()` — the route handler now handles this
- Add `"evaluation_id": str(evaluation.id),` as the first key in the dict passed to `ainvoke()`

### 2. `backend/app/api/v1/evaluations.py`
- Add imports: `asyncio`, `json`, `StreamingResponse` from `fastapi.responses`, `Response` from `starlette.responses`, `async_session` from `app.db.session`, `EvaluationProgress, progress_store` from `app.services.evaluation_progress`, `decode_token` from `app.auth.jwt`
- Note: `AsyncSession` from sqlalchemy is needed for the Depends type hint — check if already imported
- Add a module-level `_run_evaluation_background` async function that:
  1. Gets the progress from `progress_store`
  2. Opens a new `async_session()` context
  3. Calls `service.run(evaluation_id)` inside it
  4. Commits on success, calls `progress.complete()`
  5. Rolls back on error, calls `progress.fail(str(e))`
  6. In `finally`: sleeps 60s then removes from `progress_store`
- Change `run_evaluation` route to:
  1. Check if already running, return existing status if so
  2. Update status to RUNNING
  3. Create audit log
  4. Create `EvaluationProgress()` and store in `progress_store[evaluation_id]`
  5. Spawn `asyncio.create_task(_run_evaluation_background(...))`
  6. Return 202 response with serialized evaluation
- Add `stream_evaluation` endpoint at `GET /{evaluation_id}/stream`:
  1. Accept `token` query param
  2. Validate JWT via `decode_token(token, expected_type="access")` — return 401 if missing or invalid
  3. Get progress from `progress_store`
  4. Return `StreamingResponse` with `text/event-stream` content type
  5. If no progress found, emit single `evaluation:complete` event and return
  6. Otherwise iterate `progress.stream()` and yield `data: {json}\n\n` for each event

## Steps

- [ ] **Step 1: Update EvaluationService.run**

In `backend/app/services/evaluation.py`:
- Remove the RUNNING status check and the status-to-RUNNING update (3 lines)
- Add `"evaluation_id": str(evaluation.id),` to the ainvoke dict

- [ ] **Step 2: Update the run endpoint to return 202**

In `backend/app/api/v1/evaluations.py`:
- Add all new imports
- Add `_run_evaluation_background` function
- Replace `run_evaluation` route handler

- [ ] **Step 3: Add the SSE stream endpoint**

In `backend/app/api/v1/evaluations.py`:
- Add `stream_evaluation` route at `GET /{evaluation_id}/stream`

- [ ] **Step 4: Verify backend starts**

```bash
cd backend && timeout 5 uvicorn app.main:app --port 8000 2>&1 || true
```

Look for "Uvicorn running on" — no import errors.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/evaluations.py backend/app/services/evaluation.py
git commit -m "feat: background evaluation with SSE progress streaming"
```
