---
name: test-safe
description: Run laptop-safe test suite (60s, 512MB limit)
user-invocable: true
allowed-tools:
  - Bash
  - Read
---

Run the resource-aware test suite for BooksTrack backend:

```bash
npm run test:safe  # Both pools, 60s timeout, 512MB limit
```

**What this does:**
- Runs Workers pool smoke tests (workerd runtime)
- Runs Node pool unit/integration tests (with vi.spyOn support)
- 60-second timeout per pool
- 512MB memory limit (laptop-safe)

**Test Coverage:**
- ⚡ Workers pool: Pure functions, normalizers, utilities
- 🎯 Node pool: Handlers, services, repositories
- ✅ Total: 199 smoke tests + comprehensive unit tests

**Use this when:**
- Pre-commit validation
- Local development testing
- Resource-constrained environments (8GB RAM laptops)

**For CI/CD:** Use `npm test` for full parallel execution
