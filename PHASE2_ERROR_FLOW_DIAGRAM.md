# Phase 2 Error Flow Diagram & Visual Guide

**Companion to:** PHASE2_ERROR_PROPAGATION_PLAN.md
**Purpose:** Visual representation of error propagation through CSV processor pipeline

---

## Overall Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     CSV IMPORT REQUEST                          │
│                  (Raw CSV from iOS app)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: GEMINI PARSING (processCSVCore: lines 204-242)        │
│                                                                 │
│ Input: csvText (raw CSV)                                        │
│ Output: GeminiParseResult {books, errors}  [PHASE 1 OUTPUT]    │
│                                                                 │
│ ✅ Gemini parses rows                                           │
│ ✅ Filters out whitespace-only authors                          │
│ ✅ Returns errors with row numbers                              │
│                                                                 │
│ Error Capture:                                                  │
│   processingErrors.push(...geminiResult.errors)                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┴────────────────┐
           ▼                                ▼
   ┌──────────────────┐          ┌─────────────────┐
   │ Books[]          │          │ Errors[]        │
   │ (valid parsed)   │          │ (FP #1)         │
   │                  │          │ Gemini filters  │
   └────────┬─────────┘          └─────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: VALIDATION FILTERING (lines 253-259) [PHASE 2]       │
│                                                                 │
│ Input: ValidatedBook[] (from Stage 1 books)                    │
│ Output: ValidatedBook[] (cleaned)                              │
│                                                                 │
│ Check: Does book have non-empty title AND author?              │
│                                                                 │
│ ✅ Filters to ensure required fields present                   │
│ ✅ Trims whitespace                                            │
│ ✅ Returns validated books only                                │
│                                                                 │
│ Error Capture:                                                  │
│   For each book:                                               │
│     if !title or !author:                                      │
│       processingErrors.push({                                  │
│         row: index + 2,                                        │
│         error: "Missing field: {title|author}"                │
│       })                                                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┴────────────────┐
           ▼                                ▼
   ┌──────────────────┐          ┌─────────────────┐
   │ ValidatedBook[]  │          │ Errors[]        │
   │ (required fields)│          │ (FP #2)         │
   │                  │          │ Validation      │
   └────────┬─────────┘          └─────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3: ISBN CATEGORIZATION (lines 277-285) [PASSIVE]        │
│                                                                 │
│ Input: ValidatedBook[] (from Stage 2)                          │
│ Output: booksWithISBN[], booksWithoutISBN[]                    │
│                                                                 │
│ ✅ Separates books by valid ISBN presence                      │
│ ✅ Identifies duplicates (counted, not errored)                │
│                                                                 │
│ No Error Capture:                                              │
│   - Duplicates = intentional behavior (not errors)            │
│   - Logged for observability, not in errors array             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┴────────────────┐
           ▼                                ▼
   ┌──────────────────┐          ┌─────────────────┐
   │ booksToSave[]    │          │ duplicates: N   │
   │ (unique only)    │          │ (tracked count) │
   │                  │          │                 │
   └────────┬─────────┘          └─────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4: DATABASE PERSISTENCE (lines 299-310) [PHASE 2]       │
│                                                                 │
│ Input: booksToSave[] (validated, unique)                       │
│ Output: Promise<PromiseSettledResult[]>                        │
│                                                                 │
│ For each book:                                                 │
│   mapGeminiCSVBookToBookRecord(book)  →  BookRecord            │
│   bookRepo.save(bookRecord)  →  FULFILLED | REJECTED          │
│                                                                 │
│ Error Capture:                                                  │
│   For each REJECTED result:                                    │
│     processingErrors.push({                                    │
│       row: -1,  // Lost at this stage                         │
│       isbn: book.isbn,                                         │
│       error: "Failed to persist: {db error}"                  │
│     })                                                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┴────────────────┐
           ▼                                ▼
   ┌──────────────────┐          ┌─────────────────┐
   │ CanonicalBook[]  │          │ Errors[]        │
   │ (saved to D1+KV) │          │ (FP #4)         │
   │                  │          │ Database        │
   └────────┬─────────┘          │ (row=-1)        │
            │                    └─────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 5: API RESPONSE CONSTRUCTION (line 406) [PHASE 2]       │
│                                                                 │
│ Input: processingErrors[] (accumulated from all stages)        │
│ Output: APIContractResults                                     │
│                                                                 │
│ {                                                              │
│   booksCreated: N,                                             │
│   booksUpdated: 0,                                             │
│   duplicatesSkipped: N,                                        │
│   enrichmentSucceeded: 0,                                      │
│   enrichmentFailed: 0,                                         │
│   errors: processingErrors,   ✅ FIXED (was [])              │
│   books: canonicalBooks[]                                      │
│ }                                                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 API RESPONSE TO CLIENT                          │
│         (JobResults envelope with errors array)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Error Accumulation Pattern

```
processCSVCore()
│
├─ const processingErrors: ProcessingError[] = []  ← Initialize
│
├─ Stage 1: Gemini
│  └─ processingErrors.push(...geminiResult.errors)  ← Collect FP#1
│
├─ Stage 2: Validation
│  └─ For each invalid book:
│     processingErrors.push({ row, error })  ← Collect FP#2
│
├─ Stage 3: Deduplication
│  └─ (No error collection, just counting)
│
├─ Stage 4: Database
│  └─ For each failed save:
│     processingErrors.push({ row: -1, error })  ← Collect FP#4
│
└─ Stage 5: API Contract
   └─ errors: processingErrors  ← Populate response array
```

---

## Failure Point #1: Gemini Filtering (Phase 1 Output)

```
CSV Row 1: "Book Title" | "Author Name" | "978-123..."
CSV Row 2: "Book 2"     | ""             | "978-456..."  ← Empty author
CSV Row 3: "Book 3"     | "Author 3"     | "978-789..."
           │
           ├─ Gemini parses all 3 rows
           │
           ├─ Returns { books: [Row 1, Row 3], errors: [Row 2] }
           │
           └─ Error Detail:
              {
                row: 2,
                error: "Empty or whitespace-only author field"
              }

processingErrors.push(...geminiResult.errors)
│
└─ Result: processingErrors = [FP#1 error]
```

---

## Failure Point #2: Validation (Lines 253-259)

```
Input: ParsedBook[] [
  { title: "Book A", author: "Author A", isbn: "978-111" },
  { title: "",       author: "Author B", isbn: "978-222" },  ← Empty title
  { title: "Book C", author: "Author C", isbn: "978-333" }
]

Processing:
  index 0: title="Book A" ✅ → ValidatedBook
  index 1: title="" ❌ → processingErrors.push({
             row: 2,          // 0-based index + 2 (1-based, +header)
             error: "Missing required field: title"
           })
  index 2: title="Book C" ✅ → ValidatedBook

Output: ValidatedBook[] [Book A, Book C]
Result: processingErrors = [FP#2 error]
```

---

## Failure Point #3: ISBN Categorization (Lines 277-285)

```
Input: ValidatedBook[] [
  { title: "A", author: "Author", isbn: "978-111" },  ← Valid ISBN
  { title: "B", author: "Author", isbn: "978-111" },  ← Duplicate ISBN
  { title: "C", author: "Author", isbn: "978-111" },  ← Duplicate ISBN
  { title: "D", author: "Author", isbn: undefined },  ← No ISBN
]

Processing:
  booksWithISBN: [A, B, C]
  booksWithoutISBN: [D]

  deduplicateBooksByISBN(booksWithISBN) → [A]
  duplicatesSkipped = 3 - 1 = 2

  booksToSave = [A, D]

Note: NO individual errors for duplicates
      Duplicates are not failures - tracked as count instead
```

---

## Failure Point #4: Database Saves (Lines 299-310)

```
Input: booksToSave[] (4 books to save to D1)

For each book, run: bookRepo.save(bookRecord)

Results:
  [0] FULFILLED (saved successfully)
  [1] REJECTED  (D1 write timeout)      ← Error
  [2] FULFILLED (saved successfully)
  [3] REJECTED  (D1 unique constraint)  ← Error

Error Capture:
  result[1].status === 'rejected':
    processingErrors.push({
      row: -1,           // Lost at this stage
      isbn: books[1].isbn,
      error: "Failed to persist to database: timeout"
    })

  result[3].status === 'rejected':
    processingErrors.push({
      row: -1,
      isbn: books[3].isbn,
      error: "Failed to persist to database: unique constraint violation"
    })

Result: processingErrors += 2 errors from database
```

---

## Failure Point #5: API Contract Integration (Line 406)

```
processingErrors[] (accumulated from all stages):
[
  { row: 2, error: "Empty author (Gemini filter)" },           ← FP#1
  { row: 4, error: "Missing required field: title" },          ← FP#2
  { row: -1, isbn: "978-456", error: "D1 write failed" },      ← FP#4
  { row: -1, isbn: "978-789", error: "D1 timeout" }            ← FP#4
]

APIContractResults {
  booksCreated: 2,                  // Books that made it through
  booksUpdated: 0,
  duplicatesSkipped: 2,             // Tracked separately
  enrichmentSucceeded: 0,
  enrichmentFailed: 0,
  errors: processingErrors,         // ✅ POPULATED (was hardcoded [])
  books: [2 canonical books]        // Only successful books
}
```

---

## Row Number Tracking Strategy

### Row Number Sources by Stage

```
CSV Input (Original):
  Header (Row 0 in array, Row 1 in display)
  Row 1  (Row 1 in array, Row 2 in display)
  Row 2  (Row 2 in array, Row 3 in display)
  Row 3  (Row 3 in array, Row 4 in display)

Conversion Formula: display_row = array_index + 2

Stage 1 (Gemini):
  Source: Gemini's structured output includes row numbers
  Quality: Excellent ✅
  Example: { row: 2, error: "..." } = CSV Row 2

Stage 2 (Validation):
  Source: Array index of parsed book
  Quality: Good ✅
  Example: parsedBooks[1] → row: 1 + 2 = 3

Stage 3 (Deduplication):
  Source: Lost during deduplication
  Quality: Lost ⚠️
  Tracked as: duplicatesSkipped (count, not individual rows)

Stage 4 (Database):
  Source: Unknown at save time
  Quality: Lost ❌
  Fallback: row: -1, but include isbn for context
  Example: { row: -1, isbn: "978-456", error: "..." }

Stage 5 (API):
  Source: Accumulated from all stages
  Quality: Mixed (Excellent for FP#1-2, Lost for FP#4)
```

---

## Error Message Examples

### FP#1: Gemini Filtering Errors
```json
{
  "row": 5,
  "isbn": "978-1-234567-89-0",
  "error": "Gemini filtered: empty or whitespace-only author field"
}
```

### FP#2: Validation Errors
```json
{
  "row": 7,
  "isbn": "978-1-234567-89-1",
  "error": "Missing required field: title"
}
```

### FP#2: Validation Errors (Missing Author)
```json
{
  "row": 12,
  "isbn": undefined,
  "error": "Missing required field: author"
}
```

### FP#4: Database Errors
```json
{
  "row": -1,
  "isbn": "978-1-234567-89-2",
  "error": "Failed to persist to database: D1 write timeout after 30s"
}
```

---

## Type Flow Diagram

```
Phase 1 Output (Gemini Provider)
├─ CSVParsedBook[]
└─ ProcessingError[]  ← New type (row, isbn, error)

    ↓ (Phase 2 begins)

ProcessorDependencies
├─ Input: GeminiParseResult { books, errors }
└─ Output: GeminiParseResult

CSV Processor Core
├─ Accumulates: ProcessingError[]
├─ Collects from: FP#1, FP#2, FP#4
└─ Outputs: APIContractResults

API Contract Results
├─ errors: ProcessingError[] OR JobErrorDetail[]  ← Needs mapping
├─ books: CanonicalBook[]
└─ Other fields: counts, summary

iOS App Response
├─ Receives: JobResults (with errors array)
└─ Can display: Row numbers, error messages, ISBN context
```

---

## Code Transformation Overview

```typescript
// BEFORE (Hardcoded empty)
const apiContractResults: APIContractResults = {
  errors: [],  // ❌ TODO comment, never populated
  // ...other fields
}

// AFTER (Populated from accumulation)
const processingErrors: ProcessingError[] = []

// ...throughout processing...
processingErrors.push(...geminiResult.errors)      // FP#1
processingErrors.push({ row, error })              // FP#2
processingErrors.push({ row: -1, isbn, error })    // FP#4

const apiContractResults: APIContractResults = {
  errors: processingErrors,  // ✅ FIXED: Contains all errors
  // ...other fields
}
```

---

## Key Metrics

### Error Count Estimates (500-Row CSV)

| Scenario | Books | Errors | Rate |
|----------|-------|--------|------|
| All valid | 500 | 0 | 0% |
| 10% invalid | 450 | 50 | 10% |
| 20% invalid | 400 | 100 | 20% |
| Heavy errors | 250 | 250 | 50% |

### Payload Impact

```
Error Object Size:
  { row: -1, isbn: "978-123...", error: "..." }
  ≈ 100 bytes (typical)

500-Book CSV with 10% errors:
  50 errors × 100 bytes = 5 KB
  Well within KV limits (1 MB typical)

500-Book CSV with 50% errors:
  250 errors × 100 bytes = 25 KB
  Still acceptable
```

---

## Debugging Guide

### How to Trace an Error Through the Pipeline

1. **Check error.row value:**
   - If `row >= 2`: Came from Gemini (FP#1) or Validation (FP#2)
   - If `row === -1`: Came from Database (FP#4)

2. **Check error.isbn value:**
   - If present: Helps identify the book
   - If undefined: Book had no ISBN (common for FP#2 on missing author)

3. **Check error.error message:**
   - "Gemini filtered" = FP#1
   - "Missing required field" = FP#2
   - "Failed to persist" = FP#4

4. **Cross-reference with CSV:**
   - For FP#1/FP#2: Go to row N in CSV (1-based)
   - For FP#4: Find ISBN in saved results, check error

---

**Document Status:** Visual Reference (Companion to Main Plan)
**Last Updated:** January 5, 2026
