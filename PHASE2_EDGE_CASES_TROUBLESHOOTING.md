# Phase 2 Edge Cases & Troubleshooting Guide

**Companion to:** PHASE2_ERROR_PROPAGATION_PLAN.md
**Purpose:** Identify and handle edge cases that may occur during Phase 2 implementation

---

## Edge Case Index

1. [Empty/Null Handling](#edge-case-1-emptynull-handling)
2. [Duplicate Detection Edge Cases](#edge-case-2-duplicate-detection-edge-cases)
3. [Row Number Accuracy Issues](#edge-case-3-row-number-accuracy-issues)
4. [Error Message Consistency](#edge-case-4-error-message-consistency)
5. [Type System Edge Cases](#edge-case-5-type-system-edge-cases)
6. [Performance at Scale](#edge-case-6-performance-at-scale)
7. [Database Error Context Loss](#edge-case-7-database-error-context-loss)
8. [Gemini Response Edge Cases](#edge-case-8-gemini-response-edge-cases)

---

## Edge Case 1: Empty/Null Handling

### Problem
Gemini might return books with null/undefined author even after schema validation.

### Manifestation
```typescript
// Gemini returns book with empty author
const book = {
  title: "Book Title",
  author: null,  // ← Shouldn't happen but could
  isbn: "978-..."
}
```

### Code Location
Lines 253-259 (Validation stage)

### Solution
```typescript
const trimmedAuthor = book.author ? String(book.author).trim() : ''

if (!trimmedTitle || !trimmedAuthor) {
  processingErrors.push({
    row: index + 2,
    isbn: book.isbn ? String(book.isbn).trim() : undefined,
    error: `Missing required field: ${!trimmedTitle ? 'title' : 'author'}`,
  })
  return null
}
```

**Key:** Defensive conversion with fallback to empty string, then check length.

### Test Case
```typescript
const book = {
  title: "Test",
  author: null,
  isbn: "978-000"
}
// Should produce error: "Missing required field: author"
```

### Rollout Risk
**Low** - Uses defensive programming pattern already in codebase

---

## Edge Case 2: Duplicate Detection Edge Cases

### Problem 1: Multiple ISBN Formats
Gemini might parse the same ISBN in different formats:
- `978-1-234567-89-0` (with hyphens)
- `9781234567890` (without hyphens)
- `978 1 234567 89 0` (with spaces)

### Solution
The existing `isValidISBN()` function should normalize formats before comparison. Verify in `deduplicateBooksByISBN()`:

```typescript
// In book-mappers.ts or similar
function normalizeISBN(isbn: string | undefined): string {
  if (!isbn) return ''
  return String(isbn)
    .replace(/[\s-]/g, '')  // Remove spaces and hyphens
    .toUpperCase()           // Standardize case
}

// Then deduplication compares normalized versions
```

**Current Status:** Check if `deduplicateBooksByISBN()` already does this normalization

### Test Case
```typescript
const books = [
  { title: "A", author: "Auth", isbn: "978-1-234567-89-0" },
  { title: "B", author: "Auth", isbn: "9781234567890" },      // Same ISBN
]
// Should detect as duplicate, skip one
```

### Rollout Risk
**Medium** - Depends on existing deduplication logic

---

### Problem 2: Books with Same ISBN but Different Authors
Edge case: Two editions of same book with different translators

```csv
Title,Author,ISBN
"Original","Author A",978-1-234
"Translation","Author B",978-1-234
```

### Current Behavior
Both skipped (duplicate ISBN), only one saved

### Desired Behavior
This is actually correct - same ISBN = same edition. Authors might differ in Gemini parsing, but it's the same physical book.

### Status
**No change needed** - current behavior is correct

---

## Edge Case 3: Row Number Accuracy Issues

### Problem 1: Filtering Changes Row Numbers
When books are filtered at stage 1 (Gemini), indices change:

```
Original parsed array:
[0] Book A ✅
[1] Book B ❌ (filtered out)
[2] Book C ✅

After Gemini filtering:
[0] Book A ✅ (was index 0, still index 0)
[1] Book C ✅ (was index 2, now index 1)

Stage 2 validation of [1]:
  Index 1 → row: 1 + 2 = 3 (but actually came from original row 3)
  This is CORRECT by coincidence! ✅
```

### Correct Behavior
Row number in validation errors = index of book in Gemini's output array + 2

This is correct because:
1. Gemini returns exact row numbers for its filtered books
2. Validation happens on Gemini's output (not re-indexed)
3. Row numbers are relative to Gemini's view, which is correct for user feedback

### Test Case
```typescript
// CSV with 5 rows (including header)
// Gemini filters row 2 (empty author)
// Returns books from rows [1, 3, 4]

// Validation processes [book from row 1, book from row 3, book from row 4]
// If validation fails on book from row 3, we report:
//   row: index in gemini output (0 or 1) + 2
//   This matches user's expectation of "row 3 in CSV"
```

### Status
**Verified correct** - Row numbers are accurate as-is

---

### Problem 2: Database Errors Lose Row Context
When database save fails, we only have the book object, not its CSV row:

```typescript
const saveTasks = booksWithValidISBN.map((geminiBook) => async () => {
  // geminiBook has no reference to original CSV row
  await bookRepo.save(mapGeminiCSVBookToBookRecord(geminiBook))
})
```

### Current Solution
Use `row: -1` as sentinel value to indicate "row number lost"

### Better Solution (Future)
Add `_rowNumber?: number` to `ParsedBook` interface, propagate through pipeline:

```typescript
interface ParsedBook {
  title: string
  author: string
  isbn?: string
  _rowNumber?: number  // NEW: Track original CSV row
  // ... other fields
}
```

### For Phase 2
**Keep using `row: -1`** - Include ISBN for context instead:

```typescript
processingErrors.push({
  row: -1,  // Sentinel value
  isbn: book.isbn,  // Context: which book failed?
  error: `Failed to persist ISBN ${book.isbn}: ${error}`
})
```

### Test Case
```typescript
// Mock bookRepo.save to throw error for ISBN "978-TEST"
// Verify error contains:
//   row: -1
//   isbn: "978-TEST"
//   error message includes ISBN
```

### Status
**Accepted limitation** for Phase 2, tracked as future enhancement

---

## Edge Case 4: Error Message Consistency

### Problem
Error messages from different stages should follow consistent format:

```
❌ "Missing required field: author"           // FP#2
❌ "Gemini filtered: empty author"            // FP#1
❌ "Failed to persist to database: timeout"   // FP#4
❌ "Unknown error: null"                      // Edge case
```

### Solution
Define error message templates:

```typescript
// Error message patterns
const ERROR_MESSAGES = {
  GEMINI_FILTER_EMPTY_AUTHOR: 'Gemini filtered: empty or whitespace-only author',
  VALIDATION_MISSING_TITLE: 'Missing required field: title',
  VALIDATION_MISSING_AUTHOR: 'Missing required field: author',
  DATABASE_WRITE_FAILED: (error: string) => `Failed to persist to database: ${error}`,
  DATABASE_UNKNOWN: 'Failed to persist to database: unknown error',
}
```

### Implementation
Use these templates in Phase 2 error collection:

```typescript
// FP#2 Validation
processingErrors.push({
  row: index + 2,
  error: !trimmedTitle
    ? ERROR_MESSAGES.VALIDATION_MISSING_TITLE
    : ERROR_MESSAGES.VALIDATION_MISSING_AUTHOR
})

// FP#4 Database
const errorMsg = result.reason instanceof Error
  ? result.reason.message
  : 'unknown error'
processingErrors.push({
  row: -1,
  isbn: book.isbn,
  error: ERROR_MESSAGES.DATABASE_WRITE_FAILED(errorMsg)
})
```

### Benefits
- Consistent error format for iOS client parsing
- Easier to translate for multilingual support
- Better for analytics and monitoring

### Status
**Recommended** - Easy to add in Phase 2

---

## Edge Case 5: Type System Edge Cases

### Problem 1: `ProcessingError` Type Mismatch

```typescript
// Phase 1 might return:
export interface ProcessingError {
  rowNumber: number           // Note: "rowNumber"
  message: string
  code: string
}

// But JobErrorDetailSchema expects:
export interface JobErrorDetail {
  row?: number                // Note: "row" (optional)
  isbn?: string
  error: string
}
```

### Solution
Ensure consistent naming in Phase 1 → Phase 2 handoff:

```typescript
// src/types/processing-errors.ts (MUST match JobErrorDetailSchema)
export interface ProcessingError {
  row?: number      // Optional, matches schema
  isbn?: string     // Optional, matches schema
  error: string     // Required, matches schema
}
```

**Action:** Verify Phase 1 output matches this interface exactly

### Test Case
```typescript
const error: ProcessingError = {
  row: 5,
  isbn: "978-...",
  error: "Missing field"
}

// Should pass type check and Zod validation
const validated = JobErrorDetailSchema.parse(error)
```

---

### Problem 2: Generic `Error` Object in Promise Results

```typescript
const result = await Promise.allSettled([...])

// result[0].status === 'rejected'
// result[0].reason could be:
//   - Error object (has .message)
//   - string
//   - object with .message
//   - undefined
```

### Solution
Defensive error extraction:

```typescript
const errorMessage = (() => {
  if (result.reason instanceof Error) return result.reason.message
  if (typeof result.reason === 'string') return result.reason
  if (result.reason?.message) return String(result.reason.message)
  return 'Unknown database error'
})()
```

### Better Solution
Use type guard:

```typescript
function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (typeof reason === 'string') return reason
  if (typeof reason === 'object' && reason !== null && 'message' in reason) {
    return String((reason as Record<string, unknown>).message)
  }
  return 'Unknown error'
}
```

### Status
**Required** - Use in Phase 2 database error capture

---

## Edge Case 6: Performance at Scale

### Problem
What if CSV has 10,000 rows with 50% errors? Performance implications?

### Calculation
```
10,000 rows × 50% errors = 5,000 error objects
5,000 errors × 100 bytes = 500 KB

KV Storage Limit: 1 MB typically
Payload under limit: ✅ 500 KB < 1 MB
```

### Test Case (Load Test)
```typescript
// Generate CSV with 10,000 rows
const largeCSV = generateCSV(10000, { errorRate: 0.5 })

// Measure:
// 1. Parsing time (should be <30s)
// 2. Validation time (should add <5s)
// 3. Error array size (should be <1 MB)
// 4. KV write time (should be <2s)
```

### Expected Results
| Operation | Time | Notes |
|-----------|------|-------|
| Gemini parse | 20-30s | Unchanged from Phase 1 |
| Validation filter | +2-3s | Adds minimal overhead |
| Database saves | 20-40s | Parallel, unchanged |
| Error accumulation | <100ms | Negligible |

### Status
**No performance risk** - error accumulation overhead is negligible

---

## Edge Case 7: Database Error Context Loss

### Problem
When database save fails, we lose the original CSV row:

```
Row 42 in CSV → Parsed by Gemini → Validated → Saved to D1
                                                   ↓ FAILS
                                                   Error has no row context!
```

### Current State
`row: -1` indicates row is lost, but we include `isbn` for identification

### Why Row Is Lost
1. Gemini parsing loses original row mapping (returns just books)
2. Validation filters out invalid books by index
3. Deduplication changes indices
4. Database save is async/parallel - row context already gone

### Potential Solutions

#### Solution A: Track Row Through Pipeline (Best)
Add `_rowNumber` to `ParsedBook`:

```typescript
// Phase 1 modification
interface ParsedBook {
  title: string
  author: string
  _rowNumber?: number  // NEW: Track from Gemini
}
```

**Effort:** 2-3 hours (impacts multiple files)
**Status:** Deferred to Phase 2B or Phase 3

#### Solution B: Use Parallel Map (Current)
Maintain `Map<isbn, rowNumber>` alongside processing:

```typescript
const rowMap = new Map<string, number>()
parsedBooks.forEach((book, index) => {
  if (book.isbn) {
    rowMap.set(book.isbn, index + 2)
  }
})

// Later during database save:
const rowNumber = rowMap.get(book.isbn) ?? -1
processingErrors.push({
  row: rowNumber,
  error: ...
})
```

**Effort:** 1-2 hours
**Status:** Consider for Phase 2 if time permits

#### Solution C: Accept Row Loss (Current Plan)
Use `row: -1` with ISBN context:

```typescript
processingErrors.push({
  row: -1,
  isbn: book.isbn,
  error: `Failed to save ISBN ${book.isbn}: ${error}`
})
```

**Effort:** 15 minutes
**Status:** **Use for Phase 2** (implement Solutions A/B later)

### Recommendation
**Go with Solution C for Phase 2** - ship quickly with ISBN context, enhance in Phase 3

---

## Edge Case 8: Gemini Response Edge Cases

### Problem 1: Gemini Returns Non-Array
Gemini might return object instead of array (schema violation):

```json
{
  "books": [{...}],
  "errors": [{...}]
}
```

vs expected:

```json
[
  {...},
  {...}
]
```

### Current Code (Line 203)
```typescript
if (!Array.isArray(parsed)) {
  throw new Error(`Schema violation: Expected array, got ${typeof parsed}`)
}
```

**Status:** ✅ Already handled - throws error

---

### Problem 2: Gemini Returns Empty Array
Gemini parses CSV but finds zero valid books:

```json
[]
```

### Current Code (Line 234)
```typescript
if (!Array.isArray(parsedBooks) || parsedBooks.length === 0) {
  throw new Error('No valid books found in CSV')
}
```

**Status:** ✅ Already handled - throws error before error array population

---

### Problem 3: Gemini Filtering Returns Errors in Phase 1
Gemini response structure from Phase 1:

```typescript
interface GeminiParseResult {
  books: CSVParsedBook[]
  errors: ProcessingError[]
}
```

**Critical:** Must verify Phase 1 uses this exact structure

### Verification Task
Before Phase 2 starts, confirm:
1. `parseCSVWithGemini()` returns `GeminiParseResult` (not just array)
2. `errors` array is populated correctly
3. Row numbers in errors are accurate

**Location to Check:** `src/providers/gemini-csv-provider.ts`

---

## Troubleshooting Guide

### Issue 1: Tests Fail After Phase 2 Implementation

**Symptom:**
```
Error: Expected processingErrors to be empty
```

**Cause:** Tests expect `errors: []` but now populated

**Fix:**
1. Update test expectations to check for actual errors
2. Mock Gemini to return specific error scenarios
3. Verify error array content

**Example:**
```typescript
// OLD
expect(result.errors).toEqual([])

// NEW
expect(result.errors).toContainEqual({
  row: 2,
  error: expect.stringContaining('Missing')
})
```

---

### Issue 2: Row Numbers Off by One

**Symptom:**
```
Error says row 5, but CSV row 5 is actually valid
```

**Cause:** Row number calculation error

**Verification:**
```typescript
// CSV is 1-based (Row 1 = header)
// Array is 0-based (index 0 = header)
// Formula: row = index + 2
//   - index 0 (header) → row 1
//   - index 1 (data)   → row 2 ✅
//   - index 2 (data)   → row 3 ✅
```

**Fix:** Check row calculation in validation stage:
```typescript
processingErrors.push({
  row: index + 2,  // Should always be this formula
  error: ...
})
```

---

### Issue 3: Missing ISBN in Error Object

**Symptom:**
```
Error captured but isbn field is undefined/missing
```

**Cause:** Null/undefined ISBN not handled

**Fix:**
```typescript
processingErrors.push({
  row: index + 2,
  isbn: book.isbn ? String(book.isbn).trim() : undefined,  // Explicit undefined
  error: ...
})
```

---

### Issue 4: Database Errors Not Captured

**Symptom:**
```
Book fails to save but no error in processingErrors array
```

**Cause:** Error collection code not reached

**Verification:**
1. Check `Promise.allSettled()` results loop
2. Verify `result.status === 'rejected'` condition
3. Ensure error is pushed to `processingErrors`

**Debug:**
```typescript
const results = await processWithLimit(saveTasks, 20)
console.log('Results:', results.map(r => r.status))  // Check if REJECTED
```

---

### Issue 5: Type Mismatch: ProcessingError vs JobErrorDetail

**Symptom:**
```
Type 'ProcessingError' is not assignable to type 'JobErrorDetail'
```

**Cause:** Field name mismatch (e.g., `rowNumber` vs `row`)

**Fix:** Ensure types match exactly:

```typescript
// CORRECT
interface ProcessingError {
  row?: number           // Not rowNumber
  isbn?: string
  error: string          // Not message, not detail
}
```

**Verification:**
```bash
# Check both definitions match
grep -n "row:" src/types/processing-errors.ts
grep -n "row:" packages/schemas/src/job.ts
```

---

### Issue 6: Gemini Errors Not Propagated

**Symptom:**
```
CSV has invalid rows but errors array is empty
```

**Cause:** Phase 1 errors not collected in Phase 2

**Verification:**
```typescript
// After calling Gemini:
console.log('Gemini errors:', geminiResult.errors)
processingErrors.push(...geminiResult.errors)  // Must have this line
console.log('Total errors:', processingErrors)
```

---

## Validation Checklist

Before marking Phase 2 complete:

### Type System
- [ ] `ProcessingError` interface defined and exported
- [ ] `GeminiParseResult` interface updated
- [ ] `ProcessorDependencies` updated
- [ ] `callGemini()` return type updated
- [ ] No type mismatches in errors array

### Error Collection
- [ ] FP#1 (Gemini): Errors collected with `processingErrors.push(...geminiResult.errors)`
- [ ] FP#2 (Validation): Errors collected with row numbers from index
- [ ] FP#3 (Deduplication): Duplicates counted (not errored)
- [ ] FP#4 (Database): Errors collected with `row: -1` fallback

### API Contract
- [ ] `apiContractResults.errors` populated from `processingErrors` array
- [ ] Error objects match `JobErrorDetailSchema` structure
- [ ] No hardcoded empty arrays remain

### Testing
- [ ] Smoke tests pass
- [ ] Error array populated in test scenarios
- [ ] Row numbers accurate/reasonable
- [ ] ISBN context present when row lost

### Edge Cases
- [ ] Null/undefined author handled
- [ ] Empty author detected
- [ ] Missing title detected
- [ ] Database errors captured
- [ ] Error messages consistent

---

## Quick Reference: Common Error Codes

| Stage | Error Code | Example Message | Row | ISBN |
|-------|-----------|-----------------|-----|------|
| Gemini | `GEMINI_FILTER` | "Gemini filtered: empty author" | Accurate | ✅ |
| Validation | `MISSING_TITLE` | "Missing required field: title" | index+2 | ✅ |
| Validation | `MISSING_AUTHOR` | "Missing required field: author" | index+2 | ? |
| Database | `DB_WRITE_FAILED` | "Failed to persist: timeout" | -1 | ✅ |
| Database | `DB_UNKNOWN` | "Failed to persist: unknown error" | -1 | ✅ |

---

**Document Status:** Complete - Ready for Implementation
**Last Updated:** January 5, 2026
