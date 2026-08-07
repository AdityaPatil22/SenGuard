# Risk Trending Chart + SSE Pipeline Progress — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-project risk trending chart (Recharts) and real-time SSE pipeline progress for evaluations.

**Architecture:** Two independent features. Feature 1 adds a project detail page (`/projects/:id`) with a line chart plotting risk scores across evaluations — pure frontend, no backend changes. Feature 2 converts the synchronous evaluation run endpoint to a background asyncio task and adds an SSE stream endpoint (`/evaluations/{id}/stream`) that emits per-node progress events. The frontend subscribes via `EventSource` and renders a 4-step stepper.

**Tech Stack:** Recharts (new dep), FastAPI `StreamingResponse`, `asyncio.create_task`, `EventSource` browser API

## Global Constraints

- Python 3.12, FastAPI, SQLAlchemy async
- React 19, TypeScript, Vite 6, Tailwind CSS v4
- All API responses use envelope: `{ success: bool, message: str, data: T }`
- Frontend components follow shadcn/ui convention: forwardRef + cn() + cva variants
- Existing theme tokens: `--chart-1` through `--chart-5`, `--success`, `--warning`, `--destructive`
- No new database tables or schema changes

---

### Task 1: Install Recharts

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: nothing
- Produces: `recharts` available as import for Task 2

- [ ] **Step 1: Install recharts**

```bash
cd frontend && npm install recharts
```

