# PR #242 Implementation Plan: Fix CSV Validation Silent Failures

**Related PR:** #242 (feat: Store CSV validation errors with row numbers)
**Parent Issue:** #243 (Critical - Fix silent failure in CSV validation error tracking)
**GitHub Issue:** #249
**Status:** 🔧 IMPLEMENTATION READY
**Created:** January 5, 2026
**Analysis:** Claude Code (Sonnet 4.5) + PAL MCP (Gemini 2.5 Flash)

---

## ⚠️ CRITICAL UPDATE: MVP VALIDATION REQUIRED FIRST

**Problem Identified:** We are building a solution based on assumptions about Gemini's capabilities without validating them first.

**Current Assumption:** Gemini can return both successfully parsed books AND validation errors with row numbers in a structured format.

**Reality Check Needed:** We haven't tested whether:
1. Gemini can return failures alongside successes
2. Gemini can track row numbers for failed validations
3. Our schema supports dual return (books + errors)
4. The response structure can handle partial failures

**REVISED PHASE 0: Build MVP to Validate Gemini Capabilities**

Before implementing the full solution, we must:

1. **Create test CSV with known failures:**
   ```csv
   Title,Author,ISBN
   "Valid Book","John Smith",9780000000001
   "Missing Author","",9780000000002
   "","Jane Doe",9780000000003
   "Whitespace Author","   ",9780000000004
   "Valid Book 2","Alice Johnson",9780000000005
   ```

2. **Test current Gemini response:**
   - Does Gemini filter out invalid rows silently?
   - Does Gemini include row numbers in any form?
   - What does the response schema look like?

3. **Experiment with schema modifications:**
   - Can we update `CSV_BOOK_SCHEMA` to request error tracking?
   - Can we add a parallel `errors` array to the schema?
   - Will Gemini respect a schema like:
     ```typescript
     {
       type: 'object',
       properties: {
         books: { type: 'array', items: { ... } },
         errors: { type: 'array', items: { ... } }
       }
     }
     ```

4. **Test prompt engineering:**
   - Can we ask Gemini to return both valid books AND error details?
   - Example prompt addition:
     ```
     For each invalid row, return an error object with:
     - rowNumber (1-based, including header)
     - reason (missing title, missing author, etc.)
     - originalData (the row data that failed)
     ```

5. **Create proof-of-concept script:**
   ```typescript
   // tests/mvp/gemini-error-tracking-mvp.ts
   // Quick script to validate Gemini's error tracking capabilities
   // Run with: npx tsx tests/mvp/gemini-error-tracking-mvp.ts
   ```

**MVP Success Criteria:**
- [ ] Gemini returns both valid books and error details
- [ ] Error details include row numbers
- [ ] Schema supports dual return structure
- [ ] Response parsing works reliably

**If MVP Fails:**
- Fall back to client-side error tracking (filter AFTER Gemini parsing)
- Document that Gemini cannot provide row numbers for filtered books
- Adjust implementation plan to work within Gemini's constraints

**MVP Effort:** 1-2 hours

---

## Problem Summary

PR #242 implements CSV validation error tracking but has **critical silent failures** where validation errors are never reported to users. The `errors` array in API responses is hardcoded to empty despite the schema supporting error tracking.

### Root Cause

**Three error sources are being silently discarded:**

1. **Gemini Provider Filtering** - Books with whitespace-only authors filtered out (logged but not returned)
2. **Validation Filtering** - Books missing required fields filtered (not tracked at all)
3. **Database Save Failures** - Failed saves counted but individual errors not captured

**Critical Code Location:** `src/utils/jobs/csv-processor-core.ts:406`
```typescript
errors: [], // TODO: Store validation errors with row numbers  ← HARDCODED EMPTY!
```

### User Impact (CRITICAL)

- User imports 500-row CSV
- 50 books fail validation
- User sees: **"450 books imported"** (no explanation of missing 50)
- User must manually diff CSV against output
- **No actionable feedback** to fix issues

---

## Solution Architecture

### Phase 0: MVP - Validate Gemini Capabilities (NEW - REQUIRED FIRST)

**Goal:** Prove Gemini can return validation errors with row numbers before building the full solution.

**Tasks:**

