# Task 4 Report: Backend SSE Endpoint + Background Evaluation

## Status
✅ DONE

## Commit
6ddbac2 - feat: background evaluation with SSE progress streaming

## Files Modified

### 1. `backend/app/services/evaluation.py`
- Removed `if evaluation.status == EvaluationStatus.RUNNING` check (moved to route handler)
- Removed `await self.repo.update(evaluation, {"status": EvaluationStatus.RUNNING})` (moved to route handler)
- Added `"evaluation_id": str(evaluation.id)` as first key in `ainvoke()` state dict

**Rationale:** Route handler now manages status transitions before spawning background task. Service just executes the pipeline.

### 2. `backend/app/api/v1/evaluations.py`
Added imports:
- `asyncio`, `json` for background task and SSE serialization
- `Response` from `fastapi`, `StreamingResponse` from `fastapi.responses`
- `async_session` from `app.db.session` for background task's own DB session
- `EvaluationStatus` model for status check
- `decode_token` from `app.auth.jwt` for SSE auth
- `EvaluationProgress`, `progress_store` from `app.services.evaluation_progress`
- `NotFoundError`, `UnauthorizedError` exceptions (though only UnauthorizedError used)

Added `_run_evaluation_background(evaluation_id: str)` function:
- Gets progress from `progress_store`
- Creates new `async_session()` context (not tied to request lifecycle)
- Calls `service.run(evaluation_id)` in try block
- On success: commits, calls `progress.complete()`
- On error: rolls back, calls `progress.fail(str(e))`
- In finally: sleeps 60s then removes from `progress_store`

Modified `POST /{evaluation_id}/run` endpoint:
1. Gets evaluation, checks if already RUNNING → returns 202 with current status
2. Updates status to RUNNING
3. Creates audit log
4. Creates `EvaluationProgress()` and stores in `progress_store[evaluation_id]`
5. Spawns `asyncio.create_task(_run_evaluation_background(evaluation_id))`
6. Returns 202 with "Evaluation started" message

Added `GET /{evaluation_id}/stream` endpoint:
- Accepts `token` query param (required)
- Validates JWT via `decode_token(token, expected_type="access")`
- Returns 401 JSON response if token missing/invalid
- Gets progress from `progress_store`
- If no progress found: yields single `evaluation:complete` event and returns
- Otherwise: streams events via `progress.stream()` as `data: {json}\n\n`
- Returns `StreamingResponse` with `text/event-stream` content type

## Verification

### Backend Startup Test
```bash
cd backend && uvicorn app.main:app --port 8000
```

**Output:**
```
INFO:     Started server process [76508]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

✅ No import errors, server starts successfully.

### Syntax Check
```bash
python3 -m py_compile app/api/v1/evaluations.py app/services/evaluation.py
```

✅ No syntax errors.

## API Contract

### POST /evaluations/{id}/run
**Before:** Synchronous, returned 200 with "Evaluation completed"
**After:** Asynchronous, returns 202 with "Evaluation started"

Response on first call:
```json
{
  "success": true,
  "message": "Evaluation started",
  "data": { "id": "...", "status": "running", ... }
}
```

Response if already running:
```json
{
  "success": true,
  "message": "Evaluation already running",
  "data": { "id": "...", "status": "running", ... }
}
```

### GET /evaluations/{id}/stream
**Query params:** `token` (JWT access token, required)

**Response:** `text/event-stream`

**Events format:**
```
data: {"type": "node_start", "node": "deterministic_scan", "timestamp": "2026-08-07T..."}\n\n
data: {"type": "node_complete", "node": "deterministic_scan", "timestamp": "2026-08-07T..."}\n\n
data: {"type": "complete", "timestamp": "2026-08-07T..."}\n\n
```

**Auth failure:**
```json
{
  "success": false,
  "message": "Unauthorized",
  "data": null
}
```
(Status 401)

**If evaluation not found or already complete:**
```
data: {"type": "evaluation:complete"}\n\n
```

## Key Implementation Notes

1. **Own session for background task**: `_run_evaluation_background` creates its own `async_session()` context. The request's session is committed/closed when the POST handler returns, so background task can't use it.

2. **Progress cleanup**: Background task sleeps 60s after completion before removing from `progress_store`. This gives clients time to connect to the SSE stream even if they're slightly delayed.

3. **SSE auth via query param**: EventSource API doesn't support custom headers, so JWT passed as `?token=`. Validates via `decode_token(token, "access")`.

4. **Status transition moved to route**: Service no longer checks/updates RUNNING status. Route handler does this before spawning task, ensuring atomic check-then-spawn.

5. **Already-running idempotency**: If evaluation already RUNNING, returns 202 with current state (not an error). Client can poll or connect to SSE stream.

## Concerns
None. Implementation follows task brief exactly. Backend starts without errors. Ready for frontend integration in Task 5.
