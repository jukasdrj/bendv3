# Phase 2 Implementation: Quick Start Guide

**Created:** January 5, 2026
**Estimated Duration:** ~55 minutes
**Status:** Ready to implement

---

## What is Phase 2?

Phase 2 propagates error information from **Phase 1's Gemini output** through the entire CSV processing pipeline and populates the API response's `errors` array.

**In one sentence:** Change line 406 from `errors: []` to `errors: processingErrors` by accumulating errors from all failure points.

---

## The Five Failure Points (FP)

```
FP #1: Gemini Filtering        (Line 226-242) ← Output from Phase 1
FP #2: Validation              (Line 253-259) ← Your job in Phase 2
FP #3: Deduplication           (Line 277-285) ← Passive, no changes
FP #4: Database Saves          (Line 299-310) ← Your job in Phase 2
FP #5: API Contract Population (Line 406)     ← Your final change
```

---

## Implementation Roadmap (9 Steps)

### Step 1: Create ProcessingError Type (5 min)
**File:** Create `src/types/processing-errors.ts`

```typescript
export interface ProcessingError {
  row?: number
  isbn?: string
  error: string
}
```

---

### Step 2: Update Interfaces (10 min)
**File:** `src/utils/jobs/csv-processor-core.ts`

Add at top (after imports):
```typescript
import type { ProcessingError } from '../../types/processing-errors'
```

Add these interfaces (after line 128):
```typescript
export interface GeminiParseResult {
  books: ParsedBook[]
  errors: ProcessingError[]
}
```

Update `ProcessorDependencies` (line ~131):
```typescript
export interface ProcessorDependencies {
  validateCSV: (csvText: string) => CSVValidationResult
  parseCSVWithGemini: (csvText: string, prompt: string, apiKey: string) => Promise<GeminiParseResult>
}
```

---

### Step 3: Initialize Error Array (2 min)
**Location:** After `const startTime = Date.now()` (~line 174)

```typescript
const processingErrors: ProcessingError[] = []
```

---

### Step 4: Update callGemini() (1 min)
**Location:** Function signature at line ~488

Change return type from `Promise<ParsedBook[]>` to `Promise<GeminiParseResult>`

---

### Step 5: Collect Gemini Errors (2 min)
**Location:** After `const geminiResult = await callGemini(...)` (~line 230)

```typescript
parsedBooks = geminiResult.books
processingErrors.push(...geminiResult.errors)  // ← NEW LINE
```

---

### Step 6: Rewrite Validation Filter (15 min)
**Location:** Lines 253-259 (REPLACE ENTIRE BLOCK)

```typescript
const validatedBooks: ValidatedBook[] = parsedBooks
  .map((book, index) => {
    const trimmedTitle = book.title ? String(book.title).trim() : ''
    const trimmedAuthor = book.author ? String(book.author).trim() : ''

    if (!trimmedTitle || !trimmedAuthor) {
      processingErrors.push({
        row: index + 2,
        isbn: book.isbn ? String(book.isbn).trim() : undefined,
        error: `Missing required field: ${!trimmedTitle ? 'title' : 'author'}`,
      })
      return null
    }

    return {
      title: trimmedTitle,
      author: trimmedAuthor,
      isbn: book.isbn ? String(book.isbn).trim() : undefined,
    }
  })
  .filter((book): book is ValidatedBook => book !== null)
```

---

### Step 7: Capture Database Errors (15 min)
**Location:** After `const results = await processWithLimit(saveTasks, 20)` (~line 310)

```typescript
const saveErrors = results
  .map((result, index) => {
    if (result.status === 'rejected') {
      const book = booksWithValidISBN[index]
      const errorMessage = result.reason instanceof Error
        ? result.reason.message
        : 'Unknown database error'

      return {
        row: -1,
        isbn: book.isbn ? String(book.isbn).trim() : undefined,
        error: `Failed to persist to database: ${errorMessage}`,
      }
    }
    return null
  })
  .filter((err): err is ProcessingError => err !== null)

processingErrors.push(...saveErrors)
```

---

### Step 8: Update API Contract (1 min)
**Location:** Line 406

Change from:
```typescript
errors: [],
```

To:
```typescript
errors: processingErrors,
```

---

### Step 9: Validate & Test (4 min)
```bash
npm run test:smoke
npm run validate
```