1. **Create MVP test script** (`tests/mvp/gemini-error-tracking-mvp.ts`):
   ```typescript
   import { parseCSVWithGemini } from '../../src/providers/gemini-csv-provider'

   const testCSV = `Title,Author,ISBN
   "Valid Book","John Smith",9780000000001
   "Missing Author","",9780000000002
   "","Jane Doe",9780000000003
   "Whitespace Author","   ",9780000000004
   "Valid Book 2","Alice Johnson",9780000000005`

   async function testGeminiErrorTracking() {
     const apiKey = process.env.GEMINI_API_KEY

     console.log('Testing Gemini with known failures...')
     const result = await parseCSVWithGemini(testCSV, buildTestPrompt(), apiKey)

     console.log('Result:', JSON.stringify(result, null, 2))
     console.log('Books returned:', result.length)
     console.log('Expected: 2 valid, 3 invalid')
   }
   ```

2. **Experiment with schema modifications:**
   - Test if `CSV_BOOK_SCHEMA` can support dual return:
     ```typescript
     const DUAL_RETURN_SCHEMA = {
       type: 'object',
       properties: {
         validBooks: {
           type: 'array',
           items: { /* existing book schema */ }
         },
         invalidRows: {
           type: 'array',
           items: {
             type: 'object',
             properties: {
               rowNumber: { type: 'integer' },
               reason: { type: 'string' },
               title: { type: 'string', nullable: true },
               author: { type: 'string', nullable: true }
             }
           }
         }
       }
     }
     ```

3. **Test prompt engineering:**
   - Add to system instruction:
     ```
     IMPORTANT: For rows that fail validation (missing title/author,
     whitespace-only fields), include them in the 'invalidRows' array
     with the 1-based row number and reason for failure.
     ```

4. **Document findings:**
   - What CAN Gemini return?
   - What CANNOT Gemini track?
   - What's the most reliable approach?

**Deliverables:**
- `tests/mvp/gemini-error-tracking-mvp.ts` - Test script
- `docs/MVP_FINDINGS.md` - Results and recommendations
- Decision: Proceed with Gemini-based tracking OR client-side filtering

**Effort:** 1-2 hours

**Success Criteria:**
- [ ] Gemini returns structured error information
- [ ] Row numbers are accurate
- [ ] Schema changes are minimal
- [ ] Performance impact is acceptable

**If MVP Fails:**
Implement Plan B: Client-side error tracking after Gemini parsing (detailed in Phase 1B below).

---

### Phase 1A: Update Gemini Provider (If MVP Succeeds)

**File:** `src/providers/gemini-csv-provider.ts`

**Changes:**

1. **Define error interface:**
   ```typescript
   export interface ProcessingError {
     rowNumber: number
     message: string
     code: 'gemini_filter_whitespace' | 'validation_missing_field' | 'unknown'
     field?: string
     value?: string
   }

   export interface GeminiParseResult {
     books: CSVParsedBook[]
     errors: ProcessingError[]
   }
   ```

2. **Update schema to support dual return:**
   ```typescript
   const CSV_DUAL_RETURN_SCHEMA = {
     type: 'object',
     properties: {
       validBooks: { /* existing schema */ },
       invalidRows: { /* error schema from MVP */ }
     }
   }
   ```

3. **Update function signature:**
   ```typescript
   export async function parseCSVWithGemini(
     csvText: string,
     prompt: string,
     apiKey: string,
   ): Promise<GeminiParseResult>
   ```

4. **Parse dual return from Gemini:**
   ```typescript
   const parsed = JSON.parse(textResponse)
   const books = parsed.validBooks || parsed  // Backward compat
   const errors = parsed.invalidRows?.map(row => ({
     rowNumber: row.rowNumber,
     message: `${row.reason}`,
     code: determineErrorCode(row.reason),
     field: row.field,
     value: row.value
   })) || []

   return { books, errors }
   ```

**Effort:** 30 minutes

---

### Phase 1B: Client-Side Error Tracking (If MVP Fails)

**File:** `src/providers/gemini-csv-provider.ts`

**Alternative approach if Gemini cannot track errors:**