- [ ] **Step 2: Verify import resolves**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no recharts-related errors

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add recharts dependency"
```

---

### Task 2: Project Detail Page with Risk Trending Chart

**Files:**
- Create: `frontend/src/pages/project-detail.tsx`
- Modify: `frontend/src/routes/index.tsx` (add route)
- Modify: `frontend/src/pages/projects.tsx` (project name links to detail)

**Interfaces:**
- Consumes: `useProjects()` from `@/hooks/use-projects`, `useEvaluations()` from `@/hooks/use-evaluations`, `Evaluation` and `Project` types from `@/types/api`, `riskColor`/`riskLabel` from `@/lib/utils`
- Produces: `ProjectDetailPage` component exported from `frontend/src/pages/project-detail.tsx`, route at `/projects/:id`

- [ ] **Step 1: Create the project detail page**

Create `frontend/src/pages/project-detail.tsx`:

```tsx
import { useParams, Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvaluations } from "@/hooks/use-evaluations";
import { useProjects } from "@/hooks/use-projects";
import { riskColor, riskLabel } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  submitted: "default",
  evaluating: "warning",
  evaluated: "default",
  approved: "success",
  rejected: "destructive",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const { data: projects = [], isLoading: loadingProjects } = useProjects();
  const { data: evaluations = [], isLoading: loadingEvals } = useEvaluations();

  const project = projects.find((p) => p.id === id);

  const projectEvals = evaluations
    .filter((e) => e.project_id === id && e.status === "completed" && e.risk_score != null)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const chartData = projectEvals.map((e) => ({
    date: formatDate(e.created_at),
    score: e.risk_score!,
    fullDate: formatFullDate(e.created_at),
    id: e.id,
  }));

  const latestScore = projectEvals.length > 0 ? projectEvals[projectEvals.length - 1].risk_score : null;

  if (loadingProjects || loadingEvals) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-lg font-semibold mb-2">Project not found</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The project you're looking for doesn't exist or has been removed.
        </p>
        <Button variant="outline" size="sm" render={<Link to="/projects" />}>
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/projects" />}>Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        <Badge variant={STATUS_VARIANT[project.status] ?? "secondary"}>{project.status}</Badge>
        {latestScore != null && (
          <span className={`text-sm font-semibold ${riskColor(latestScore)}`}>
            Latest: {latestScore.toFixed(0)}/100 · {riskLabel(latestScore)}
          </span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk Score Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length < 2 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {chartData.length === 0
                ? "No completed evaluations yet. Run an evaluation to see risk trends."
                : "Run at least two evaluations to see a trend line."}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--foreground)" }}
                  formatter={(value: number) => [`${value.toFixed(1)}`, "Risk Score"]}
                  labelFormatter={(_label, payload) =>
                    payload?.[0]?.payload?.fullDate ?? _label
                  }
                />
                <ReferenceLine y={25} stroke="var(--success)" strokeDasharray="3 3" />
                <ReferenceLine y={50} stroke="var(--warning)" strokeDasharray="3 3" />
                <ReferenceLine y={75} stroke="var(--destructive)" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "var(--chart-1)" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add route for project detail**

In `frontend/src/routes/index.tsx`, add after the `projects` route:

```tsx
import { ProjectDetailPage } from "@/pages/project-detail";
```

Add to the children array after `{ path: "projects", element: <ProjectsPage /> }`:

```tsx
{ path: "projects/:id", element: <ProjectDetailPage /> },
```

- [ ] **Step 3: Link project names to detail page**

In `frontend/src/pages/projects.tsx`, change the project name `<TableCell>` from:

```tsx
<TableCell className="font-medium">{p.name}</TableCell>
```

to:

```tsx
<TableCell className="font-medium">
  <Link to={`/projects/${p.id}`} className="hover:underline underline-offset-4">
    {p.name}
  </Link>
</TableCell>
```

Add `Link` to the existing `react-router-dom` import if not already present (it's already imported on line 2).

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build
```

Expected: clean build, no errors

- [ ] **Step 5: Manual test**

```bash
cd frontend && npm run dev
```

Open browser:
1. Navigate to `/projects` — project names should be clickable links
2. Click a project name — should navigate to `/projects/:id`
3. Project detail shows breadcrumb, project info, and risk chart (or empty state message if < 2 evaluations)
4. Chart renders with theme-appropriate colors in both light and dark mode
5. Reference lines visible at 25, 50, 75

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/project-detail.tsx frontend/src/routes/index.tsx frontend/src/pages/projects.tsx
git commit -m "feat: add project detail page with risk trending chart"
```

---

### Task 3: Backend SSE Progress Infrastructure

**Files:**
- Create: `backend/app/services/evaluation_progress.py`
- Modify: `backend/app/langgraph/nodes.py` (emit progress events from each node)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `progress_store: dict[str, EvaluationProgress]` — module-level dict keyed by evaluation ID
  - `EvaluationProgress` class with methods: `start_node(name: str)`, `complete_node(name: str)`, `fail_node(name: str, error: str)`, `complete()`, `fail(error: str)`, `stream() -> AsyncGenerator[str, None]`
  - Updated node functions that call `progress_store` before/after execution

- [ ] **Step 1: Create the progress store module**

Create `backend/app/services/evaluation_progress.py`:

```python
import asyncio
import logging
import time

logger = logging.getLogger(__name__)

PIPELINE_NODES = ["deterministic_scan", "llm_analysis", "risk_scoring", "report_generation"]


class EvaluationProgress:
    def __init__(self):
        self._events: list[dict] = []
        self._done = asyncio.Event()
        self._waiters: list[asyncio.Event] = []

    def _emit(self, event: dict):
        event.setdefault("timestamp", time.time())
        self._events.append(event)
        for w in self._waiters:
            w.set()

    def start_node(self, name: str):
        self._emit({"type": "node:start", "node": name})

    def complete_node(self, name: str):
        self._emit({"type": "node:complete", "node": name})

    def fail_node(self, name: str, error: str):
        self._emit({"type": "node:failed", "node": name, "error": error})

    def complete(self):
        self._emit({"type": "evaluation:complete"})
        self._done.set()

    def fail(self, error: str):
        self._emit({"type": "evaluation:failed", "error": error})
        self._done.set()

    async def stream(self):
        cursor = 0
        while True:
            while cursor < len(self._events):
                ev = self._events[cursor]
                cursor += 1
                yield ev

            if self._done.is_set():
                break

            waiter = asyncio.Event()
            self._waiters.append(waiter)
            try:
                await asyncio.wait_for(waiter.wait(), timeout=30.0)
            except asyncio.TimeoutError:
                yield {"type": "keepalive"}
            finally:
                self._waiters.remove(waiter)


progress_store: dict[str, EvaluationProgress] = {}
```

- [ ] **Step 2: Update LangGraph nodes to emit progress**

In `backend/app/langgraph/nodes.py`, add import at top:

```python
from app.services.evaluation_progress import progress_store
```

Then wrap each node function. For `deterministic_scan`, change:

```python
async def deterministic_scan(state: EvaluationState) -> EvaluationState:
    repo_files = state.get("repo_files") or []
```

to:

```python
async def deterministic_scan(state: EvaluationState) -> EvaluationState:
    eval_id = state.get("evaluation_id")
    progress = progress_store.get(eval_id) if eval_id else None
    if progress:
        progress.start_node("deterministic_scan")

    repo_files = state.get("repo_files") or []
```

And before the `return state` at end of `deterministic_scan`:

```python
    if progress:
        progress.complete_node("deterministic_scan")
    return state
```

Apply the same pattern to `llm_analysis`, `risk_scoring`, and `report_generation`. Each gets:
- `progress.start_node("<node_name>")` at the start
- `progress.complete_node("<node_name>")` before return
- In the `except` blocks that already exist: `progress.fail_node("<node_name>", str(e))` (the node still continues — existing error handling appends to `state["errors"]` and the pipeline proceeds, so use `complete_node` not `fail_node` for recoverable errors; use `fail_node` only if you want to flag it as degraded)

Since `llm_analysis`, `risk_scoring`, and `report_generation` already catch exceptions and continue, call `complete_node` after both the try and except paths (before return). This reflects that the node finished (possibly degraded), not that it hard-failed.

- [ ] **Step 3: Add `evaluation_id` to EvaluationState**

In `backend/app/langgraph/state.py`, add to the `EvaluationState` TypedDict:

```python
    evaluation_id: str | None
```

- [ ] **Step 4: Verify backend starts**

```bash
cd backend && python -c "from app.services.evaluation_progress import progress_store, EvaluationProgress; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/evaluation_progress.py backend/app/langgraph/nodes.py backend/app/langgraph/state.py
git commit -m "feat: add evaluation progress store and wire nodes to emit events"
```

---

### Task 4: Backend SSE Endpoint + Background Evaluation

**Files:**
- Modify: `backend/app/api/v1/evaluations.py` (change run endpoint to 202 + background task, add SSE stream endpoint)
- Modify: `backend/app/services/evaluation.py` (extract run logic to accept progress, pass evaluation_id to state)

**Interfaces:**
- Consumes: `progress_store`, `EvaluationProgress` from `app.services.evaluation_progress`, `EvaluationService` from `app.services.evaluation`
- Produces:
  - `POST /evaluations/{id}/run` returns 202 with `{ success: true, data: { id, status: "running" } }`
  - `GET /evaluations/{id}/stream` returns `text/event-stream` with SSE events

- [ ] **Step 1: Update EvaluationService.run to pass evaluation_id into state**

In `backend/app/services/evaluation.py`, in the `run` method, change the `ainvoke` call to include `evaluation_id`:

```python
                result = await get_evaluation_workflow().ainvoke(
                    {
                        "evaluation_id": str(evaluation.id),
                        "project_id": str(evaluation.project_id),
```

(Add `"evaluation_id": str(evaluation.id),` as the first key in the dict passed to `ainvoke`.)

- [ ] **Step 2: Make the run endpoint return 202 and spawn background task**

Replace the `run_evaluation` function in `backend/app/api/v1/evaluations.py`:

```python
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from starlette.responses import Response

import asyncio
import json
import uuid

from app.auth.dependencies import get_current_user
from app.core.response import success
from app.db.session import get_db, async_session
from app.models.user import User
from app.schemas.evaluation import EvaluationCreate
from app.services.audit import create_audit_log
from app.services.evaluation import EvaluationService
from app.services.evaluation_progress import EvaluationProgress, progress_store

router = APIRouter(prefix="/evaluations", tags=["evaluations"])
```

Replace the `run_evaluation` route handler:

```python
async def _run_evaluation_background(evaluation_id: uuid.UUID):
    progress = progress_store.get(str(evaluation_id))
    try:
        async with async_session() as db:
            try:
                service = EvaluationService(db)
                await service.run(evaluation_id)
                await db.commit()
                if progress:
                    progress.complete()
            except Exception:
                await db.rollback()
                raise
    except Exception as e:
        if progress:
            progress.fail(str(e))
    finally:
        await asyncio.sleep(60)
        progress_store.pop(str(evaluation_id), None)


@router.post("/{evaluation_id}/run")
async def run_evaluation(
    evaluation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = EvaluationService(db)
    evaluation = await service.get(uuid.UUID(evaluation_id))

    if evaluation.status == "running":
        return success(
            data={"id": str(evaluation.id), "status": "running"},
            message="Evaluation already running",
        )

    await service.repo.update(evaluation, {"status": "running"})

    await create_audit_log(
        db,
        action="evaluation_started",
        resource_type="evaluation",
        resource_id=evaluation_id,
        user_id=current_user.id,
    )

    progress = EvaluationProgress()
    progress_store[evaluation_id] = progress

    asyncio.create_task(_run_evaluation_background(uuid.UUID(evaluation_id)))

    return Response(
        content=json.dumps({"success": True, "message": "Evaluation started", "data": _serialize(evaluation)}),
        status_code=202,
        media_type="application/json",
    )
```

- [ ] **Step 3: Update EvaluationService.run to not set status to RUNNING**

In `backend/app/services/evaluation.py`, the `run` method currently does:

```python
        await self.repo.update(evaluation, {"status": EvaluationStatus.RUNNING})
```

Remove this line — the route handler now sets status to RUNNING before spawning the task. The `run` method should only do the pipeline execution and final status update.

Also, the `except` block at the end of `run` already handles FAILED status. Ensure the `run` method re-fetches the evaluation since it may be in a different session:

Change the beginning of the `run` method from:

```python
    async def run(self, evaluation_id: uuid.UUID) -> Evaluation:
        evaluation = await self.get(evaluation_id)

        if evaluation.status == EvaluationStatus.RUNNING:
            raise BadRequestError("Evaluation already running")

        await self.repo.update(evaluation, {"status": EvaluationStatus.RUNNING})
```

to:

```python
    async def run(self, evaluation_id: uuid.UUID) -> Evaluation:
        evaluation = await self.get(evaluation_id)
```

- [ ] **Step 4: Add the SSE stream endpoint**

Add to `backend/app/api/v1/evaluations.py`, after the run endpoint:

```python
@router.get("/{evaluation_id}/stream")
async def stream_evaluation(
    evaluation_id: str,
    _current_user: User = Depends(get_current_user),
):
    progress = progress_store.get(evaluation_id)

    async def event_stream():
        if not progress:
            yield f"data: {json.dumps({'type': 'evaluation:complete'})}\n\n"
            return

        async for event in progress.stream():
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

- [ ] **Step 5: Add `async_session` to the import in evaluations.py**

The import line should now include `async_session`:

```python
from app.db.session import get_db, async_session
```

Also add the missing `AsyncSession` import from sqlalchemy since it's used by Depends(get_db):

```python
from sqlalchemy.ext.asyncio import AsyncSession
```

(Check if this import already exists — add only if missing.)

- [ ] **Step 6: Verify backend starts**

```bash
cd backend && uvicorn app.main:app --port 8000 &
sleep 3 && curl -s http://localhost:8000/api/v1/health | python -m json.tool
kill %1
```

Expected: health check returns success

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/evaluations.py backend/app/services/evaluation.py
git commit -m "feat: background evaluation with SSE progress streaming"
```

---

### Task 5: Frontend SSE Subscription + Pipeline Stepper

**Files:**
- Create: `frontend/src/components/pipeline-stepper.tsx`
- Modify: `frontend/src/hooks/use-evaluations.ts` (add `useEvaluationStream` hook)
- Modify: `frontend/src/pages/evaluation-detail.tsx` (replace pulse bar with stepper)
- Modify: `frontend/src/services/evaluations.ts` (update `runEvaluation` to handle 202)

**Interfaces:**
- Consumes: `EventSource` browser API, `VITE_API_URL` env var, `Evaluation` type, existing evaluation detail page structure
- Produces:
  - `PipelineStepper` component that shows 4-node progress
  - `useEvaluationStream(evaluationId: string | undefined, enabled: boolean)` hook that returns `{ nodes: Record<string, NodeStatus>, isDone: boolean }`

- [ ] **Step 1: Create the PipelineStepper component**

Create `frontend/src/components/pipeline-stepper.tsx`:

```tsx
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type NodeStatus = "pending" | "running" | "completed" | "failed";

interface Step {
  key: string;
  label: string;
}

const STEPS: Step[] = [
  { key: "deterministic_scan", label: "Scanning" },
  { key: "llm_analysis", label: "AI Analysis" },
  { key: "risk_scoring", label: "Risk Scoring" },
  { key: "report_generation", label: "Report Generation" },
];

const STATUS_ICON = {
  pending: Circle,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
} as const;

const STATUS_STYLE = {
  pending: "text-muted-foreground",
  running: "text-warning",
  completed: "text-success",
  failed: "text-destructive",
} as const;

interface PipelineStepperProps {
  nodes: Record<string, NodeStatus>;
}

export function PipelineStepper({ nodes }: PipelineStepperProps) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <p className="text-sm font-medium">Pipeline Progress</p>
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const status = nodes[step.key] ?? "pending";
          const Icon = STATUS_ICON[status];
          return (
            <div key={step.key} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={cn(
                    "h-px w-6 sm:w-10",
                    status === "pending" ? "bg-border" : "bg-success",
                  )}
                />
              )}
              <div className="flex items-center gap-1.5">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    STATUS_STYLE[status],
                    status === "running" && "animate-spin",
                  )}
                />
                <span
                  className={cn(
                    "text-xs whitespace-nowrap",
                    status === "pending" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the useEvaluationStream hook**

Add to `frontend/src/hooks/use-evaluations.ts`:

```tsx
import { useEffect, useRef, useState, useCallback } from "react";
import type { NodeStatus } from "@/components/pipeline-stepper";

interface StreamState {
  nodes: Record<string, NodeStatus>;
  isDone: boolean;
}

export function useEvaluationStream(evaluationId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<StreamState>({ nodes: {}, isDone: false });
  const esRef = useRef<EventSource | null>(null);
  const qc = useQueryClient();

  const cleanup = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !evaluationId) {
      cleanup();
      return;
    }

    const token = localStorage.getItem("access_token");
    const baseUrl = import.meta.env.VITE_API_URL || "/api/v1";
    const url = `${baseUrl}/evaluations/${evaluationId}/stream${token ? `?token=${token}` : ""}`;

    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "node:start") {
        setState((prev) => ({
          ...prev,
          nodes: { ...prev.nodes, [data.node]: "running" },
        }));
      } else if (data.type === "node:complete") {
        setState((prev) => ({
          ...prev,
          nodes: { ...prev.nodes, [data.node]: "completed" },
        }));
      } else if (data.type === "node:failed") {
        setState((prev) => ({
          ...prev,
          nodes: { ...prev.nodes, [data.node]: "failed" },
        }));
      } else if (data.type === "evaluation:complete" || data.type === "evaluation:failed") {
        setState((prev) => ({ ...prev, isDone: true }));
        qc.invalidateQueries({ queryKey: ["evaluations"] });
        qc.invalidateQueries({ queryKey: ["reports"] });
        cleanup();
      }
    };

    es.onerror = () => {
      cleanup();
      setState((prev) => ({ ...prev, isDone: true }));
      qc.invalidateQueries({ queryKey: ["evaluations"] });
    };

    return cleanup;
  }, [evaluationId, enabled, cleanup, qc]);

  return state;
}
```

- [ ] **Step 3: Add token-based auth to SSE endpoint**

`EventSource` doesn't support custom headers, so the SSE endpoint accepts the JWT as a query param. In `backend/app/api/v1/evaluations.py`, update the stream endpoint to validate via query param using the existing `decode_token` function:

```python
from app.auth.jwt import decode_token

