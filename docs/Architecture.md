# Architecture

## Overview

SenGuard follows a standard three-tier architecture:

1. **Frontend** — React SPA served by Nginx
2. **Backend** — FastAPI REST API
3. **Database** — PostgreSQL with Redis cache

## Evaluation Pipeline

AI governance evaluations run through a LangGraph workflow:

```
Prompt Security → Dataset Validation → Model Evaluation → Risk Scoring → Report Generation
```

Each node is independently implementable. The graph structure is defined in `backend/app/langgraph/graph.py`.

## Backend Patterns

- **Repository Pattern** — database access isolated in `repositories/`
- **Service Layer** — business logic in `services/`
- **Routes** — thin controllers that orchestrate request/response
- **Dependency Injection** — via FastAPI's `Depends()`

## Authentication

- JWT access + refresh tokens
- RBAC with three roles: Admin, Developer, Reviewer
- Auth middleware validates tokens and loads user context

## Storage

Abstract `StorageBackend` interface with `LocalStorage` implementation. Designed for later S3/MinIO swap.

## Database

- SQLAlchemy 2 async with asyncpg
- Alembic for migrations
- UUID primary keys, timestamp mixins