1. **Keep existing Gemini parsing logic unchanged**
2. **Add post-processing error detection:**
   ```typescript
   export async function parseCSVWithGemini(
     csvText: string,
     prompt: string,
     apiKey: string,
   ): Promise<GeminiParseResult> {
     // Existing Gemini call...
     const books = await callGeminiAPI(csvText, prompt, apiKey)

     // Client-side error tracking
     const errors: ProcessingError[] = []
     const validBooks = books.filter((book, index) => {
       const hasValidAuthor = book.author && book.author.trim().length > 0
       if (!hasValidAuthor) {
         errors.push({
           rowNumber: index + 2,  // Best guess at row number
           message: `Book "${book.title}" has missing or whitespace-only author field`,
           code: 'gemini_filter_whitespace',
           field: 'author',
           value: book.author || '(empty)',
         })
       }
       return hasValidAuthor
     })

     return { books: validBooks, errors }
   }
   ```

**Limitation:** Row numbers will be approximate since we don't know which rows Gemini filtered internally.

**Effort:** 20 minutes

---

### Phase 2: Update CSV Processor Core

**File:** `src/utils/jobs/csv-processor-core.ts`

**Changes:**

1. **Update dependency interface** (line 131):
   ```typescript
   import type { ProcessingError } from '../types/processing-errors'

   export interface ProcessorDependencies {
     validateCSV: (csvText: string) => CSVValidationResult
     parseCSVWithGemini: (csvText: string, prompt: string, apiKey: string) => Promise<GeminiParseResult>
   }
   ```

2. **Update callGemini return type** (line 488):
   ```typescript
   async function callGemini(
     csvText: string,
     prompt: string,
     env: Env,
     deps: ProcessorDependencies,
   ): Promise<GeminiParseResult>
   ```

3. **Initialize error tracking** (after line 174):
   ```typescript
   // Track all processing errors with row numbers
   const processingErrors: ProcessingError[] = []
   ```

4. **Collect Gemini errors** (lines 226-242):
   ```typescript
   if (!parsedBooks) {
     const prompt = buildCSVParserPrompt()
     const geminiResult = await callGemini(csvText, prompt, env, deps)

     parsedBooks = geminiResult.books

     // Collect Gemini filtering errors
     processingErrors.push(...geminiResult.errors)

     if (!Array.isArray(parsedBooks) || parsedBooks.length === 0) {
       throw new Error('No valid books found in CSV')
     }

     await env.CACHE.put(cacheKey, JSON.stringify(parsedBooks), {
       expirationTtl: 604800,
     })
   }
   ```

5. **Collect validation errors** (lines 253-259):
   ```typescript
   const validatedBooks: ValidatedBook[] = parsedBooks
     .map((book, index) => {
       if (!book.title || !book.author) {
         processingErrors.push({
           rowNumber: index + 2,
           message: `Missing required field: ${!book.title ? 'title' : 'author'}`,
           code: 'validation_missing_field',
           field: !book.title ? 'title' : 'author',
           value: book.isbn,
         })
         return null
       }
       return {
         title: String(book.title).trim(),
         author: String(book.author).trim(),
         isbn: book.isbn ? String(book.isbn).trim() : undefined,
       }
     })
     .filter((book): book is ValidatedBook => book !== null)
   ```

6. **Collect database save errors** (after line 310):
   ```typescript
   const results = await processWithLimit(saveTasks, 20)
   const savedCount = results.filter((r) => r.status === 'fulfilled').length
   const failedCount = results.filter((r) => r.status === 'rejected').length

   // Capture save failures with context
   const saveErrors: ProcessingError[] = results
     .map((result, index) => {
       if (result.status === 'rejected') {
         const book = booksWithValidISBN[index]
         const errorMessage = result.reason?.message || 'Unknown error'

         return {
           rowNumber: -1, // TODO: Track original CSV row number
           message: `Failed to save book: ${errorMessage}`,
           code: 'database_other',
           field: 'isbn',
           value: book.isbn,
           details: { error: errorMessage },
         }
       }
       return null
     })
     .filter((err): err is ProcessingError => err !== null)

   processingErrors.push(...saveErrors)
   ```

