---
name: validate
description: Pre-commit validation (smoke tests + lint)
user-invocable: true
allowed-tools:
  - Bash
  - Read
---

Run pre-commit validation checks for BooksTrack backend:

```bash
npm run validate  # Smoke tests + lint (5s)
```

**What this does:**
1. **Smoke tests** (5s) - Quick validation of critical paths
2. **Biome lint** - Code quality checks
3. **TypeScript check** - Type safety validation

**Quick validation includes:**
- ⚡ Workers pool smoke tests (199 tests)
- 📋 Linting with Biome
- 🔍 Type checking (453 remaining errors, all low-priority)

**Use this when:**
- Before every git commit
- Quick sanity check after code changes
- Verifying build passes

**Output:**
- ✅ All checks pass → Safe to commit
- ❌ Failures → Fix before committing

**Note:** This is the fastest validation cycle (5s). For comprehensive testing, use `/test-safe` (60s).
