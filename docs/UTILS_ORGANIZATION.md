# Utils Directory Organization

**Last Updated:** January 8, 2026
**Status:** ✅ Well-organized by domain
**Total Files:** 35 utility files across 11 subdirectories

---

## Overview

The `src/utils/` directory is organized into domain-specific subdirectories for maintainability and discoverability. This structure follows the principle of "colocation by feature" rather than "colocation by type."

---

## Directory Structure

```
src/utils/
├── analytics/          # Analytics Engine tracking and reporting
├── book/               # Book-specific utilities (metadata, scoring, similarity)
├── cache/              # KV cache operations and key management
├── concurrency/        # Rate limiting, retries, and concurrency control
├── database/           # D1 database wrappers
├── http/               # HTTP responses, streaming, error handling
├── jobs/               # Long-running job utilities (CSV processing, progress)
├── r2/                 # R2 bucket operations and lifecycle management
├── transform/          # Data transformation and normalization
├── validation/         # Input validation (ISBN, CSV, JSON, books)
└── (root)              # Cross-cutting utilities
```

---

## Detailed Breakdown

### 📊 analytics/ (3 files)
**Purpose:** Analytics Engine integration for metrics and monitoring

| File | Purpose |
|------|---------|
| `analytics.ts` | Main analytics tracking functions (cache, provider, request metrics) |
| `analytics-queries.ts` | Analytics queries (currently write-only limitation documented) |
| `analytics-logger.ts` | Structured logging for Analytics Engine |

**Key Functions:**
- `trackCacheMetrics()` - Cache hit/miss tracking
- `trackProviderMetrics()` - External API performance
- `logAnalytics()` - General-purpose event logging

---

### 📚 book/ (4 files)
**Purpose:** Book-specific business logic and metadata utilities

| File | Purpose |
|------|---------|
| `book-metadata.ts` | Author name extraction, placeholder covers, title normalization |
| `confidence.ts` | Search confidence scoring (0.0-1.0) |
| `quality-scoring.ts` | Data quality metrics (title, authors, ISBN coverage) |
| `string-similarity.ts` | Title matching and fuzzy search |

**Key Functions:**
- `calculateConfidence()` - Search result confidence
- `calculateQualityScore()` - Data completeness assessment
- `normalizeTitle()` - Title cleaning and standardization
- `getPlaceholderCover()` - Fallback cover generation

---

### 💾 cache/ (3 files)
**Purpose:** KV cache operations and key management

| File | Purpose |
|------|---------|
| `cache.ts` | Generic KV cache wrapper with TTL management |
| `cache-keys.ts` | Cache key generation and namespacing |
| `kv-results-handler.ts` | Cache hit/miss handling with metadata |

**Key Functions:**
- `getCacheKey()` - Generate namespaced cache keys
- `withCache()` - Cache-aside pattern wrapper
- `handleKVResults()` - Parse and validate cached data

---

### ⚡ concurrency/ (3 files)
**Purpose:** Rate limiting, retries, and concurrency control

| File | Purpose |
|------|---------|
| `concurrency-limiter.ts` | p-limit wrapper for parallel operation control |
| `rate-limiter.ts` | Global rate limiter (Durable Object integration) |
| `retry.ts` | Exponential backoff retry logic |

**Key Functions:**
- `createConcurrencyLimiter()` - Parallel task limiting
- `createRateLimiter()` - Rate limit enforcement
- `retryWithBackoff()` - Automatic retries with exponential backoff

---

### 🗄️ database/ (1 file)
**Purpose:** D1 database wrappers and utilities

| File | Purpose |
|------|---------|
| `d1-wrapper.ts` | D1 query helpers and error handling |

**Key Functions:**
- `executeQuery()` - Safe D1 query execution
- `executeBatch()` - Batched D1 operations

---

### 🌐 http/ (3 files)
**Purpose:** HTTP responses, streaming, and error handling

| File | Purpose |
|------|---------|
| `error-status.ts` | HTTP status code mapping for errors |
| `response-builder.ts` | Canonical response envelope builder |
| `streaming-response.ts` | SSE (Server-Sent Events) utilities |

**Key Functions:**
- `buildSuccessResponse()` - Standard success response
- `buildErrorResponse()` - RFC 9457 error response
- `createSSEStream()` - Server-Sent Events stream
- `getHttpStatus()` - Map error codes to HTTP status

---

### 📋 jobs/ (2 files)
**Purpose:** Long-running job utilities (CSV processing, progress tracking)

| File | Purpose |
|------|---------|
| `csv-processor-core.ts` | CSV parsing and book import logic |
| `progress-reporter.ts` | Job progress tracking and SSE updates |

**Key Functions:**
- `processCSVImport()` - CSV import pipeline
- `reportProgress()` - Progress updates via Durable Object
- `validateCSVStructure()` - CSV format validation

---

### 🪣 r2/ (3 files)
**Purpose:** R2 bucket operations and lifecycle management