Verify:
- [ ] Tests pass
- [ ] No TypeScript errors
- [ ] Error array populated in test scenarios

---

## Key Code Locations

| Step | File | Lines | Task |
|------|------|-------|------|
| 1 | `src/types/processing-errors.ts` | NEW | Create type |
| 2 | `csv-processor-core.ts` | 15-131 | Update imports & interfaces |
| 3 | `csv-processor-core.ts` | ~175 | Add error array |
| 4 | `csv-processor-core.ts` | ~488 | Update return type |
| 5 | `csv-processor-core.ts` | ~230 | Collect Phase 1 errors |
| 6 | `csv-processor-core.ts` | 253-259 | Rewrite validation |
| 7 | `csv-processor-core.ts` | ~310 | Capture DB errors |
| 8 | `csv-processor-core.ts` | 406 | Populate API response |
| 9 | Terminal | - | Run tests |

---

## Before You Start

### Prerequisites
- [ ] Understand Phase 1 (Gemini returns `{ books, errors }`)
- [ ] Have `PHASE2_ERROR_PROPAGATION_PLAN.md` open
- [ ] Have `PHASE2_ERROR_FLOW_DIAGRAM.md` for reference
- [ ] Have test file ready for validation

### Key Files to Know
- **Main file:** `/Users/juju/dev_repos/bendv3/src/utils/jobs/csv-processor-core.ts`
- **Type file:** `/Users/juju/dev_repos/bendv3/src/types/processing-errors.ts` (CREATE THIS)
- **Schema reference:** `/Users/juju/dev_repos/bendv3/src/schemas/job.ts` (JobErrorDetailSchema)

### Git Setup
```bash
# Create feature branch
git checkout -b phase2/csv-error-propagation

# Make changes (see 9 steps above)

# When done
git add -A
git commit -m "feat: Phase 2 - Propagate CSV validation errors through pipeline"
git push origin phase2/csv-error-propagation
```

---

## Critical Implementation Rules

### Rule 1: Row Number Formula
**Always use:** `row = index + 2`
- index 0 (array) = Row 1 (CSV header, not counted)
- index 1 (array) = Row 2 (first data row, user sees "Row 2")

### Rule 2: Error Message Format
Keep messages:
- **Concise:** < 80 characters
- **Actionable:** Tell user what to fix
- **Consistent:** All messages start with verb or field name

✅ Good: `"Missing required field: author"`
❌ Bad: `"Author field is empty or missing in the CSV"`

### Rule 3: Null/Undefined Handling
Always convert to string with fallback:
```typescript
const value = book.field ? String(book.field).trim() : ''
```

### Rule 4: ISBN Context
Always include ISBN when available:
```typescript
processingErrors.push({
  row: index + 2,
  isbn: book.isbn ? String(book.isbn).trim() : undefined,  // Include always
  error: ...
})
```

### Rule 5: Row = -1 Semantics
Use `row: -1` ONLY for database errors where row is lost:
```typescript
processingErrors.push({
  row: -1,  // ← Indicates row was lost
  isbn: book.isbn,  // ← But provide ISBN for context
  error: ...
})
```

---

## Testing Your Work

### Smoke Test (Full Suite)
```bash
npm run test:smoke
```

Expected: All tests pass

### Manual Test (CSV with Errors)
1. Create test CSV with mixed valid/invalid rows
2. Run import job
3. Check response `errors` array:
   - Contains error objects
   - Row numbers are accurate
   - Error messages are clear
   - ISBN context present

### Type Check
```bash
npx tsc --noEmit
```

Expected: No TypeScript errors in csv-processor-core.ts

---

## Common Mistakes to Avoid

### ❌ Mistake 1: Hardcoded Row Numbers
```typescript
// WRONG
processingErrors.push({
  row: 5,  // What if book is from different position?
  error: ...
})

// RIGHT
processingErrors.push({
  row: index + 2,  // Calculated from position
  error: ...
})
```

### ❌ Mistake 2: Losing Error on Transformation
```typescript
// WRONG: Error pushed but variable shadowed
let error = "original"
{
  let error = "shadowed"
  processingErrors.push({ error })
}

// RIGHT: Track error reference
const error = "message"
processingErrors.push({ error })
```

