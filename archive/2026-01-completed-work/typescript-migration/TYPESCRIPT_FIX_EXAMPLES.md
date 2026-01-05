# TypeScript Fix Examples & Code Patterns

**Quick Reference:** Copy-paste ready solutions for common error patterns in bendv3

---

## Pattern 1: Handler Type Mismatch - @hono/zod-openapi

### Error Pattern
```typescript
// TS2345: Argument of type 'Promise<Response>' is not assignable to parameter of type 'Handler<...>'
app.openapi(route, async (c) => {
  const book = await findBook(isbn)
  if (!book) {
    return c.json({ error: 'Not found' }, 404)  // ❌ WRONG: Returns Response
  }
  return c.json({ data: book }, 200)  // ❌ WRONG: Missing success field
})
```

### Solution Pattern
```typescript
// ✅ CORRECT: Matches Zod schema exactly
app.openapi(route, async (c) => {
  const book = await findBook(isbn)
  if (!book) {
    return c.json(
      createProblemDetails('NOT_FOUND', 'Book not found', {
        requestId: c.get('ctx').requestId,
        instance: c.req.url,
      }),
      404
    )
  }
  return c.json(
    {
      success: true,
      data: book,
      metadata: {
        source: 'cache',
        cached: true,
        timestamp: new Date().toISOString(),
      },
    },
    200
  )
})
```

**Key Points:**
- All error responses use `createProblemDetails()`
- All success responses have `success: true` discriminator
- Response structure MUST match Zod schema
- Use standard fields: data, metadata, error
- Never invent custom top-level properties

### Files to Apply This Pattern
- `src/api-v3/index.ts` - Book search, enrich endpoints
- `src/api-v3/jobs/enrichment.ts` - Job status/results endpoints
- `src/api-v3/jobs/imports.ts` - Import job endpoints
- `src/api-v3/jobs/scans.ts` - Scan job endpoints
- `src/api-v3/discovery.ts` - Recommendations endpoint

---

## Pattern 2: DurableObject Payload Type Guards

### Error Pattern
```typescript
// TS18046: Variable 'payload' is of type 'unknown'
handleMessage(payload: unknown) {
  const jobId = payload.jobId  // ❌ WRONG: No type information
  const status = payload.status  // ❌ WRONG: Property access on unknown
  console.log(jobId, status)
}
```

### Solution Pattern
```typescript
// Define strict interface for payload
interface MessagePayload {
  jobId: string
  status: 'initialized' | 'processing' | 'completed' | 'failed' | 'canceled'
  progress?: number
  processedCount?: number
}

// Type guard function
function isMessagePayload(value: unknown): value is MessagePayload {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.jobId === 'string' &&
    typeof obj.status === 'string' &&
    (obj.progress === undefined || typeof obj.progress === 'number')
  )
}

// Usage in handler
handleMessage(payload: unknown) {
  if (!isMessagePayload(payload)) {
    console.error('Invalid message payload')
    return
  }
  // Now TypeScript knows the types
  const jobId = payload.jobId  // ✅ OK: string
  const status = payload.status  // ✅ OK: known enum
  console.log(jobId, status)
}
```

**Alternative: Simple Type Cast (for trusted sources)**
```typescript
handleMessage(payload: unknown) {
  const msg = payload as MessagePayload
  const { jobId, status } = msg
  // Use with caution - assumes data is valid
}
```

### Files to Apply This Pattern
- `src/durable-objects/job-state-manager.ts` - Line 387-416 (handle various message types)
- `src/durable-objects/websocket-connection.ts` - Message processing

---

## Pattern 3: DurableObjectStub Type Issues

### Error Pattern
```typescript
// TS2339: Property 'send' does not exist on type 'DurableObjectStub<undefined>'
const stub = getJobStateManagerDO(jobId, env)
stub.send({ jobId, status: 'completed' })  // ❌ WRONG: Type system doesn't know about send()
```

