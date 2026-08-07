# SenGuard Features

## 1. Authentication & Authorization

### GitHub OAuth Login
Single sign-on via GitHub. The frontend redirects to GitHub, receives a callback code, and exchanges it for JWT tokens via `POST /api/v1/auth/github/callback`. User records are created/updated with GitHub profile data (username, email, avatar). An optional `ADMIN_GITHUB_USERNAME` env var auto-promotes a specific user to admin on login.

### JWT Token Lifecycle
Access tokens (HS256, 30-minute expiry) and refresh tokens (7-day expiry) stored in localStorage. The frontend axios interceptor automatically refreshes expired access tokens and queues concurrent requests during refresh. Refresh failures trigger logout and clear the React Query cache. Token refresh is rate-limited to 10 requests/minute.

### Role-Based Access Control (RBAC)
Three roles: **admin**, **developer**, **reviewer**. A `require_roles()` dependency enforces role checks on backend endpoints. Reviewer/admin roles are required for report approval/rejection. Admin role is required for user management and audit log access. The frontend `useCanReview()` hook gates approve/reject buttons.

---

## 2. Project Management

### Project CRUD
Full create, read, update, delete operations with ownership enforcement. Projects have a name, description, and optional GitHub repository URL. Non-admin users can only see and modify their own projects.

### GitHub Repo Picker
When creating a project, the dialog fetches the user's GitHub repositories via their stored GitHub token. Users can search and select a repo, which auto-fills the project name, description, and repository URL.

### Project Detail Page
Accessible at `/projects/:id` via clickable project names. Displays project metadata, status badge, and the latest risk score. Features a **Risk Trending Chart** (Recharts LineChart) that plots risk scores from completed evaluations over time, with reference lines at the 25/50/75 risk thresholds. Requires two or more completed evaluations to render the trend line.

---

## 3. Dataset Management

### Dataset Upload & CRUD
Datasets are uploaded via multipart form with drag-and-drop support. Supported formats: CSV, JSON, JSONL, TSV, TXT. Datasets are decoupled from projects and can be independently managed. The backend stores files via a pluggable storage backend (local filesystem or Supabase).

### Dataset Evaluation
Uploaded datasets are scanned for PII (emails, phone numbers, SSNs, credit cards, IP addresses) during evaluation. Dataset samples (up to 50 rows) are sent to the LLM for quality, bias, and fitness-for-purpose analysis.

---

## 4. Evaluation System

### Evaluation Creation & Execution
Evaluations are created against either a project (application evaluation) or a dataset (dataset evaluation). Clicking "Run" triggers a background `asyncio` task that executes the full LangGraph pipeline. The endpoint returns `202 Accepted` immediately while the pipeline runs asynchronously.

### LangGraph Evaluation Pipeline
A 4-node sequential graph powered by LangGraph:

1. **Deterministic Scan** -- Runs all six scanners (secrets, PII, code patterns, LLM patterns, dependencies, file hygiene) against the repository files and/or dataset samples. Produces structured findings with severity, confidence, evidence, and recommendations.

2. **LLM Analysis** -- Sends scanner results plus source code context to Google Gemini. Interprets scanner findings in plain English and generates supplementary AI-assessed risks (architectural prompt injection, missing safeguards, business logic risks, data quality concerns) that automated scanners cannot catch.

3. **Risk Scoring** -- Computes a base risk score from scanner findings using weighted severity (critical=25, high=15, medium=8, low=3, capped at 100). Sends the score and context to Gemini for a justified adjustment of up to +/-10 points. Produces a final 0-100 risk score with risk level classification.

4. **Report Generation** -- Generates a structured markdown governance report via Gemini with sections: Executive Summary, Scanner Findings (grouped by category), AI-Assessed Risks, Risk Score Breakdown, and prioritized Recommendations. Every finding cites its source.

### GitHub Repo Cloning
For project evaluations with a repository URL, the backend performs a shallow clone (`--depth 1`), extracts up to 100K characters of key source files (prioritizing config files, then source code), and cleans up the clone after evaluation.

### Real-Time Pipeline Progress (SSE)
Server-Sent Events stream pipeline progress to the browser in real time. The backend's `EvaluationProgress` class accumulates node-level events (`node:start`, `node:complete`, `node:failed`) with asyncio synchronization. The frontend `useEvaluationStream` hook connects via EventSource and drives the `PipelineStepper` component -- a horizontal 4-step visual stepper with animated status icons (pending, spinning, checkmark, error) and color-coded connector lines. The stepper appears inline on the evaluations list page directly below the running evaluation's card.

---

## 5. Scanner System

Six specialized scanners run during the deterministic scan phase:

| Scanner | What It Detects | Method |
|---|---|---|
| **Secrets** | AWS keys, GitHub tokens, OpenAI keys, private keys, connection strings, JWT tokens | gitleaks binary (if available) + 10 regex patterns |
| **PII** | Emails, US phone numbers, SSNs, credit cards, IP addresses | Regex with masked evidence output |
| **Code Patterns** | `eval()`, `exec()`, `pickle.loads`, `innerHTML`, `shell=True`, SQL concatenation | Python AST analysis + JS/TS regex |
| **LLM Patterns** | Unsanitized prompt injection, missing timeouts, exposed system prompts, no output validation | Pattern matching on LLM API call sites |
| **Dependencies** | Known CVEs in Python (requirements.txt) and Node.js (package.json) packages | OSV.dev API queries with CVSS severity mapping |
| **File Hygiene** | Committed .env files, missing .gitignore, CORS wildcard origins, debug mode enabled | File existence and content checks |

Each finding includes: source scanner, severity (critical/high/medium/low), confidence level (verified/observed/potential-risk), category, description, recommendation, file path, line number, and evidence snippet.

---

## 6. Report System

### Automatic Report Generation
Reports are automatically created when an evaluation completes. The report content is the markdown governance report produced by the pipeline's report generation node. Reports are created in `in_review` status.

### Review Workflow
Reports follow a review workflow: `draft` -> `in_review` -> `approved` or `rejected`. Approval and rejection require reviewer or admin role. Rejections require a comment explaining what needs to change. All review actions are logged in the audit trail.

### Report Detail Page
Displays the full governance report as rendered markdown with dark mode support. Features a sticky header with status badge, risk score, and action buttons. Includes JSON export for downloading the complete report data.

---

## 7. Dashboard

The landing page provides an at-a-glance governance overview:

- **Stat Cards** -- Animated rolling counters for Projects, Evaluations, Reports, and Average Risk Score. Each card links to its respective page.
- **Active Evaluations** -- Lists running or failed evaluations requiring attention.
- **Needs Review** -- Reports in pending_review or in_review status with risk scores.
- **Recent Findings** -- Top 5 completed evaluations ranked by highest risk score.

---

## 8. Admin Features

### User Management
Admin-only panel in Settings. Lists all users with avatars, usernames, and emails. Admins can change any user's role (admin/developer/reviewer) and deactivate accounts. Self-modification is prevented.

### Audit Logging
Admin-only panel in Settings. Displays a filterable timeline of system events (evaluation runs, report approvals/rejections) with action type, resource badges, timestamps, and details.

---

## 9. Settings

- **Appearance** -- Light/dark theme toggle. Theme preference persisted to localStorage via Zustand store. Toggle also available in the header bar.
- **Account** -- Displays GitHub avatar, username, email, OAuth provider, role badge, and user ID. Sign out button.
- **User Management** -- Admin only (see above).
- **Audit Log** -- Admin only (see above).

---

## 10. Frontend Infrastructure

### Design System
"Governance Violet" theme built on Tailwind CSS v4 with CSS-based `@theme` tokens. Violet primary palette (`#7C3AED` light / `#A78BFA` dark), semantic status colors (emerald for success, amber for warning, rose for destructive). Dark mode via `.dark` class toggle.

### Component Library
shadcn/ui pattern components: Alert, AlertDialog, Avatar, Badge (5 variants), Breadcrumb, Button, Card, Collapsible, Counter, Dialog, DropdownMenu, Empty (empty states), Input, Label, Select, Separator, Sheet, Skeleton, Sonner (toasts), Spinner, Table, Tabs, Textarea.

### Layout
Collapsible sidebar (desktop) with sheet drawer (mobile). Navigation grouped into Dashboard, Setup (Projects, Datasets), Results (Evaluations, Reports), and Settings. Header with theme toggle and profile dropdown.

### State Management
Zustand for client state (auth tokens, theme preference). React Query 5 for all server state with automatic cache invalidation on mutations.

---

## 11. Backend Infrastructure

### Storage Backend
Pluggable storage via abstract `StorageBackend` class. Two implementations: **LocalStorage** (filesystem with path traversal protection) and **SupabaseStorage** (HTTP-based Supabase bucket integration). Configured via `STORAGE_BACKEND` env var.

### Error Handling
`AppError` exception hierarchy (NotFoundError, UnauthorizedError, ForbiddenError, BadRequestError) with middleware that converts exceptions to structured JSON responses. All API responses use the envelope format: `{ success, message, data }`.

### Rate Limiting
slowapi with IP-based rate limiting on sensitive endpoints (token refresh: 10/minute).

### Health Checks
`GET /api/v1/health` for basic liveness and `GET /api/v1/health/db` for database connectivity verification.

### Auto-Schema Sync
On startup, the application creates all tables, adds missing PostgreSQL enum values, and adds missing columns. Replaces Alembic migrations for development.

### API Documentation
Swagger UI (`/docs`) and ReDoc (`/redoc`) available when `APP_DEBUG` is enabled.
