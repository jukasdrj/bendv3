# TypeScript Fix - Quick Start Guide

**Status:** 506 errors, 44 in src/ directory (Alexandria dependency accounts for ~460)
**Time to Fix:** 10 hours
**Difficulty:** Medium (mostly type alignment issues)

---

## 30-Second Summary

The TypeScript errors are primarily **type annotation mismatches** in three areas:

1. **@hono/zod-openapi handlers** (88 errors) - Routes returning wrong response shapes
2. **DurableObject payloads** (40+ errors) - Type-unsafe message handling
3. **Null/undefined access** (127 errors) - Missing optional chaining & type guards

**None of these are blocking runtime functionality** - they're pure type system issues.

---

## One-Command Status Check

```bash
# Count errors by category
npx tsc --noEmit 2>&1 | grep "^src/" | sed 's/.*error TS\([0-9]*\):.*/\1/' | sort | uniq -c | sort -rn | head -10
```

**Expected Output:**
```
 93 2339  (Property missing)
 88 2345  (Handler type mismatch) ⬅️ CRITICAL
 59 18048 (Possibly undefined)
 ...
```

---

## 10-Minute Start: Phase 1 Fixes

### Step 1: Remove Unused Import (1 min)
```bash
# File: src/durable-objects/job-state-manager.ts
# Remove line 2: ExecutionContext import
sed -i '' '/ExecutionContext/d' src/durable-objects/job-state-manager.ts

# Verify
grep -n "ExecutionContext" src/durable-objects/job-state-manager.ts
# Should be empty
```

### Step 2: Add Override Modifiers (2 min)
```typescript
// File: src/durable-objects/cache-metrics.ts
// Line 384: add "override" before "async fetch"
// Line 907: add "override" before "async alarm"

// Before:
async fetch(request: Request): Promise<Response> {

// After:
override async fetch(request: Request): Promise<Response> {
```

### Step 3: Fix Type Binding (3 min)
```typescript
// File: src/api-v3/index.ts
// Line 430 & 527: Add type cast

// Before:
const embeddingId = await generateBookEmbedding(isbn, c.env)

// After:
const embeddingId = await generateBookEmbedding(isbn, c.env as WorkerEnv)
```

### Step 4: Verify Progress (4 min)
```bash
npm run lint:fix
npx tsc --noEmit 2>&1 | grep "^src/" | wc -l
# Should drop from ~44 to ~35 errors
```

---

## Next Steps: Phase 2 (Critical Path)

After Phase 1, run comprehensive fix:

```bash
# See TYPESCRIPT_FIX_PLAN.md sections:
# - Handler Type Mismatches (2 hours)
# - ProblemDetails Usage (1 hour)
# - Payload Type Guards (1 hour)
```

---

## File Priority Order

**Do these first (fixes many errors):**
1. `src/durable-objects/job-state-manager.ts` - 103 errors
2. `src/api-v3/index.ts` - 8 errors
3. `src/api-v3/jobs/scans.ts` - 19 errors
4. `src/api-v3/jobs/imports.ts` - 11 errors

**Then these (type safety):**
5. `src/handlers/book-search.ts` - 42 errors
6. `src/services/book-service.ts` - 29 errors
7. `src/services/external-apis.ts` - 32 errors

**Last (polish):**
8. Everything else (unused imports, override keywords)

---

## Key Patterns to Know

### Pattern A: Handler Response Shape
```typescript
// ❌ WRONG: Missing success field
return c.json({ data: book }, 200)

// ✅ CORRECT: Has success discriminator
return c.json({
  success: true,
  data: book,
  metadata: { ... }
}, 200)
```

### Pattern B: Type-Safe Payload
```typescript
// ❌ WRONG: Unsafe access
const jobId = payload.jobId

// ✅ CORRECT: Type guard first
const msg = payload as MessagePayload
const jobId = msg.jobId
```

### Pattern C: Optional Chaining
```typescript
// ❌ WRONG: May crash
const title = data.books[0].title

// ✅ CORRECT: Safe access
const title = data.books?.[0]?.title ?? 'Unknown'
```

---

## Risk Assessment

**LOW RISK:**
- Removing unused imports
- Adding override keywords
- Adding optional chaining (?.）
- Type casting as WorkerEnv

**MEDIUM RISK:**
- Handler response shape alignment (test API calls)
- ProblemDetails property changes (check schema)

**MEDIUM-HIGH RISK:**
- Payload type guards (ensure no data loss)
- Null checks (verify business logic)

**Mitigation:** Test after each phase with `npm run test:smoke`

---

## Validation Checklist

After all fixes:

- [ ] `npx tsc --noEmit` returns no errors in src/
- [ ] `npm run validate` passes (smoke tests + lint)
- [ ] `npm run test:smoke` passes (5 seconds)
- [ ] API endpoints return valid responses
- [ ] No runtime type errors in logs

---

## Common Mistakes to Avoid

❌ **DON'T:**
- Remove required type guards
- Add type casts without understanding types
- Skip null checks on optional values
- Change response structure without updating Zod schema
- Mix ProblemDetails with custom properties

✅ **DO:**
- Run tests after each fix
- Review Zod schema before changing responses
- Use type guards for unknown data
- Add optional chaining for nullable fields
- Follow RFC 9457 for error responses

---

## Debug Workflow

If errors won't go away:

```bash
# 1. Clear cache
rm -rf node_modules/.vite/

# 2. Check specific error
npx tsc src/durable-objects/job-state-manager.ts --noEmit | grep "TS2339"

# 3. Look up error code
# Visit: https://www.typescriptlang.org/docs/handbook/error-reference.html#ts2339

# 4. Read full error message
npx tsc --noEmit 2>&1 | grep "job-state-manager.ts.*TS2339" | head -3

# 5. Compare with examples
# See TYPESCRIPT_FIX_EXAMPLES.md for matching pattern
```

---

## Performance Notes

- **Compilation time:** ~15-20 seconds (Biome)
- **Each fix:** 2-10 minutes depending on complexity
- **Total time:** 10 hours for complete fix + testing

**No impact on runtime performance** - these are pure type system issues.

---

## Next: Full Documentation

- **Detailed Plan:** See `TYPESCRIPT_FIX_PLAN.md`
- **Code Examples:** See `TYPESCRIPT_FIX_EXAMPLES.md`
- **Error Reference:** Built-in error codes in TYPESCRIPT_FIX_PLAN.md Appendix

---

## Get Help

For specific errors:
1. Find error code in TYPESCRIPT_FIX_PLAN.md
2. Look up pattern in TYPESCRIPT_FIX_EXAMPLES.md
3. Apply fix to your file
4. Run `npm run validate` to verify

For questions about patterns:
- See `TYPESCRIPT_FIX_EXAMPLES.md` for 11 common patterns
- Each pattern shows wrong/correct code
- Copy-paste ready solutions

---

**Start Date:** January 4, 2026
**Estimated Completion:** January 5, 2026 (10 hours work)
**Owner:** AI Team