### Solution Pattern
```typescript
// Define the DurableObject interface
interface JobStateManager {
  getJobState(): Promise<JobState | null>
  send(message: JobMessage): Promise<void>
  updateProgress(update: ProgressUpdate): Promise<void>
}

// Type the stub properly
const stub = getJobStateManagerDO(jobId, env) as DurableObjectStub<JobStateManager>
// Now all methods are available
await stub.send({ jobId, status: 'completed' })  // ✅ OK
await stub.updateProgress({ progress: 0.5 })  // ✅ OK
```

**In helper function:**
```typescript
function getJobStateManagerDO(
  jobId: string,
  env: Env
): DurableObjectStub<JobStateManager> {
  const id = env.JOB_STATE_MANAGER_DO.idFromName(jobId)
  return env.JOB_STATE_MANAGER_DO.get(id) as DurableObjectStub<JobStateManager>
}
```

### Files to Apply This Pattern
- `src/durable-objects/job-state-manager.ts` - Lines 211, 288, 329, 374
- `src/api-v3/jobs/common.ts` - Helper function definitions

---

## Pattern 4: Optional Property Access

### Error Pattern
```typescript
// TS18048: 'data' is possibly 'undefined'
const books = response.data  // ❌ WRONG: data might not exist
const title = books[0].title  // ❌ WRONG: books might be undefined
```

### Solution Pattern
```typescript
// Use optional chaining operator ?.
const books = response.data?.books  // ✅ OK: Returns undefined if data doesn't exist
const title = books?.[0]?.title  // ✅ OK: Safe nested access

// Or explicit null check
if (!response.data) {
  return null
}
const { books } = response.data
const title = books[0].title  // ✅ OK: Now we know books exists
```

**With default values:**
```typescript
const title = response.data?.books?.[0]?.title ?? 'Unknown'  // ✅ OK: Falls back to 'Unknown'
const count = response.data?.count ?? 0  // ✅ OK: Default to 0
```

### Files to Apply This Pattern
- `src/api-v3/jobs/stream.ts` - Lines 397-416 (update object access)
- `src/services/book-service.ts` - Search result handling
- `src/handlers/book-search.ts` - Response data extraction

---

## Pattern 5: ProblemDetails Custom Properties

### Error Pattern
```typescript
// TS2353: Object literal may only specify known properties, and 'jobStatus' does not exist
return createProblemDetails('INVALID_REQUEST', 'Job failed', {
  jobStatus: 'failed',  // ❌ WRONG: Unknown property
  maxSize: 100,  // ❌ WRONG: Not a standard field
  photoIndex: 5,  // ❌ WRONG: Not a standard field
})
```

### Solution Pattern
```typescript
// Method 1: Use 'detail' field for custom data
return createProblemDetails('INVALID_REQUEST', 'Job failed', {
  detail: JSON.stringify({
    jobStatus: 'failed',
    maxSize: 100,
    photoIndex: 5,
  }),
  requestId: ctx?.requestId,
  instance: c.req.url,
})

// Method 2: Use standard RFC 9457 fields only
return createProblemDetails('INVALID_REQUEST', 'Request body is too large (max 100 MB)', {
  detail: `Received ${actualSize} MB`,
  requestId: ctx?.requestId,
  instance: c.req.url,
})

// Method 3: For job-specific errors, create custom response type
return c.json({
  type: 'https://api.example.com/errors/job-validation',
  status: 400,
  code: 'JOB_VALIDATION_ERROR',
  message: 'Job validation failed',
  jobStatus: 'failed',  // ✅ OK: Custom response (not ProblemDetails)
  maxSize: 100,
  photoIndex: 5,
}, 400)
```