@router.get("/{evaluation_id}/stream")
async def stream_evaluation(
    evaluation_id: str,
    token: str | None = Query(None),
):
    if not token:
        return Response(status_code=401)
    try:
        decode_token(token, expected_type="access")
    except Exception:
        return Response(status_code=401)

    progress = progress_store.get(evaluation_id)

    async def event_stream():
        if not progress:
            yield f"data: {json.dumps({'type': 'evaluation:complete'})}\n\n"
            return
        async for event in progress.stream():
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

This replaces the `stream_evaluation` from Task 4 Step 4 — don't add both.

- [ ] **Step 4: Update the evaluation detail page**

In `frontend/src/pages/evaluation-detail.tsx`:

Add imports:

```tsx
import { PipelineStepper } from "@/components/pipeline-stepper";
import { useEvaluationStream } from "@/hooks/use-evaluations";
```

Inside `EvaluationDetailPage`, after the existing `isRunning` variable, add:

```tsx
  const { nodes } = useEvaluationStream(evaluation?.id, isRunning);
```

Replace the existing pipeline stepper block (lines ~404-415, the `{isRunning && (` section with the pulsing bar) with:

```tsx
      {isRunning && <PipelineStepper nodes={nodes} />}
```

- [ ] **Step 5: Update runEvaluation service to handle 202**

