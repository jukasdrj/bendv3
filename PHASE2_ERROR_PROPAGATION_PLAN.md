# Phase 2 Implementation Plan: CSV Processor Core Error Propagation

**Status:** Planning Document - Ready for Implementation
**Created:** January 5, 2026
**Related:** PR #242 (CSV validation errors), Phase 1 (Gemini error capture)
**Scope:** Propagate Phase 1 errors through all 5 failure points in csv-processor-core.ts

---

## Executive Summary

Phase 2 propagates the `{ books, errors }` structure from Phase 1's `parseCSVWithGemini()` through the entire CSV processing pipeline. This involves:

1. **Error Collection:** Accumulate errors from Gemini filtering, validation, and database saves
2. **Row Number Preservation:** Track which CSV rows failed at each stage
3. **API Contract Integration:** Populate the `errors` array in `APIContractResults`
4. **Testing:** Update/add tests to verify error tracking at each stage

**Estimated Implementation Time:** ~1 hour

---

## Error Flow Architecture

### Starting Point: Phase 1 Output
From `parseCSVWithGemini()`:
```typescript
{
  books: CSVParsedBook[],           // ✅ Valid books that passed Gemini filtering
  errors: ProcessingError[]          // ✅ Error details with row numbers
}
```

### Ending Point: API Response
In `APIContractResults`:
```typescript
{
  booksCreated: number,
  errors: JobErrorDetail[]           // ✅ NOW POPULATED (was hardcoded to [])
  books: CanonicalBook[]
}
```

### Transformation Chain
```
Gemini Output
├── GeminiParseResult.errors (from Phase 1)
├── Validation Errors (new - FP #2)
├── Database Save Errors (new - FP #4)
└── Endpoint: APIContractResults.errors (end)
```

---

## Critical Design Decision: Row Number Tracking

### The Challenge
When books are deduplicated by ISBN (lines 277-285), row numbers from the original CSV are lost. For example:

```
CSV Row 1: ISBN 978-1-234  ← Row 1
CSV Row 2: ISBN 978-1-234  ← Row 2 (duplicate, skipped)
CSV Row 3: ISBN 978-1-234  ← Row 3 (duplicate, skipped)

After deduplication: 1 book remaining
Question: Which row number do we report?
```

### Solution Approach (Client-Side Best Guess)
For Phase 2, we use a pragmatic approach:
- **Gemini errors:** Use exact row numbers from Phase 1 (these are accurate)
- **Validation errors:** Use index-based row numbers (approximate)
- **Database errors:** Use ISBN for context (row number is lost)

Future improvement: Add `_rowNumber` to `ParsedBook` interface for perfect tracking.

---

## Detailed Error Collection Strategy

### 1. Initialize Error Accumulator (Line ~174)

**Location:** After `const startTime = Date.now()`

**Code:**
```typescript
// Track all processing errors with row numbers
const processingErrors: ProcessingError[] = []
```

**Type Dependencies:**
```typescript
import type { ProcessingError } from '../types/processing-errors'
```

**What it does:** Single array to collect all errors from all stages.

---

### 2. Failure Point #1: Gemini Filtering Errors (Lines 226-242)

**Status:** ✅ Captured in Phase 1 - Retrieve them here

**Code Change Location:** After `const geminiResult = await callGemini(...)`

**Pseudocode:**
```typescript
const geminiResult = await callGemini(csvText, prompt, env, deps)

// ✅ Phase 1: Gemini already filters and returns errors
parsedBooks = geminiResult.books

// ✅ NEW: Collect Gemini filtering errors
processingErrors.push(...geminiResult.errors)

if (!Array.isArray(parsedBooks) || parsedBooks.length === 0) {
  throw new Error('No valid books found in CSV')
}
```

**What errors come from here:**
- Whitespace-only author (Gemini filtered in Phase 1)
- Empty author detected during post-parse validation
- Any Gemini validation that failed