**RFC 9457 Standard Fields:**
```typescript
{
  type: string           // Error type URI
  title: string          // Short human-readable label
  status: number         // HTTP status code
  detail: string         // Detailed explanation
  instance: string       // URI of affected resource
  code: string          // Application-specific error code (custom)
  errors: Array<{       // Validation errors (custom)
    field: string
    message: string
    code: string
  }>
}
```

### Files to Apply This Pattern
- `src/api-v3/jobs/enrichment.ts` - Lines 252, 275
- `src/api-v3/jobs/imports.ts` - Lines 117, 150, 417, 440
- `src/api-v3/jobs/scans.ts` - Lines 196, 220, 235, 263-291, 304-308, 321, 622, 645

---

## Pattern 6: Unused Variable Removal

### Error Pattern
```typescript
// TS6133: Variable 'ExecutionContext' is declared but its value is never read
import type { ExecutionContext } from '@cloudflare/workers-types'  // ❌ WRONG: Never used
import { DurableObject } from 'cloudflare:workers'

export class JobStateManagerDO extends DurableObject<Env> {
  // ...
}
```

### Solution Pattern
```typescript
// ✅ CORRECT: Remove unused import
import { DurableObject } from 'cloudflare:workers'

export class JobStateManagerDO extends DurableObject<Env> {
  // ...
}
```

**Command to find/remove:**
```bash
# Find unused imports
npx tsc --noEmit 2>&1 | grep "TS6133"

# Auto-fix with lint
npm run lint:fix
```

### Files to Apply This Pattern
- `src/durable-objects/job-state-manager.ts` - Line 2
- `src/workflows/import-book.ts` - Check imports

---

## Pattern 7: DurableObject Override Modifiers

### Error Pattern
```typescript
// TS4114: This member must have an 'override' modifier
export class CacheMetricsDO extends DurableObject<Env> {
  async fetch() {  // ❌ WRONG: Missing override
    // ...
  }

  async alarm() {  // ❌ WRONG: Missing override
    // ...
  }
}
```

### Solution Pattern
```typescript
// ✅ CORRECT: Add override modifier
export class CacheMetricsDO extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    // ...
  }

  override async alarm(): Promise<void> {
    // ...
  }
}
```

### Files to Apply This Pattern
- `src/durable-objects/cache-metrics.ts` - Lines 384, 907

---

## Pattern 8: Promise Type Arguments

### Error Pattern
```typescript
// TS2794: Expected 1 arguments, but got 0
const promise: Promise  // ❌ WRONG: Promise needs type argument
const results = await promises  // ❌ WRONG: Ambiguous type

// Or passing void where unknown expected
const futures: Promise<unknown>[] = []
futures.push(Promise.resolve())  // ❌ WRONG: Promise<void> doesn't match Promise<unknown>
```

### Solution Pattern
```typescript
// ✅ CORRECT: Specify type argument
const promise: Promise<void> = asyncFunction()
const promise: Promise<JobState> = fetchJobState()

// ✅ CORRECT: For unknown results
const futures: Promise<unknown>[] = []
futures.push(Promise.resolve() as Promise<unknown>)

// Or use Promise.all properly
const results = await Promise.all(futures)  // ✅ OK: Type is unknown[]
```

### Files to Apply This Pattern
- `src/durable-objects/job-state-manager.ts` - Lines 330, 336
- `src/api-v3/index.ts` - Line 379

---

## Pattern 9: Enum Type Mismatches

### Error Pattern
```typescript
// TS2322: Type '"initialized" | "processing" | "completed"' is not assignable to type 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
const status: JobStatus = 'initialized'  // ❌ WRONG: Schema uses different enum values
return { status }  // ❌ WRONG: Value doesn't match schema
```

### Solution Pattern
```typescript
// Check schema definition in @bookstrack/schemas
// src/api-v3/jobs/stream.ts - Map between internal and schema enums
const statusMap: Record<JobStatus, 'queued' | 'processing' | 'completed' | 'failed'> = {
  'initialized': 'queued',
  'processing': 'processing',
  'completed': 'completed',
  'failed': 'failed',
  'canceled': 'failed',  // Map canceled to failed for schema
}

// Use the mapping
const schemaStatus = statusMap[internalStatus]  // ✅ OK: Properly mapped
return { status: schemaStatus }
```