In `frontend/src/services/evaluations.ts`, the existing `runEvaluation` function works as-is — axios treats 2xx responses the same way. No change needed. Verify the mutation in `use-evaluations.ts` doesn't assume synchronous completion — it currently invalidates queries `onSuccess`, which is correct since the SSE stream will trigger another invalidation when the evaluation actually completes.

However, update the `useRunEvaluation` hook to NOT invalidate eagerly (the SSE will handle final invalidation):

In `frontend/src/hooks/use-evaluations.ts`, change `useRunEvaluation`:

```tsx
export function useRunEvaluation() {
  return useMutation({
    mutationFn: (id: string) => runEvaluation(id),
  });
}
```

- [ ] **Step 6: Verify build**

```bash
cd frontend && npm run build
```

Expected: clean build, no errors

- [ ] **Step 7: Manual test**

1. Start backend: `cd backend && uvicorn app.main:app --reload --port 8000`
2. Start frontend: `cd frontend && npm run dev`
3. Create a project, create an evaluation, click "Run"
4. Evaluation detail page should show the PipelineStepper with nodes transitioning: pending → running → completed
5. When pipeline finishes, the page should auto-refresh with final results
6. Verify the run endpoint returns 202 (check Network tab in devtools)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/pipeline-stepper.tsx frontend/src/hooks/use-evaluations.ts frontend/src/pages/evaluation-detail.tsx frontend/src/services/evaluations.ts backend/app/api/v1/evaluations.py
git commit -m "feat: SSE pipeline stepper with real-time node progress"
```

---

### Task 6: End-to-End Verification

**Files:** none (testing only)

- [ ] **Step 1: Full flow test**

1. Start both servers
2. Login via GitHub OAuth
3. Create a project with a GitHub repo URL
4. Navigate to project detail (`/projects/:id`) — verify empty chart state
5. Create and run an evaluation for this project
6. Watch the pipeline stepper animate through all 4 nodes
7. After completion, navigate back to project detail — chart should show 1 data point with message "Run at least two evaluations to see a trend line"
8. Run another evaluation
9. Navigate to project detail — chart should now render with 2 data points and a trend line
10. Verify chart reference lines at 25/50/75
11. Verify dark mode renders correctly

- [ ] **Step 2: Edge case checks**

1. Navigate directly to `/projects/nonexistent-uuid` — should show "Project not found"
2. Open evaluation detail for a completed evaluation — stepper should not appear
3. Open evaluation detail for a failed evaluation — error banner should still show
4. Refresh the page while an evaluation is running — SSE should reconnect and show current state
