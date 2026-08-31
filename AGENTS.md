# SenGuard

AI governance platform for evaluating LLM applications before deployment.

## Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy (async), Neon Postgres (asyncpg), LangGraph, Google Gemini
- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS v4, Zustand 5, React Query 5, React Router 7
- **Infra**: Podman (not Docker), Neon Postgres (remote)

## Repo layout

```
backend/
  app/
    main.py              # FastAPI entry, lifespan seeds roles + creates tables
    api/v1/              # Routes: health, auth, projects, evaluations, reports, datasets
    auth/                # JWT (HS256, python-jose), GitHub OAuth, get_current_user dependency
    models/              # SQLAlchemy: User, Role, Project, Evaluation, Dataset, Report, AuditLog
    schemas/             # Pydantic: auth (GitHubCallbackRequest, RefreshRequest, TokenResponse), project, evaluation, report, dataset
    repositories/        # BaseRepository (generic CRUD), User, Project, Evaluation, Report, Dataset repos
    services/            # Auth (GitHub OAuth + JWT), Project, Evaluation, Report, Dataset services
    langgraph/           # 5-node evaluation pipeline (stubs): prompt_security → dataset_validation → model_evaluation → risk_scoring → report_generation
    config/              # Pydantic Settings from env vars
    core/                # AppError exceptions, structured logging, success() response helper
    middleware/          # error_handler (AppError → JSON), rate_limit (slowapi)
    db/base.py           # UUIDMixin, TimestampMixin, declarative base
    storage/             # StorageBackend ABC + local implementation
  tests/                 # test_auth, test_health, test_rbac, test_storage + conftest
  requirements/          # base.txt, dev.txt, prod.txt (no deps in pyproject.toml)
frontend/
  src/
    main.tsx             # QueryClientProvider + RouterProvider (no App.tsx)
    routes/index.tsx     # Browser router: /auth/callback, / (dashboard), /projects, /datasets, /evaluations, /reports, /settings
    layouts/app-layout.tsx  # Sidebar + mobile sheet + header
    pages/               # Dashboard, Projects, Datasets, Evaluations, Reports, Settings, AuthCallback
    components/ui/       # shadcn/ui pattern: Button, Card, Badge, Input, Label, Table, Dialog, Select, Textarea, Avatar, Separator, Skeleton, Sheet
    services/            # api.ts (axios + interceptors), projects.ts, evaluations.ts, reports.ts, datasets.ts
    hooks/               # use-projects, use-evaluations, use-reports, use-datasets (React Query), use-auth (dead code)
    store/               # auth.ts (Zustand, localStorage tokens), theme.ts (light/dark toggle)
    types/api.ts         # ApiResponse<T>, AuthResponse, User, Project, Evaluation, Report, Dataset, CreateProjectRequest
    styles/globals.css   # Tailwind v4 theme tokens (Governance Violet palette)
    lib/utils.ts         # cn() = clsx + twMerge
```

## Key patterns

- All API responses use envelope: `{ success: bool, message: str, data: T }`
- Auth: GitHub OAuth → JWT access (30min) + refresh (7d) tokens in localStorage. 401 → hard redirect to /login
- Login flow: redirect to GitHub → callback with code → POST /auth/github/callback → JWT tokens
- Rate limiting: slowapi on sensitive endpoints (e.g., 10/min on token refresh)
- Error handling: AppError hierarchy (NotFoundError, UnauthorizedError) → JSON via middleware
- Frontend design: "Governance Violet" — violet primary (#7C3AED light / #A78BFA dark), status colors: success (emerald), warning (amber), destructive (rose)
- Components follow shadcn/ui convention: forwardRef + cn() + cva variants
- Tailwind v4: CSS-based config via `@theme` in globals.css, not JS config file. Dark mode via `.dark` class

## Data model

```
roles 1──* users (role_id FK)
users 1──* projects (owner_id FK)
projects 1──* evaluations (project_id FK)
projects 1──* datasets (project_id FK)
evaluations 1──1 reports (evaluation_id FK, unique)
users 1──* reports (reviewer_id FK, nullable)
users 1──* audit_logs (user_id FK, nullable)
```

User model has: github_id (BigInteger, unique), github_username, email, avatar_url

Enums: ProjectStatus (draft→submitted→evaluating→evaluated→approved/rejected), EvaluationStatus (pending→running→completed/failed), ReportStatus (draft→published→archived), RoleEnum (admin/developer/reviewer)

## What's implemented vs stub

**Working**: GitHub OAuth login (redirect + callback), JWT lifecycle (access + refresh), role seeding on startup, health checks, rate limiting (slowapi), error handling middleware, CORS (localhost:5173), full frontend shell with all pages

**Backend CRUD implemented**: Projects (create, list, get, update, delete with ownership), Evaluations (create, list, get, run, status), Reports (list, get, approve, reject, export), Datasets (create with upload, list, get, delete)

**Stubs**: LangGraph pipeline nodes all return `{"status": "not_implemented"}`

**Not built yet**: LangGraph pipeline execution (real AI evaluation), background workers, user management API, RBAC enforcement beyond ownership, audit logging service, Alembic migrations, API pagination/filtering

## Commands

```bash
# Frontend
cd frontend && npm run dev          # Vite dev server on :5173
cd frontend && npm run build        # tsc + vite build
cd frontend && npm run lint         # eslint

# Backend
cd backend && uvicorn app.main:app --reload --port 8000
cd backend && pytest

# Full stack (Podman)
podman-compose up
```

## Env vars (.env at repo root)

DATABASE_URL, SECRET_KEY, ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS, ALGORITHM, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, VITE_API_URL, GEMINI_API_KEY, GEMINI_MODEL, STORAGE_BACKEND, STORAGE_LOCAL_PATH, CORS_ORIGINS, APP_ENV, APP_DEBUG

## Known issues

See GitHub issues. Key open ones: #4 Alembic psycopg2 driver not installed, #10 LangGraph nodes not implemented, #14 no background worker system, #19 no Alembic migrations, #20 low test coverage, #21 CI improvements needed, #33 user management endpoints missing, #25 audit logging service missing
