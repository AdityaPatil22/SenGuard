# Task 2: Project Detail Page with Risk Trending Chart

**Files:**
- Create: `frontend/src/pages/project-detail.tsx`
- Modify: `frontend/src/routes/index.tsx` (add route)
- Modify: `frontend/src/pages/projects.tsx` (project name links to detail)

**Interfaces:**
- Consumes: `useProjects()` from `@/hooks/use-projects`, `useEvaluations()` from `@/hooks/use-evaluations`, `Evaluation` and `Project` types from `@/types/api`, `riskColor`/`riskLabel` from `@/lib/utils`
- Produces: `ProjectDetailPage` component exported from `frontend/src/pages/project-detail.tsx`, route at `/projects/:id`

## Existing Code Context

### Routes file (`frontend/src/routes/index.tsx`)
Currently has these children under `"/"`:
```tsx
{ index: true, element: <DashboardPage /> },
{ path: "projects", element: <ProjectsPage /> },
{ path: "datasets", element: <DatasetsPage /> },
{ path: "evaluations", element: <EvaluationsPage /> },
{ path: "evaluations/:id", element: <EvaluationDetailPage /> },
{ path: "reports", element: <ReportsPage /> },
{ path: "reports/:id", element: <ReportDetailPage /> },
{ path: "settings", element: <SettingsPage /> },
```

Add `{ path: "projects/:id", element: <ProjectDetailPage /> }` after the projects route.

### Projects page (`frontend/src/pages/projects.tsx`)
The project name cell is currently:
```tsx
<TableCell className="font-medium">{p.name}</TableCell>
```
Change to a Link. `Link` is already imported from `react-router-dom` on line 2 of the file.

### Available hooks
- `useProjects()` returns `{ data: Project[], isLoading }` — projects have `id`, `name`, `description`, `status`, `repo_url`, `created_at`
- `useEvaluations()` returns `{ data: Evaluation[], isLoading }` — evaluations have `id`, `project_id`, `status`, `risk_score`, `created_at`

### Theme tokens (use CSS variables, not hex)
- Chart line: `var(--chart-1)` 
- Card background: `var(--card)`, border: `var(--border)`, radius: `var(--radius)`
- Risk reference lines: `var(--success)` at 25, `var(--warning)` at 50, `var(--destructive)` at 75
- Text: `var(--foreground)`, `var(--muted-foreground)`

### Existing components to reuse
- `Badge` from `@/components/ui/badge` with variants: `default`, `secondary`, `destructive`, `success`, `warning`
- `Breadcrumb`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbList`, `BreadcrumbPage`, `BreadcrumbSeparator` from `@/components/ui/breadcrumb`
- `Button` from `@/components/ui/button` — uses `render` prop for Link: `<Button render={<Link to="..." />}>`
- `Card`, `CardContent`, `CardHeader`, `CardTitle` from `@/components/ui/card`
- `Skeleton` from `@/components/ui/skeleton`

### STATUS_VARIANT map (copy from projects.tsx)
```tsx
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  submitted: "default",
  evaluating: "warning",
  evaluated: "default",
  approved: "success",
  rejected: "destructive",
};
```

## Steps

- [ ] **Step 1: Create the project detail page**

Create `frontend/src/pages/project-detail.tsx` with:
- Breadcrumb: Projects > {project.name}
- Header: project name, description, status badge, latest risk score
- Risk trending chart: Recharts `LineChart` in a `ResponsiveContainer` (height 300)
  - X axis: `created_at` formatted as "Mon DD"
  - Y axis: 0-100 risk score
  - Reference lines at 25 (success), 50 (warning), 75 (destructive)
  - Line with `type="monotone"`, stroke `var(--chart-1)`, strokeWidth 2, dots
  - Tooltip with card-like styling using CSS variables
- Empty states: "No completed evaluations yet" (0 evals) or "Run at least two evaluations to see a trend line" (1 eval)
- Not found state with back button
- Loading skeleton state
- Data: filter evaluations by `project_id === id`, status `completed`, `risk_score != null`, sort by `created_at` ascending

- [ ] **Step 2: Add route**

In `frontend/src/routes/index.tsx`:
- Import `ProjectDetailPage` from `@/pages/project-detail`
- Add `{ path: "projects/:id", element: <ProjectDetailPage /> }` after the projects route

- [ ] **Step 3: Link project names to detail page**

In `frontend/src/pages/projects.tsx`, change:
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

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build
```

Expected: clean build, no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/project-detail.tsx frontend/src/routes/index.tsx frontend/src/pages/projects.tsx
git commit -m "feat: add project detail page with risk trending chart"
```