7. **Populate errors array** (line 406):
   ```typescript
   const apiContractResults: APIContractResults = {
     booksCreated: canonicalBooks.length,
     booksUpdated: 0,
     duplicatesSkipped: duplicatesSkipped,
     enrichmentSucceeded: 0,
     enrichmentFailed: 0,
     errors: processingErrors,  // ✅ FIXED: Actual errors with context
     books: canonicalBooks,
   }
   ```

**Files modified:**
- `src/utils/jobs/csv-processor-core.ts`

**Effort:** 1 hour

**⚠️ Known Issue:** Database save errors currently have `rowNumber: -1` because we lose the original CSV row context during the save pipeline.

---

### Phase 3: Fix Failing Tests

**File:** `tests/gemini-csv-provider.test.js`

**Tests to update:**

1. **"filters out books with empty author strings"** (lines 200-233)
2. **"handles null author by filtering out"** (lines 267-298)
3. **"logs warning when books are filtered"** (lines 300-339)

**Example fix for test 1:**
```javascript
it('returns errors for books with empty author strings', async () => {
  const csvText = 'Title,Author,ISBN\n"Book One","",9780000000001\n"Book Two","Jane Smith",9780000000002'
  const prompt = 'Parse this CSV'
  const apiKey = 'test-key'

  const result = await parseCSVWithGemini(csvText, prompt, apiKey)

  // Check that valid books are returned
  expect(result.books).toHaveLength(1)
  expect(result.books[0]).toMatchObject({
    title: 'Book Two',
    author: 'Jane Smith'
  })

  // Check that errors are returned for filtered books
  expect(result.errors).toHaveLength(1)
  expect(result.errors[0]).toMatchObject({
    rowNumber: 2,
    code: 'gemini_filter_whitespace',
    field: 'author'
  })
})
```

**Files modified:**
- `tests/gemini-csv-provider.test.js`

**Effort:** 30 minutes

---

### Phase 4: Add Critical Test Coverage

**File:** `tests/unit/services/csv-processor-core.test.ts`

**Add 4 critical test scenarios:**

1. **CSV validation failure path** (Criticality: 10/10)
   ```typescript
   it('should populate errors array when CSV validation fails', async () => {
     // Test that invalid CSV structure returns validation error
   })
   ```

2. **Empty CSV from Gemini** (Criticality: 9/10)
   ```typescript
   it('should handle empty book array from Gemini', async () => {
     // Test that Gemini returning zero books throws appropriate error
   })
   ```

3. **Null/undefined field handling** (Criticality: 9/10)
   ```typescript
   it('should track errors for books with null/undefined required fields', async () => {
     // Test that books with null title/author are tracked in errors array
   })
   ```

4. **All valid rows happy path** (Criticality: 8/10)
   ```typescript
   it('should have empty errors array when all rows are valid', async () => {
     // Test that successful processing has no errors
   })
   ```

**Files modified:**
- `tests/unit/services/csv-processor-core.test.ts`

**Effort:** 1.5 hours

---

## Open Questions & Challenges

### 🔴 Critical: Gemini Capability Validation

**Status:** ⚠️ UNVALIDATED - MVP REQUIRED

**Questions:**
1. Can Gemini return both valid books AND error details in one response?
2. Can Gemini track row numbers for failed validations?
3. What schema structure does Gemini support for dual returns?
4. What's the performance impact of dual-return schema?

**Resolution:** Complete Phase 0 MVP before proceeding.

---

### 🔴 Critical: Database Error Row Number Association

**Problem:** When a database save fails, we lose the original CSV row number context.

**Current Code:**
```typescript
const saveTasks = booksWithValidISBN.map((geminiBook) => async () => {
  const bookRecord = mapGeminiCSVBookToBookRecord(geminiBook)
  await bookRepo.save(bookRecord)
})
const results = await processWithLimit(saveTasks, 20)
```

**Challenge:** The `geminiBook` object doesn't carry the original CSV row number.

**Possible Solutions:**

1. **Add rowNumber to ParsedBook interface** (cleanest)
   - Update `ParsedBook` to include `_rowNumber?: number`
   - Track row during Gemini parsing
   - Propagate through save pipeline

2. **Use parallel arrays** (quick fix)
   - Maintain `Map<isbn, rowNumber>` alongside books array
   - Look up row number when save fails

3. **Enhance save task closure** (immediate)
   - Pass row number into save task closure
   - Return row number with success/failure result