**Row Number Quality:** Excellent (from Gemini's structured output)

---

### 3. Failure Point #2: Shape Validation (Lines 253-259)

**Status:** ❌ Currently silent - Need to capture

**Code Change Location:** Replace simple `.filter()` with error-tracking logic

**Current Code (Lines 253-259):**
```typescript
const validatedBooks: ValidatedBook[] = parsedBooks
  .filter((book) => book.title && book.author)
  .map((book) => ({
    title: String(book.title).trim(),
    author: String(book.author).trim(),
    isbn: book.isbn ? String(book.isbn).trim() : undefined,
  }))
```

**Pseudocode for Error Capture:**
```typescript
const validatedBooks: ValidatedBook[] = parsedBooks
  .map((book, index) => {
    // Missing title check
    if (!book.title || String(book.title).trim().length === 0) {
      processingErrors.push({
        row: index + 2,  // 1-based, +1 for header
        isbn: book.isbn ? String(book.isbn).trim() : undefined,
        error: `Missing or empty title field`,
      })
      return null
    }

    // Missing author check
    if (!book.author || String(book.author).trim().length === 0) {
      processingErrors.push({
        row: index + 2,
        isbn: book.isbn ? String(book.isbn).trim() : undefined,
        error: `Missing or empty author field`,
      })
      return null
    }

    // ✅ Valid book
    return {
      title: String(book.title).trim(),
      author: String(book.author).trim(),
      isbn: book.isbn ? String(book.isbn).trim() : undefined,
    }
  })
  .filter((book): book is ValidatedBook => book !== null)
```

**Impact:**
- Replaces lines 253-259 entirely
- Changes from `.filter()` → `.map()` → `.filter()`
- Adds validation error capture

**Row Number Quality:** Good (index-based, approximate)

---

### 4. Failure Point #3: ISBN Validation (Lines 277-285)

**Status:** ⚠️ Partial - Deduplication tracked, but lost during filtering

**Code Change Location:** Lines 277-285 (deduplication logic)

**Current Code:**
```typescript
const booksWithISBN = parsedBooks.filter((book) => isValidISBN(book.isbn))
const booksWithoutISBN = parsedBooks.filter((book) => !isValidISBN(book.isbn))

const uniqueBooksWithISBN = deduplicateBooksByISBN(booksWithISBN)
const duplicatesSkipped = booksWithISBN.length - uniqueBooksWithISBN.length
```

**Challenge:** We can track THAT duplicates were skipped (count), but not which rows they came from.

**Pseudocode for Better Tracking:**
```typescript
const booksWithISBN = parsedBooks.filter((book) => isValidISBN(book.isbn))
const booksWithoutISBN = parsedBooks.filter((book) => !isValidISBN(book.isbn))

// Track ISBN validity errors (if desired)
const invalidISBNBooks = parsedBooks.filter(
  (book) => book.isbn && !isValidISBN(book.isbn)
)
invalidISBNBooks.forEach((book, index) => {
  processingErrors.push({
    row: parsedBooks.indexOf(book) + 2, // Row number
    isbn: book.isbn,
    error: `Invalid ISBN format: ${book.isbn}`,
  })
})

// Track duplicates (less detailed, but can include in logs)
const uniqueBooksWithISBN = deduplicateBooksByISBN(booksWithISBN)
const duplicatesSkipped = booksWithISBN.length - uniqueBooksWithISBN.length

if (duplicatesSkipped > 0) {
  console.log(`[CSV Processor Core] Skipped ${duplicatesSkipped} duplicate ISBNs`)
  // NOTE: We don't add individual duplicate errors because row context is lost
  // during deduplication. Log the count for observability.
}
```

**Note:** Duplicates are intentional behavior (not errors). We track them as `duplicatesSkipped` count instead of individual errors.

**Row Number Quality:** Lost during deduplication (noted in logs, not in errors array)

---

### 5. Failure Point #4: Database Save Failures (Lines 299-307)

**Status:** ❌ Currently silent - Need to capture

**Code Change Location:** After `const results = await processWithLimit(saveTasks, 20)`

**Current Code (Lines 310-312):**
```typescript
const results = await processWithLimit(saveTasks, 20)
const savedCount = results.filter((r) => r.status === 'fulfilled').length
const failedCount = results.filter((r) => r.status === 'rejected').length
```

**Pseudocode for Error Capture:**
```typescript
const results = await processWithLimit(saveTasks, 20)

// Capture save failures
const saveErrors = results
  .map((result, index) => {
    if (result.status === 'rejected') {
      const book = booksWithValidISBN[index]
      const errorMessage = result.reason?.message || 'Unknown D1 write error'

      return {
        row: -1, // ⚠️ Row number lost at this stage
        isbn: book.isbn ? String(book.isbn).trim() : undefined,
        error: `Failed to persist to database: ${errorMessage}`,
      }
    }
    return null
  })
  .filter((err): err is JobErrorDetail => err !== null)

processingErrors.push(...saveErrors)

const savedCount = results.filter((r) => r.status === 'fulfilled').length
const failedCount = results.filter((r) => r.status === 'rejected').length
```

**Limitation:** Row number is lost by the time we save to database. We only have the book's ISBN as context.

**Row Number Quality:** Poor (`row: -1`) - Recommend future enhancement to track through save pipeline

---

### 6. Ending Point: API Contract Integration (Line 406)

**Status:** ❌ Hardcoded empty - Will be populated here

**Code Change Location:** Line 406 in `APIContractResults`

**Current Code:**
```typescript
const apiContractResults: APIContractResults = {
  booksCreated: canonicalBooks.length,
  booksUpdated: 0,
  duplicatesSkipped: duplicatesSkipped,
  enrichmentSucceeded: 0,
  enrichmentFailed: 0,
  errors: [],  // ❌ HARDCODED EMPTY
  books: canonicalBooks,
}
```

**New Code:**
```typescript
const apiContractResults: APIContractResults = {
  booksCreated: canonicalBooks.length,
  booksUpdated: 0,
  duplicatesSkipped: duplicatesSkipped,
  enrichmentSucceeded: 0,
  enrichmentFailed: 0,
  errors: processingErrors,  // ✅ FIXED: Accumulated errors
  books: canonicalBooks,
}
```

---

## Type System Changes

### New Type: ProcessingError

**File:** `src/types/processing-errors.ts` (NEW)

```typescript
/**
 * Error detail from CSV processing pipeline
 * Matches JobErrorDetailSchema in @bookstrack/schemas
 */
export interface ProcessingError {
  row?: number
  isbn?: string
  error: string
}
```

### Type Changes to ProcessorDependencies

**File:** `src/utils/jobs/csv-processor-core.ts` (Line ~131)

**Current:**
```typescript
export interface ProcessorDependencies {
  validateCSV: (csvText: string) => CSVValidationResult
  parseCSVWithGemini: (csvText: string, prompt: string, apiKey: string) => Promise<ParsedBook[]>
}
```

**New:**
```typescript
import type { ProcessingError } from '../../types/processing-errors'

export interface GeminiParseResult {
  books: ParsedBook[]
  errors: ProcessingError[]
}

export interface ProcessorDependencies {
  validateCSV: (csvText: string) => CSVValidationResult
  parseCSVWithGemini: (csvText: string, prompt: string, apiKey: string) => Promise<GeminiParseResult>
}
```

### Update callGemini() Return Type

**File:** `src/utils/jobs/csv-processor-core.ts` (Line 488)

**Current:**
```typescript
async function callGemini(
  csvText: string,
  prompt: string,
  env: Env,
  deps: ProcessorDependencies,
): Promise<ParsedBook[]>
```

**New:**
```typescript
async function callGemini(
  csvText: string,
  prompt: string,
  env: Env,
  deps: ProcessorDependencies,
): Promise<GeminiParseResult>
```

---

## Detailed Line-by-Line Implementation Guide

### Step 1: Add Type Import (Top of file)

**Line:** ~15 (after existing imports)

```typescript
import type { ProcessingError } from '../../types/processing-errors'
```

### Step 2: Update ProcessorDependencies Interface

**Lines:** 129-132

**BEFORE:**
```typescript
export interface ProcessorDependencies {
  validateCSV: (csvText: string) => CSVValidationResult
  parseCSVWithGemini: (csvText: string, prompt: string, apiKey: string) => Promise<ParsedBook[]>
}
```

**AFTER:**
```typescript
export interface GeminiParseResult {
  books: ParsedBook[]
  errors: ProcessingError[]
}

export interface ProcessorDependencies {
  validateCSV: (csvText: string) => CSVValidationResult
  parseCSVWithGemini: (csvText: string, prompt: string, apiKey: string) => Promise<GeminiParseResult>
}
```

### Step 3: Initialize Error Tracking Array

**Line:** ~175 (inside `processCSVCore()`)

**INSERT AFTER:**
```typescript
const startTime = Date.now()
```

**NEW CODE:**
```typescript
const processingErrors: ProcessingError[] = []
```

### Step 4: Update callGemini Function Signature

**Line:** 488 (function declaration)

**BEFORE:**
```typescript
async function callGemini(
  csvText: string,
  prompt: string,
  env: Env,
  deps: ProcessorDependencies,
): Promise<ParsedBook[]> {
```

**AFTER:**
```typescript
async function callGemini(
  csvText: string,
  prompt: string,
  env: Env,
  deps: ProcessorDependencies,
): Promise<GeminiParseResult> {
```

**LINE 510 (return statement):**
```typescript
return await deps.parseCSVWithGemini(csvText, prompt, apiKey)
```

### Step 5: Capture Gemini Errors

**Lines:** 226-242 (Stage 1: Gemini Parsing)

**AFTER THIS:**
```typescript
const prompt = buildCSVParserPrompt()
const geminiResult = await callGemini(csvText, prompt, env, deps)

parsedBooks = geminiResult.books
```

**ADD THIS:**
```typescript
// Collect Phase 1 errors: Gemini filtering and validation errors
processingErrors.push(...geminiResult.errors)
```

### Step 6: Replace Validation Filter Logic

**Lines:** 253-259 (Stage 2: Validation)

**REPLACE ENTIRE BLOCK WITH:**
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

### Step 7: Keep Deduplication Logic (No Changes)

**Lines:** 277-288

**ACTION:** No changes needed. Deduplication count is already tracked in `duplicatesSkipped`.

### Step 8: Capture Database Save Errors

**AFTER THIS (Line ~310):**
```typescript
const results = await processWithLimit(saveTasks, 20)
```

**ADD THIS:**
```typescript
// Capture database save failures
const saveErrors = results
  .map((result, index) => {
    if (result.status === 'rejected') {
      const book = booksWithValidISBN[index]
      const errorMessage = result.reason instanceof Error
        ? result.reason.message
        : 'Unknown database error'

      return {
        row: -1, // Note: Row number lost at save stage
        isbn: book.isbn ? String(book.isbn).trim() : undefined,
        error: `Failed to persist to database: ${errorMessage}`,
      }
    }
    return null
  })
  .filter((err): err is ProcessingError => err !== null)

processingErrors.push(...saveErrors)
```

### Step 9: Update API Contract Results

**Line:** 406

**BEFORE:**
```typescript
const apiContractResults: APIContractResults = {
  booksCreated: canonicalBooks.length,
  booksUpdated: 0,
  duplicatesSkipped: duplicatesSkipped,
  enrichmentSucceeded: 0,
  enrichmentFailed: 0,
  errors: [],  // TODO: Store validation errors with row numbers
  books: canonicalBooks,
}
```

**AFTER:**
```typescript
const apiContractResults: APIContractResults = {
  booksCreated: canonicalBooks.length,
  booksUpdated: 0,
  duplicatesSkipped: duplicatesSkipped,
  enrichmentSucceeded: 0,
  enrichmentFailed: 0,
  errors: processingErrors,  // ✅ FIXED: Accumulated errors from all stages
  books: canonicalBooks,
}
```

---

## Implementation Checklist

### Type System Setup
- [ ] Create `src/types/processing-errors.ts` with `ProcessingError` interface
- [ ] Update `ProcessorDependencies` interface to accept `GeminiParseResult`
- [ ] Update `callGemini()` return type to `Promise<GeminiParseResult>`
- [ ] Add type import at top of file

### Error Collection Points
- [ ] **FP #1 (Gemini):** Add `processingErrors.push(...geminiResult.errors)`
- [ ] **FP #2 (Validation):** Replace filter logic with map+filter error tracking
- [ ] **FP #3 (ISBN):** Keep deduplication logic unchanged (errors already tracked)
- [ ] **FP #4 (Database):** Add save error capture after `processWithLimit()`
- [ ] **Integration Point:** Change line 406 from `errors: []` to `errors: processingErrors`

### Testing & Validation
- [ ] Run `npm run test:smoke` to validate changes
- [ ] Verify `errors` array is populated in test scenarios
- [ ] Check that row numbers are accurate/reasonable
- [ ] Validate API contract (errors array matches schema)

---

## Testing Strategy

### Test Scenarios to Create/Update

#### Scenario 1: Mixed Valid/Invalid Rows (Critical)
**CSV Input:**
```csv
Title,Author,ISBN
"Valid Book","John Smith",9780000000001
"Missing Author","",9780000000002
"Empty Title","Jane Doe",9780000000003
"Valid Book 2","Alice Johnson",9780000000004
```

**Expected Output:**
- `booksCreated: 2`
- `errors: 2` (with row numbers 3 and 4)
- `books: [{ valid book 1 }, { valid book 2 }]`

#### Scenario 2: Duplicate ISBNs (Important)
**CSV Input:**
```csv
Title,Author,ISBN
"Book A","Author 1",9780000000001
"Book B","Author 2",9780000000001
"Book C","Author 3",9780000000002
```

**Expected Output:**
- `booksCreated: 2`
- `duplicatesSkipped: 1`
- `errors: 0` (duplicates are not errors, just skipped)

#### Scenario 3: Database Save Failure (Important)
- Mock `bookRepo.save()` to throw error
- Verify error is captured with ISBN context
- Check error message includes DB error detail

---

## Edge Cases & Gotchas

### 1. Empty CSV After Gemini Parsing
**Code:** Line 234
**Current:** `throw new Error('No valid books found in CSV')`
**Status:** ✅ Already handled - throws before error array population

### 2. Validation Errors Swallowing Duplicate Information
**Problem:** A book with invalid ISBN AND duplicate causes confusion
**Current Behavior:** Filtered out at ISBN validation, then at deduplication
**Solution:** Track ISBN validation separately (FP #3) from deduplication

### 3. Row Number Accuracy
**Challenge:** By the time we reach database saves, we don't know the original CSV row
**Decision:** Use `row: -1` as sentinel value for database errors
**Future:** Enhance `ParsedBook` to include `_rowNumber` for perfect tracking

### 4. Error Accumulation Performance
**Impact:** Each error object adds ~100 bytes to `APIContractResults`
**Calculation:** 500 books × 5 errors = 2500 errors × 100 bytes = 250KB
**Status:** Acceptable - well under KV size limits

### 5. Null/Undefined Handling in Error Messages
**Risk:** `result.reason?.message` could be undefined
**Fix:** Use fallback: `result.reason instanceof Error ? result.reason.message : 'Unknown error'`

---

## File Change Summary

### Files to Create
1. **`src/types/processing-errors.ts`** (NEW)
   - `ProcessingError` interface
   - ~10 lines

### Files to Modify
1. **`src/utils/jobs/csv-processor-core.ts`** (MAIN)
   - Add imports (~2 lines)
   - Update `ProcessorDependencies` interface (~8 lines)
   - Add `GeminiParseResult` interface (~4 lines)
   - Initialize error array (~2 lines)
   - Update `callGemini()` return type (~1 line)
   - Capture Gemini errors (~2 lines)
   - Replace validation logic (~20 lines)
   - Capture database errors (~15 lines)
   - Update API contract (~1 line)
   - **Total additions:** ~55 lines
   - **Net change:** ~+40 lines (some code replacement)

### Files NOT Needing Changes (Yet)
- `src/providers/gemini-csv-provider.ts` - Already updated in Phase 1
- `src/schemas/job.ts` - `JobErrorDetailSchema` already defined
- `src/types/env.ts` - No changes needed
- Test files - Will update separately in Phase 3

---

## Estimated Time Breakdown

| Task | Time |
|------|------|
| Create ProcessingError type | 5 min |
| Update interface definitions | 10 min |
| Implement error collection (FP #2) | 15 min |
| Implement error collection (FP #4) | 10 min |
| Update API contract integration | 5 min |
| Integration testing | 10 min |
| **Total** | **~55 minutes** |

---

## Risk Assessment

### Low Risk Changes
- ✅ Type system changes (non-breaking for tests)
- ✅ Error array population (new feature, backward compatible)
- ✅ Error message strings (user-facing, non-critical)

### Medium Risk Changes
- ⚠️ Validation filter replacement (refactoring logic)
- ⚠️ Return type change for `callGemini()` (internal API)

### Testing Requirements
- Smoke tests must pass with new error tracking
- Integration tests must verify error details are accurate
- Edge cases with null/undefined must be handled

---

## Rollback Plan

If Phase 2 causes issues:

1. **Immediate:** Revert to prior commit
2. **Quick Fix:** Set `errors: []` in line 406 (disable error tracking)
3. **Root Cause:** Investigate failed tests or schema mismatches
4. **Full Rollback:** Revert entire phase and re-plan

---

## Success Criteria

- [ ] Type definitions compile without errors
- [ ] All smoke tests pass with new error tracking
- [ ] Error array populated for each failure point
- [ ] Row numbers accurate (or noted as `-1` when lost)
- [ ] API contract validates against schema
- [ ] No performance regression
- [ ] Error messages are user-friendly and actionable

---

## Next Steps (Phase 3)

After Phase 2 completes successfully:

1. **Update existing tests** to assert on error array contents
2. **Add new tests** for each failure point scenario
3. **Test database errors** with mocked save failures
4. **Integration test** with real CSV containing mixed valid/invalid rows
5. **Verify iOS SDK** can handle new error structure

---

## Implementation Notes

### Code Style Notes
- Follow existing 2-space indentation
- Use single quotes for strings
- Add comments explaining error codes
- Log errors with structured format for observability

### Error Message Format
Keep messages concise but informative:
```
✅ "Missing required field: author"
✅ "Invalid ISBN format: ABC123XYZ"
❌ "There was an error" (too vague)
```

### Logging Strategy
- Log filter counts (deduplication) at INFO level
- Log individual errors at WARN level
- Include ISBN context when available
- Example: `[CSV Processor] Row 5: Invalid ISBN 123ABC`

---

## Questions & Clarifications

### Q: Why use `row: -1` for database errors?
**A:** Row number is lost when books enter the database save pipeline. Using `-1` signals to clients that row context is unavailable. Future enhancement: enhance `ParsedBook` with `_rowNumber`.

### Q: Should we deduplicate before or after error collection?
**A:** After. We collect validation errors on all parsed books first, then deduplicate. This way, all validation issues are recorded.

### Q: How are duplicates handled in error reporting?
**A:** Duplicates are NOT errors - they're expected behavior. We track them as `duplicatesSkipped` count rather than individual errors.

### Q: What if Gemini returns 0 books?
**A:** Handled by existing check at line 234. Throws error before error array is populated.

### Q: Performance impact of error accumulation?
**A:** Minimal. Error objects are small (~100 bytes each), and even 500+ errors fit well within KV limits.

---

**Document Status:** Ready for Implementation
**Author:** Claude Code Analysis (January 5, 2026)
**Review Ready:** ✅ All sections complete
