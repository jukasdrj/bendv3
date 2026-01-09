# Durable Objects Testing Pattern

## Humble Object Pattern (Design Standard)

All Durable Objects MUST follow the "Humble Object" pattern to ensure testability and maintainability. This pattern separates infrastructure-dependent code from business logic.

### Core Principle

> **Durable Objects should be thin wrappers that delegate to testable services.**

Business logic (filtering, buffering, merging, validation) should live in pure functions or classes that can be unit tested without mocking `DurableObjectState`, storage APIs, or timer infrastructure.

---

## Pattern Structure

### ❌ Anti-Pattern (Current State)
```typescript
class JobStateManagerDO {
  async alarm() {
    // 50 lines of cleanup logic mixed with storage operations
    const keys = await this.state.storage.list()
    const jobKeys = []
    for (const [key] of keys) {
      if (key.startsWith('job:') && isOlderThan7Days(key)) {
        jobKeys.push(key)
      }
    }
    await Promise.all(jobKeys.map(k => this.state.storage.delete(k)))
    // More logic...
  }
}
```

**Problems:**
- Business logic (filtering, age checking) coupled with storage infrastructure
- Requires complex mocking (`vi.spyOn(state.storage)`, `vi.useFakeTimers()`)
- Tests validate Cloudflare's platform behavior, not our logic

### ✅ Recommended Pattern
```typescript
// Pure testable service (no infrastructure dependencies)
export function cleanupJobStorage(
  keys: Map<string, unknown>,
  now: Date = new Date()
): string[] {
  const keysToDelete: string[] = []
  for (const [key] of keys) {
    if (key.startsWith('job:')) {
      const timestamp = extractTimestamp(key)
      const ageInDays = (now.getTime() - timestamp) / (1000 * 60 * 60 * 24)
      if (ageInDays > 7) {
        keysToDelete.push(key)
      }
    }
  }
  return keysToDelete
}

// Durable Object (thin wrapper)
class JobStateManagerDO {
  async alarm() {
    const keys = await this.state.storage.list()
    const keysToDelete = cleanupJobStorage(keys)
    await Promise.all(keysToDelete.map(k => this.state.storage.delete(k)))
  }
}

// Unit test (no infrastructure mocking!)
test('cleanupJobStorage filters old job keys', () => {
  const keys = new Map([
    ['job:2024-01-01', {}],  // 7+ days old
    ['job:2024-01-07', {}],  // Recent
    ['other:2024-01-01', {}] // Not a job key
  ])
  const now = new Date('2024-01-08')
  const result = cleanupJobStorage(keys, now)
  expect(result).toEqual(['job:2024-01-01'])
})
```

---

## When to Apply This Pattern

### REQUIRED (Must Refactor Before Changes)
Apply this pattern **before** making any of these changes to Durable Object code:

1. **Adding new DO features** - Fresh context, immediate ROI
2. **Fixing DO-related bugs** - Refactor as part of the fix
3. **Modifying existing DO logic** - Prevent further coupling

### OPTIONAL (Nice to Have)
Apply when:
- Sprint backlog pressure drops below 2 P1 items
- Dedicated refactoring time is allocated
- Team explicitly prioritizes code quality work

---

## Common Patterns to Extract

### 1. Key Filtering Logic
**Extract:** Logic that determines which keys to process
**Example:** `cleanupJobStorage()`, `filterExpiredSessions()`

```typescript
// Before: Mixed with storage
const keys = await this.state.storage.list()
const filtered = [...keys].filter(([k]) => k.startsWith('job:'))

// After: Pure function
export function filterJobKeys(keys: Map<string, unknown>): string[] {
  return [...keys.keys()].filter(k => k.startsWith('job:'))
}
```

### 2. Buffering Logic
**Extract:** Time-based or count-based buffering decisions
**Example:** `UpdateBuffer` class for SSE updates

```typescript
// Testable buffering class
export class UpdateBuffer<T> {
  private buffer: T[] = []
  private lastFlush = Date.now()

  constructor(
    private maxSize: number = 10,
    private maxAgeMs: number = 1000
  ) {}

  add(item: T): boolean {
    this.buffer.push(item)
    return this.shouldFlush()
  }

  shouldFlush(): boolean {
    return (
      this.buffer.length >= this.maxSize ||
      Date.now() - this.lastFlush >= this.maxAgeMs
    )
  }

  getAll(): T[] {
    const items = [...this.buffer]
    this.buffer = []
    this.lastFlush = Date.now()
    return items
  }
}

// DO uses the buffer
class JobStateManagerDO {
  private buffer = new UpdateBuffer<SSEUpdate>()

  async broadcastSSEUpdate(type: string, data: unknown) {
    const shouldFlush = this.buffer.add({ type, data })
    if (shouldFlush) {
      await this.flushBuffer()
    }
  }
}
```

