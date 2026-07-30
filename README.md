# Sentinel AI

AI governance platform that evaluates LLM applications before deployment. Run security, quality, and risk assessments on your AI systems using a LangGraph pipeline powered by Google Gemini.

## Quick Start

```bash
cp .env.example .env   # configure DATABASE_URL, GITHUB_CLIENT_ID/SECRET, GEMINI_API_KEY
podman compose up --build
```

### Running Manually

**Backend** — requires Python 3.12+:

```bash
cd backend
pip install -r requirements/base.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend** — requires Node 18+:

```bash
cd frontend
npm install
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Swagger Docs | http://localhost:8000/docs |

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS v4, Zustand, React Query, shadcn/ui |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async), Pydantic v2 |
| AI Pipeline | LangGraph, Google Gemini |
| Database | Neon Postgres (asyncpg) |
| Auth | GitHub OAuth → JWT (access + refresh tokens) |
| Infra | Podman |

## Features

- **GitHub OAuth** — login via GitHub, JWT token lifecycle with auto-refresh
- **Project Management** — create, track, and manage AI projects through evaluation stages
- **Dataset Management** — upload and manage evaluation datasets (local or Supabase storage)
- **Evaluation Pipeline** — 5-stage LangGraph pipeline: prompt security → dataset validation → model evaluation → risk scoring → report generation
- **Reports** — auto-generated evaluation reports with approve/reject/export workflow
- **Dashboard** — overview stats and project status at a glance

## Env Vars

See [`.env.example`](.env.example) for the full list. Key ones:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection string |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials |
| `GEMINI_API_KEY` | Google Gemini for AI evaluations |
| `SECRET_KEY` | JWT signing key |
| `STORAGE_BACKEND` | `local` or `supabase` |

## Docs

- [Development Setup](docs/Development.md)
- [Architecture](docs/Architecture.md)
- [API Reference](docs/API.md)
- [Folder Structure](docs/FolderStructure.md)
- [Contributing](docs/CONTRIBUTING.md)

## License

MIT
