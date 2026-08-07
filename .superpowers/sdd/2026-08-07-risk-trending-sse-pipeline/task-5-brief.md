# Task 5: Frontend SSE Subscription + Pipeline Stepper

**Files:**
- Create: `frontend/src/components/pipeline-stepper.tsx`
- Modify: `frontend/src/hooks/use-evaluations.ts` (add `useEvaluationStream` hook)
- Modify: `frontend/src/pages/evaluation-detail.tsx` (replace pulse bar with stepper)

**Interfaces:**
- Consumes: `EventSource` browser API, `VITE_API_URL` env var, existing evaluation detail page
- Produces:
  - `PipelineStepper` component that renders 4-step progress indicator
  - `useEvaluationStream(evaluationId: string | undefined, enabled: boolean)` hook returning `{ nodes: Record<string, NodeStatus>, isDone: boolean }`
  - `NodeStatus` type exported from pipeline-stepper: `"pending" | "running" | "completed" | "failed"`

## Existing Code Context

### `frontend/src/hooks/use-evaluations.ts` (current full content)
```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getEvaluations, createEvaluation, runEvaluation } from "@/services/evaluations";
import type { CreateEvaluationRequest } from "@/types/api";

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runEvaluation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evaluations"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
```

### Evaluation detail page — the section to replace (around lines 404-415)
```tsx
      {isRunning && (
        <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-warning animate-spin" />
            <p className="text-sm font-medium">Pipeline running&hellip;</p>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-warning animate-pulse" />
          </div>
          <p className="text-xs text-muted-foreground text-center">This typically takes 1-3 minutes. This page updates automatically.</p>
        </div>
      )}
```

Replace this entire block with:
```tsx
      {isRunning && <PipelineStepper nodes={nodes} />}
```

### SSE endpoint (created in Task 4)
`GET /evaluations/{id}/stream?token=<jwt>` returns `text/event-stream` with events:
- `data: {"type": "node:start", "node": "<name>"}\n\n`
- `data: {"type": "node:complete", "node": "<name>"}\n\n`
- `data: {"type": "node:failed", "node": "<name>", "error": "<msg>"}\n\n`
- `data: {"type": "evaluation:complete"}\n\n`
- `data: {"type": "evaluation:failed", "error": "<msg>"}\n\n`
- `data: {"type": "keepalive"}\n\n`

### Auth token location
JWT access token is stored in `localStorage.getItem("access_token")`.

### API base URL
`import.meta.env.VITE_API_URL || "/api/v1"`

### Available icons (already imported in evaluation-detail.tsx)
`CheckCircle2`, `Circle`, `Loader2`, `XCircle` from `lucide-react`

### Available util
`cn()` from `@/lib/utils` — clsx + twMerge

## Steps

- [ ] **Step 1: Create PipelineStepper component**

Create `frontend/src/components/pipeline-stepper.tsx`:
- Export `NodeStatus` type: `"pending" | "running" | "completed" | "failed"`
- 4 steps: `deterministic_scan` → "Scanning", `llm_analysis` → "AI Analysis", `risk_scoring` → "Risk Scoring", `report_generation` → "Report Generation"
- Each step shows an icon (Circle=pending, Loader2+spin=running, CheckCircle2=completed, XCircle=failed) and label
- Steps connected by lines that change color when completed
- Use cn() for conditional classes
- Wrapped in a bordered rounded div with "Pipeline Progress" heading

- [ ] **Step 2: Add useEvaluationStream hook**

In `frontend/src/hooks/use-evaluations.ts`:
- Add imports: `useEffect`, `useRef`, `useState`, `useCallback` from react
- Import `NodeStatus` type from `@/components/pipeline-stepper`
- Add `useEvaluationStream(evaluationId, enabled)` hook that:
  - Creates an `EventSource` to the SSE endpoint with JWT token as query param
  - Tracks node statuses in state
  - On `node:start` → set node to "running"
  - On `node:complete` → set node to "completed"
  - On `node:failed` → set node to "failed"
  - On `evaluation:complete` or `evaluation:failed` → set isDone, invalidate queries, close EventSource
  - On error → close EventSource, invalidate queries
  - Cleanup on unmount
  - Returns `{ nodes, isDone }`

- [ ] **Step 3: Update useRunEvaluation to not eagerly invalidate**

In `frontend/src/hooks/use-evaluations.ts`, change `useRunEvaluation` to:
```tsx
export function useRunEvaluation() {
  return useMutation({
    mutationFn: (id: string) => runEvaluation(id),
  });
}
```
The SSE stream's `evaluation:complete` event will handle cache invalidation.

- [ ] **Step 4: Wire stepper into evaluation detail page**

In `frontend/src/pages/evaluation-detail.tsx`:
- Add imports: `PipelineStepper` from `@/components/pipeline-stepper`, `useEvaluationStream` from `@/hooks/use-evaluations`
- After `const isRunning = ...`, add: `const { nodes } = useEvaluationStream(evaluation?.id, isRunning);`
- Replace the pulse bar block with: `{isRunning && <PipelineStepper nodes={nodes} />}`

- [ ] **Step 5: Verify build**

```bash
cd frontend && npm run build
```

Expected: clean build, no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/pipeline-stepper.tsx frontend/src/hooks/use-evaluations.ts frontend/src/pages/evaluation-detail.tsx
git commit -m "feat: SSE pipeline stepper with real-time node progress"
```