### Files to Apply This Pattern
- `src/api-v3/jobs/stream.ts` - Line 343

---

## Pattern 10: File Type Casting

### Error Pattern
```typescript
// TS2352: Conversion of type 'string & Blob' to type 'File' may be a mistake
const file = formData.get('photo') as File  // ❌ WRONG: FormData returns unknown types

// Or direct Blob to File conversion
const blob = new Blob([data])
const file = blob as File  // ❌ WRONG: Blob !== File
```

### Solution Pattern
```typescript
// Method 1: Create File from Blob properly
const blob = new Blob([data], { type: 'image/jpeg' })
const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' })  // ✅ OK

// Method 2: Type-safe FormData extraction
const formValue = formData.get('photo')
if (formValue instanceof File) {
  // ✅ OK: Now we know it's a File
  const file = formValue
}

// Method 3: For trusted sources (with warning)
const file = formData.get('photo') as unknown as File  // ✅ OK: Double cast signals intent
```

### Files to Apply This Pattern
- `src/api-v3/jobs/scans.ts` - Lines 304, 308

---

## Pattern 11: Unknown Type Discrimination

### Error Pattern
```typescript
// TS18046: Variable is of type 'unknown'
const data = JSON.parse(json)
if (data instanceof SomeClass) {  // ❌ WRONG: Class check doesn't work
  // ...
}
```

### Solution Pattern
```typescript
// Method 1: Type guard function
function isBookData(value: unknown): value is BookData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isbn' in value &&
    'title' in value
  )
}

// Method 2: Try-catch with type assertion
const data = JSON.parse(json) as BookData  // ✅ OK: Explicit assertion
if (!data.isbn) throw new Error('Missing isbn')  // ✅ OK: Validate after assertion

// Method 3: Zod validation (recommended)
const data = bookSchema.parse(JSON.parse(json))  // ✅ OK: Validated parsing
```

### Files to Apply This Pattern
- `src/durable-objects/job-state-manager.ts` - Lines 387-416
- `src/api-v3/jobs/stream.ts` - Update handling

---

## Quick Reference: Search & Replace Patterns

### Unused Import Removal
```bash
# Find and remove line
sed -i '' '/import type { ExecutionContext }/d' src/durable-objects/job-state-manager.ts
```

### Add Optional Chaining
```bash
# Replace property access without null check
# Before: payload.jobId
# After: payload?.jobId
# Only apply where type is unknown or optional
```

### Add Override Keywords
```bash
# Find methods in DurableObject classes
grep -n "async fetch\|async alarm" src/durable-objects/*.ts
# Add 'override' before 'async'
```

### Type Cast for WorkerEnv
```bash
# Find calls passing Env where WorkerEnv expected
grep -n "c.env" src/api-v3/index.ts
# Add ' as WorkerEnv' type cast
```

---

## Testing Your Fixes

### Verify Single File
```bash
npx tsc src/api-v3/index.ts --noEmit
```

### Count Errors by Category
```bash
npx tsc --noEmit 2>&1 | grep "^src/" | sed 's/.*error TS\([0-9]*\):.*/\1/' | sort | uniq -c | sort -rn
```

### Before/After Comparison
```bash
# Before: Get baseline
npx tsc --noEmit 2>&1 | grep "^src/" | wc -l > /tmp/before.txt

# After fixes
npx tsc --noEmit 2>&1 | grep "^src/" | wc -l > /tmp/after.txt

# Show difference
echo "Before: $(cat /tmp/before.txt)"
echo "After: $(cat /tmp/after.txt)"
```

---

**Last Updated:** January 4, 2026
**Format:** Copy-paste ready with explanations