| File | Purpose |
|------|---------|
| `r2-utils.ts` | R2 upload, download, and deletion |
| `r2-lifecycle.ts` | Lifecycle rule management |
| `r2-hibernation.ts` | Hibernation API helpers (legacy) |

**Key Functions:**
- `uploadToR2()` - Upload files to R2
- `downloadFromR2()` - Download files from R2
- `setLifecycleRules()` - Configure R2 lifecycle policies

---

### 🔄 transform/ (4 files)
**Purpose:** Data transformation and normalization

| File | Purpose |
|------|---------|
| `book-mappers.ts` | Convert between internal/external book formats |
| `normalization.ts` | String normalization (ISBN, authors, titles) |
| `response-transformer.ts` | API response transformation |
| `transform-work.ts` | WorkDTO transformations |

**Key Functions:**
- `normalizeISBN()` - ISBN-10 ↔ ISBN-13 conversion
- `normalizeAuthor()` - Author name standardization
- `transformWork()` - WorkDTO → BookSchema mapping
- `mapToCanonicalBook()` - External API → Canonical format

---

### ✅ validation/ (4 files)
**Purpose:** Input validation (ISBN, CSV, JSON, books)

| File | Purpose |
|------|---------|
| `isbn-validation.ts` | ISBN-10/13 validation and checksum |
| `csv-validator.ts` | CSV structure and content validation |
| `json-validator.ts` | JSON schema validation |
| `book-validation.ts` | Book metadata validation |

**Key Functions:**
- `validateISBN()` - ISBN format and checksum verification
- `validateCSV()` - CSV parsing and validation
- `validateBook()` - Book metadata completeness check
- `isValidJSON()` - JSON structure validation

---

### 🔧 Root Level (4 files)
**Purpose:** Cross-cutting utilities that don't fit domain categories

| File | Purpose |
|------|---------|
| `book-record-builder.ts` | D1 BookRecord construction |
| `csv-ab-testing.ts` | CSV import A/B testing utilities |
| `date-utils.ts` | Date parsing and formatting |
| `feature-flags.ts` | Feature flag evaluation |
| `json-repair.ts` | JSON repair for malformed responses |
| `secrets.ts` | Secret management helpers |

**Key Functions:**
- `buildBookRecord()` - Construct D1 book records
- `extractYear()` - Parse publication dates
- `isFeatureEnabled()` - Evaluate feature flags
- `repairJSON()` - Fix common JSON malformations

---

## Organization Principles

### ✅ Good Organization
1. **Colocation by Feature** - Related utilities grouped together
2. **Clear Naming** - Directory names match domain concepts
3. **Shallow Hierarchy** - Max 2 levels deep (utils/domain/file.ts)
4. **Single Responsibility** - Each file has one clear purpose
5. **Discoverable** - Developers can find utilities intuitively

### ❌ Avoid
1. **Generic Names** - utils/helpers/, utils/misc/, utils/common/
2. **Deep Nesting** - utils/book/metadata/title/normalization.ts
3. **Duplicate Logic** - Same utility in multiple places
4. **Circular Dependencies** - utils/a imports utils/b imports utils/a

---

## Import Patterns

### Recommended
```typescript
// Specific imports from domain directories
import { calculateConfidence } from '../utils/book/confidence.js'
import { getCacheKey } from '../utils/cache/cache-keys.js'
import { validateISBN } from '../utils/validation/isbn-validation.js'
```

### Avoid
```typescript
// Barrel exports (index.ts files) - not used in this codebase
import { calculateConfidence } from '../utils/book/index.js'

// Wildcard imports
import * as bookUtils from '../utils/book/confidence.js'
```

---

## Adding New Utilities

### Decision Tree
1. **Is it specific to a domain?** → Add to existing subdirectory
2. **Does it create a new domain?** → Create new subdirectory (requires 3+ related files)
3. **Is it truly cross-cutting?** → Add to root level (rare)

### Example: Adding ISBN validation
```typescript
// ✅ CORRECT - Goes in validation/
src/utils/validation/isbn-validation.ts

// ❌ WRONG - Too generic
src/utils/validators.ts

// ❌ WRONG - Over-nesting
src/utils/validation/isbn/isbn-validation.ts
```

---

## Maintenance Guidelines

### When to Refactor
- Subdirectory exceeds 8 files → Consider splitting
- Root level exceeds 6 files → Consider new subdirectory
- Utility used in 5+ places → Move to more general location

### When to Delete
- Utility has zero references (use `git grep`)
- Functionality moved to external package
- Feature removed from codebase

---

## Related Documentation

- **Architecture:** `.claude/CLAUDE.md` - Code organization patterns
- **Testing:** `README_TESTING.md` - Testing utilities
- **TypeScript:** `TYPESCRIPT_STATUS.md` - Type safety patterns

---

**Last Audit:** January 8, 2026
**Next Review:** After major feature additions or when root level exceeds 6 files
