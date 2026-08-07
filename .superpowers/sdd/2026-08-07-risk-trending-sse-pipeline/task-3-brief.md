# Task 3: Backend SSE Progress Infrastructure

**Files:**
- Create: `backend/app/services/evaluation_progress.py`
- Modify: `backend/app/langgraph/nodes.py` (emit progress events from each node)
- Modify: `backend/app/langgraph/state.py` (add `evaluation_id` field)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `progress_store: dict[str, EvaluationProgress]` — module-level dict keyed by evaluation ID string
  - `EvaluationProgress` class with methods: `start_node(name: str)`, `complete_node(name: str)`, `fail_node(name: str, error: str)`, `complete()`, `fail(error: str)`, `stream() -> AsyncGenerator[dict, None]`
  - Updated node functions that call `progress_store` before/after execution

## Existing Code Context

### `backend/app/langgraph/state.py` (current full content)
```python
from typing import Any, TypedDict


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

    # Phase 1: deterministic scan results
    scanner_results: dict[str, Any]

    # Phase 2: LLM analysis
    llm_analysis_result: dict[str, Any]
    risk_score: float | None
    risk_breakdown: dict[str, Any] | None
    report: str | None
    error: str | None
    errors: list[str]
```

Add `evaluation_id: str | None` to the Inputs section.

### `backend/app/langgraph/nodes.py` (structure)
Has 4 async node functions: `deterministic_scan`, `llm_analysis`, `risk_scoring`, `report_generation`.

Each node follows this pattern:
```python
async def <node_name>(state: EvaluationState) -> EvaluationState:
    # ... do work ...
    # some nodes have try/except that catch errors and append to state["errors"]
    return state
```

For each node:
1. At the very start, get the progress tracker: `eval_id = state.get("evaluation_id")` then `progress = progress_store.get(eval_id) if eval_id else None`
2. Call `progress.start_node("<node_name>")` if progress exists
3. Before returning (after ALL code paths — both success and caught exceptions), call `progress.complete_node("<node_name>")` if progress exists
4. The nodes that catch exceptions (llm_analysis, risk_scoring, report_generation) already gracefully handle errors and continue — so they should call `complete_node` not `fail_node` since the pipeline continues

Add `from app.services.evaluation_progress import progress_store` to the imports.

## Steps

- [ ] **Step 1: Create the progress store module**

Create `backend/app/services/evaluation_progress.py` with:
- `EvaluationProgress` class using `asyncio.Event` for synchronization
- `_events: list[dict]` to accumulate events
- `_done: asyncio.Event` to signal stream end
- `_waiters: list[asyncio.Event]` for subscriber notification
- `_emit(event: dict)` that appends event with timestamp and notifies waiters
- `start_node(name)`, `complete_node(name)`, `fail_node(name, error)` that emit typed events
- `complete()` and `fail(error)` that emit terminal events and set `_done`
- `async stream()` generator that yields events, waits for new ones, sends keepalives every 30s, and stops when `_done` is set
- Module-level `progress_store: dict[str, EvaluationProgress] = {}`
- Module-level `PIPELINE_NODES = ["deterministic_scan", "llm_analysis", "risk_scoring", "report_generation"]`

- [ ] **Step 2: Add `evaluation_id` to EvaluationState**

In `backend/app/langgraph/state.py`, add to the TypedDict after `has_repo: bool`:
```python
    evaluation_id: str | None
```

- [ ] **Step 3: Wire progress events into each node**

In `backend/app/langgraph/nodes.py`:
- Add import: `from app.services.evaluation_progress import progress_store`
- For each of the 4 node functions, add progress tracking as described above

- [ ] **Step 4: Verify import**

```bash
cd backend && python -c "from app.services.evaluation_progress import progress_store, EvaluationProgress; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/evaluation_progress.py backend/app/langgraph/nodes.py backend/app/langgraph/state.py
git commit -m "feat: add evaluation progress store and wire nodes to emit events"
```
