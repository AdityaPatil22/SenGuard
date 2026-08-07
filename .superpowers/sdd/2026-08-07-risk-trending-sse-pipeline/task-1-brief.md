# Task 1: Install Recharts

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: nothing
- Produces: `recharts` available as import for Task 2

## Steps

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
