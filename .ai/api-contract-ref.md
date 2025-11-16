# API Contract Quick Reference

**Full Contract:** `../docs/API_CONTRACT.md`

This is a quick reference for AI code generation. Always validate against the full contract.

---

## Response Envelope (Universal)

**ALL /v1/* endpoints use this format:**

```typescript
interface ResponseEnvelope<T> {
  data: T | null;
  metadata: {
    timestamp: string;       // ISO 8601 UTC
    processingTime?: number; // Milliseconds
    provider?: string;       // "google-books" | "openlibrary" | "isbndb" | "gemini"
    cached?: boolean;        // true if served from cache
  };
  error?: {
    message: string;         // Human-readable
    code?: string;           // Machine-readable (see Error Codes below)
    details?: any;           // Optional context
  };
}
```

---

## Core DTOs

### WorkDTO
```typescript
interface WorkDTO {
  // REQUIRED
  title: string;
  subjectTags: string[];
  goodreadsWorkIDs: string[];
  amazonASINs: string[];
  librarythingIDs: string[];
  googleBooksVolumeIDs: string[];
  isbndbQuality: number;              // 0-100
  reviewStatus: ReviewStatus;         // "verified" | "needsReview" | "userEdited"

  // OPTIONAL
  originalLanguage?: string;
  firstPublicationYear?: number;
  description?: string;
  coverImageURL?: string;
  synthetic?: boolean;
  primaryProvider?: DataProvider;
  contributors?: DataProvider[];
  boundingBox?: BoundingBox;          // For AI-detected books
}
```

### EditionDTO
```typescript
interface EditionDTO {
  // REQUIRED
  isbns: string[];                    // Array of all ISBNs
  format: EditionFormat;              // "Hardcover" | "Paperback" | "E-book" | "Audiobook" | "Mass Market"
  amazonASINs: string[];
  googleBooksVolumeIDs: string[];
  librarythingIDs: string[];
  isbndbQuality: number;              // 0-100

  // OPTIONAL
  isbn?: string;                      // Primary ISBN (first from isbns array)
  title?: string;
  publisher?: string;
  publicationDate?: string;
  pageCount?: number;
  coverImageURL?: string;
  editionDescription?: string;        // NOT 'description' (Swift reserved keyword)
  language?: string;
}
```

### AuthorDTO
```typescript
interface AuthorDTO {
  // REQUIRED
  name: string;
  gender: AuthorGender;               // "Male" | "Female" | "Non-binary" | "Other" | "Unknown"

  // OPTIONAL (Wikidata-enriched)
  culturalRegion?: CulturalRegion;    // "Africa" | "Asia" | "Europe" | etc.
  nationality?: string;
  birthYear?: number;
  deathYear?: number;
}
```

---

## Error Codes (Approved List)

| Code | HTTP Status | Retry? |
|------|-------------|--------|
| `INVALID_ISBN` | 400 | No |
| `INVALID_QUERY` | 400 | No |
| `INVALID_REQUEST` | 400 | No |
| `NOT_FOUND` | 404 | No |
| `RATE_LIMIT_EXCEEDED` | 429 | Yes (after delay) |
| `PROVIDER_TIMEOUT` | 504 | Yes |
| `PROVIDER_ERROR` | 502 | Yes |
| `INTERNAL_ERROR` | 500 | Yes |

---

## Helper Functions

### Create Success Response
```typescript
import { createSuccessResponse } from '../../utils/response-builder.js';

return createSuccessResponse(
  { works, editions, authors },  // data
  {                              // metadata
    processingTime: Date.now() - startTime,
    provider: 'google-books',
    cached: false
  },
  200,                           // status code
  request                        // original request
);
```

### Create Error Response
```typescript
import { createErrorResponse, ErrorCodes } from '../../utils/response-builder.js';

return createErrorResponse(
  'Invalid ISBN format',         // message
  400,                           // status code
  ErrorCodes.INVALID_ISBN,       // error code
  { isbn },                      // details
  request                        // original request
);
```

---

## WebSocket Messages

### job_complete (Summary-Only)
```json
{
  "type": "job_complete",
  "jobId": "uuid-12345",
  "pipeline": "ai_scan",
  "payload": {
    "totalDetected": 25,
    "approved": 20,
    "needsReview": 5,
    "resultsUrl": "/v1/scan/results/uuid-12345"  // Client fetches full results
  }
}
```

**Critical:** Do NOT send large arrays via WebSocket. Store in KV, return `resultsUrl`.

---

## Rate Limiting

**Endpoint-Specific:**
- Search: 100 requests/minute per IP
- Batch: 10 requests/minute per IP
- AI Scan: 5 requests/minute per IP

**Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1700000000
```

---

## SLAs

| Metric | Target |
|--------|--------|
| **Uptime** | 99.9% |
| **Search P95** | < 500ms (uncached) |
| **Search P95** | < 50ms (cached) |

---

**For complete specifications:** See `../docs/API_CONTRACT.md`