**Recommendation:** Solution 1 (add rowNumber to ParsedBook) for long-term maintainability.

---

## Implementation Checklist

### Phase 0: MVP Validation (REQUIRED FIRST)
- [ ] Create `tests/mvp/gemini-error-tracking-mvp.ts`
- [ ] Test current Gemini behavior with failing rows
- [ ] Experiment with schema modifications
- [ ] Test prompt engineering for error tracking
- [ ] Document findings in `docs/MVP_FINDINGS.md`
- [ ] **DECISION:** Proceed with Phase 1A OR 1B based on MVP results

### Phase 1A: Gemini-Based Tracking (If MVP succeeds)
- [ ] Define `ProcessingError` interface
- [ ] Update `CSV_BOOK_SCHEMA` to support dual return
- [ ] Update `parseCSVWithGemini` return type
- [ ] Parse errors from Gemini response
- [ ] Return `{ books, errors }`

### Phase 1B: Client-Side Tracking (If MVP fails)
- [ ] Define `ProcessingError` interface
- [ ] Add post-processing error detection
- [ ] Filter books and collect errors
- [ ] Document row number limitations

### Phase 2: CSV Processor Core
- [ ] Import `ProcessingError` and `GeminiParseResult`
- [ ] Update `ProcessorDependencies` interface
- [ ] Update `callGemini` return type
- [ ] Initialize `processingErrors` array
- [ ] Collect Gemini errors
- [ ] Collect validation errors
- [ ] Collect database save errors
- [ ] Populate `errors` array at line 406
- [ ] **RESOLVE:** Database row number tracking

### Phase 3: Fix Tests
- [ ] Update "filters out books with empty author strings"
- [ ] Update "handles null author by filtering out"
- [ ] Update "logs warning when books are filtered"
- [ ] Verify all tests pass

### Phase 4: Add Tests
- [ ] Add CSV validation failure test
- [ ] Add empty Gemini response test
- [ ] Add null/undefined field test
- [ ] Add all valid rows happy path test
- [ ] Verify coverage increase

### Final Validation
- [ ] Run `npm run test:safe`
- [ ] Manual test: CSV with mixed valid/invalid rows
- [ ] Verify `errors` array contains actionable feedback
- [ ] Update PR #242 description with changes
- [ ] Request review

---

## Risk Assessment

### Medium Risk (NEW)
- ⚠️ Gemini may not support error tracking natively
- ⚠️ Schema changes may impact performance
- ⚠️ Prompt engineering may not be reliable

### Low Risk
- ✅ Breaking change to `parseCSVWithGemini` (internal API, single caller)
- ✅ Memory increase (~500 bytes for 500-row CSV)

### Benefits
- ✅ Users get actionable error feedback
- ✅ No more silent data loss
- ✅ Better debugging for support
- ✅ Compliance with API contract schema

---

## Effort Estimate

| Phase | Task | Time |
|-------|------|------|
| 0 | **MVP: Validate Gemini capabilities** | **1-2 hours** |
| 1A | Update Gemini provider (if MVP succeeds) | 30 min |
| 1B | Client-side tracking (if MVP fails) | 20 min |
| 2 | Update CSV processor core | 1 hour |
| 3 | Fix failing tests | 30 min |
| 4 | Add critical tests | 1.5 hours |
| **Total** | **Implementation** | **3.5-4.5 hours** |

**Note:** Phase 0 MVP must complete successfully before proceeding with remaining phases.

---

## Related Issues

- #249 - This implementation plan (GitHub issue)
- #243 - PR #242 critical silent failures (parent issue)
- #160 - Original CSV validation issue
- PR #242 - feat: Store CSV validation errors with row numbers

---

## Decision Log

### January 5, 2026: MVP Validation Required

**Decision:** Add Phase 0 MVP to validate Gemini capabilities before full implementation.

**Rationale:**
- We assumed Gemini could return errors + row numbers without testing
- Schema changes may have performance implications
- Client-side fallback may be more reliable

**Impact:** +1-2 hours to total effort, but reduces risk significantly.

---

**Created:** January 5, 2026
**Last Updated:** January 5, 2026
**Status:** Awaiting MVP validation
**Owner:** @jukasdrj