### ❌ Mistake 3: Missing ISBN Context
```typescript
// WRONG: ISBN lost
processingErrors.push({
  row: -1,
  error: "DB write failed"  // No way to identify book!
})

// RIGHT: ISBN included
processingErrors.push({
  row: -1,
  isbn: book.isbn,
  error: `DB write failed for ISBN ${book.isbn}`
})
```

### ❌ Mistake 4: Inconsistent Row Formula
```typescript
// WRONG: Different formulas in different places
processingErrors.push({ row: index + 2 })
processingErrors.push({ row: index + 1 })  // Inconsistent!

// RIGHT: Always the same formula
processingErrors.push({ row: index + 2 })
processingErrors.push({ row: index + 2 })
```

### ❌ Mistake 5: Not Handling Null Errors
```typescript
// WRONG: Can crash if result.reason is not Error
const msg = result.reason.message

// RIGHT: Defensive check
const msg = result.reason instanceof Error
  ? result.reason.message
  : 'Unknown error'
```

---

## Estimated Time Breakdown

| Task | Time | Cumulative |
|------|------|------------|
| Create type file | 5 min | 5 min |
| Update interfaces | 10 min | 15 min |
| Initialize array | 2 min | 17 min |
| Update return type | 1 min | 18 min |
| Collect Gemini errors | 2 min | 20 min |
| Rewrite validation | 15 min | 35 min |
| Capture DB errors | 15 min | 50 min |
| Update API contract | 1 min | 51 min |
| Testing & validation | 4 min | 55 min |
| **TOTAL** | | **~55 min** |

---

## Success Checklist

When you're done, verify:

### Code Changes
- [ ] `ProcessingError` type created in `src/types/processing-errors.ts`
- [ ] `GeminiParseResult` interface added to `csv-processor-core.ts`
- [ ] `ProcessorDependencies` updated
- [ ] Error array initialized at start of `processCSVCore()`
- [ ] Gemini errors collected with `push(...geminiResult.errors)`
- [ ] Validation logic rewritten with error capture
- [ ] Database errors captured with proper fallbacks
- [ ] API contract `errors` field populated

### Type System
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] All types compile without warnings
- [ ] `ProcessingError` matches `JobErrorDetailSchema`

### Testing
- [ ] `npm run test:smoke` passes
- [ ] `npm run validate` passes
- [ ] Manual CSV test shows errors in response

### Quality
- [ ] Code follows existing style (2-space indent, single quotes)
- [ ] Error messages are clear and actionable
- [ ] No console.log debugging statements remain
- [ ] Comments added for complex logic

---

## If Something Goes Wrong

### Tests Fail
```bash
# Check what changed
git diff src/utils/jobs/csv-processor-core.ts

# Review test expectations
cat tests/unit/csv-processor-core.test.ts
```

### Type Errors
```bash
# Find type errors
npx tsc --noEmit 2>&1 | grep "csv-processor"

# Check ProcessingError interface matches JobErrorDetailSchema
```

### Row Numbers Wrong
```bash
# Debug: Add logging
console.log('Index:', index, 'Row:', index + 2)

# Verify formula: index + 2 (not +1, not +3)
```

### Database Errors Not Showing
```bash
# Check if capture code is reached
console.log('Results:', results.map(r => r.status))

# Verify rejection check
if (result.status === 'rejected') console.log('Error:', result.reason)
```

---

## Next Steps (After Phase 2)

1. **Phase 3:** Update existing tests to verify error tracking
2. **Phase 4:** Add integration tests for edge cases
3. **iOS SDK:** Verify client can parse error array
4. **Documentation:** Update API docs with error examples

---

## Reference Documents

- **Full Plan:** `PHASE2_ERROR_PROPAGATION_PLAN.md` (detailed specs)
- **Visual Guide:** `PHASE2_ERROR_FLOW_DIAGRAM.md` (error flow diagrams)
- **Edge Cases:** `PHASE2_EDGE_CASES_TROUBLESHOOTING.md` (gotchas & fixes)

---

## Getting Help

If you're stuck:

1. **Check the error flow diagram** (PHASE2_ERROR_FLOW_DIAGRAM.md)
2. **Review the detailed plan** (PHASE2_ERROR_PROPAGATION_PLAN.md)
3. **Look up your issue** (PHASE2_EDGE_CASES_TROUBLESHOOTING.md)
4. **Check the main plan** for that specific failure point

---

**Ready to implement?** Start with Step 1: Create ProcessingError type

Good luck! 🚀