### 3. State Merging Logic
**Extract:** Logic that combines persisted state with pending updates
**Example:** `mergeUpdates()` for job progress

```typescript
// Pure merge function
export function mergeUpdates<T>(
  persisted: T,
  pending: Partial<T>[]
): T {
  return pending.reduce(
    (acc, update) => ({ ...acc, ...update }),
    persisted
  )
}

// DO delegates to pure function
class JobStateManagerDO {
  async getJobState(): Promise<JobState> {
    const persisted = await this.state.storage.get<JobState>('jobState')
    const pending = await this.state.storage.get<Partial<JobState>[]>('pendingUpdates')
    return mergeUpdates(persisted, pending || [])
  }
}
```

---

## Testing Strategy (80/20 Approach)

### Unit Tests (Exhaustive)
Test extracted pure functions/classes with comprehensive coverage:
- Happy path
- Edge cases (empty inputs, boundary conditions)
- Error conditions
- All branches

**Location:** `tests/unit/services/` or `tests/unit/utils/`

### Integration Tests (Smoke)
One happy path test per Durable Object to verify infrastructure integration:
- DO triggers alarm correctly
- Buffering works end-to-end
- Storage operations succeed

**Location:** `tests/integration/durable-objects/`

### Skip
- State machine validation (trust Cloudflare's platform)
- Storage API behavior (trust Cloudflare's testing)
- Timer/alarm infrastructure (trust Cloudflare's testing)

---

## PR Rule

**MANDATORY:** Any PR that modifies Durable Object files MUST:

1. Identify business logic coupled with infrastructure
2. Extract that logic into pure functions/classes
3. Add comprehensive unit tests for extracted logic
4. Update DO code to delegate to extracted logic
5. Reference this ADR in PR description

**Files Subject to This Rule:**
- `src/durable-objects/job-state-manager.js`
- `src/durable-objects/websocket-connection.js`
- `src/durable-objects/cache-metrics.js`
- `src/durable-objects/rate-limiter.js`
- `src/durable-objects/latency-test-do.js`

**Enforcement:** Code reviewers MUST block PRs that add business logic to DO classes without extraction.

---

## Priority Order (When Refactoring)

If multiple patterns can be extracted, prioritize by risk:

1. **`mergeUpdates()` - HIGHEST RISK**
   - State consistency bugs are silent and corrupt data
   - Affects job state accuracy
   - Test: `tests/unit/job-state-manager-do.test.js:832`

2. **`UpdateBuffer` - MEDIUM RISK**
   - SSE buffering bugs cause missed updates
   - Affects real-time progress visibility
   - Test: `tests/unit/job-state-manager-do.test.js:802`

3. **`cleanupJobStorage()` - LOWEST RISK**
   - Cleanup bugs cause storage bloat (not user-facing)
   - Eventual consistency acceptable
   - Test: `tests/unit/job-state-manager-do.test.js:639`

---

## Migration Tracking

### Skipped Tests (Tech Debt)
These tests are skipped pending pattern adoption:

- `tests/unit/job-state-manager-do.test.js:639` - Alarm cleanup verification
- `tests/unit/job-state-manager-do.test.js:802` - SSE buffer time-based flush
- `tests/unit/job-state-manager-do.test.js:832` - Pending update merging

**Tag:** `tech-debt:humble-object`

### Trigger Conditions
Re-enable tests when:
- Feature work requires modifying the related DO code
- Bug fix touches the related logic
- Dedicated refactoring sprint is allocated

---

## Benefits

1. **Testability:** Unit test business logic without complex infrastructure mocks
2. **Maintainability:** Clear separation between "what" (logic) and "how" (infrastructure)
3. **Reusability:** Pure functions can be used across multiple DOs
4. **Debuggability:** Test logic in isolation without Worker runtime
5. **Resilience:** Less coupling to Cloudflare API changes

---

## References

- **Issue:** [#255 - Refactor Durable Objects for Testability](https://github.com/jukasdrj/bendv3/issues/255)
- **Consensus Analysis:** Multi-model agreement (Gemini 3 Flash, Gemini 3 Pro, Grok Code Fast)
- **Pattern Origin:** "Humble Object" pattern from xUnit Test Patterns
- **Industry Examples:** Hexagonal Architecture, Ports & Adapters, Clean Architecture

---

**Last Updated:** January 8, 2026
**Status:** Design Standard (Extraction Deferred Until Trigger Conditions Met)
**Owner:** AI Team (@cf-code-reviewer enforcement)
