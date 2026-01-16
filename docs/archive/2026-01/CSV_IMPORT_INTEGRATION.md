# CSV Import Integration Guide

**API Version:** V3
**Updated:** 2026-01-15
**Status:** Production Ready

## Overview

The CSV import workflow enables bulk book imports from Goodreads, LibraryThing, and StoryGraph exports using Gemini AI for parsing. This guide outlines the required communication path for successful integration.

---

## Integration Flow

```
┌─────────────┐
│   Client    │
│  (iOS App)  │
└──────┬──────┘
       │
       │ 1. POST /v3/jobs/imports
       │    (multipart/form-data with CSV file)
       │
       ▼
┌─────────────────┐
│  BooksTrack API │ ◄── 2. Creates job, returns jobId + token
└────────┬────────┘
         │
         │ 3. Schedule processing (Durable Object Alarm)
         │
         ▼
    ┌────────────────┐
    │ CSV Processing │
    │  (Background)  │
    └────────┬───────┘
             │
             │ 4. Parse with Gemini + validate
             │
             ▼
    ┌─────────────────┐
    │ SSE Progress    │ ──► Client receives real-time updates
    │ Stream (WebSocket) │
    └─────────────────┘
```

---

## Required Client Implementation

### Step 1: Upload CSV File

**Endpoint:** `POST /v3/jobs/imports`

**Request:**
```http
POST https://api.oooefam.net/v3/jobs/imports
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="file"; filename="books.csv"
Content-Type: text/csv

<CSV file content>
--boundary--
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "jobId": "c068e127-44b3-489d-aaa7-9f2ff675068e",
    "status": "queued",
    "streamUrl": "https://api.oooefam.net/v3/jobs/imports/{jobId}/stream",
    "token": "04563200b44a81da6a966cac4a68da83..."
  },
  "metadata": {
    "timestamp": "2026-01-15T21:45:33.614Z",
    "requestId": "1b9b253d-2339-4c53-bf85-02f529352824"
  }
}
```

**CRITICAL:** Save `jobId` and `token` for subsequent requests.

---

### Step 2: Establish SSE Stream (REQUIRED)

**Why Required:**
The backend CSV processor waits for the client to signal "ready" via the SSE connection before starting Gemini parsing. Without this connection:
- Job will timeout after 15 seconds
- Processing will proceed but client misses early progress updates
- Job may appear "stuck" at 2% progress

**Endpoint:** `GET /v3/jobs/imports/{jobId}/stream`

**Request:**
```http
GET https://api.oooefam.net/v3/jobs/imports/{jobId}/stream
Authorization: Bearer {token}
```

**SSE Events:**
```
event: progress
data: {"jobId":"...","status":"processing","progress":0.02,"message":"Validating CSV file..."}

event: progress
data: {"jobId":"...","status":"processing","progress":0.50,"processedCount":10,"totalCount":20}

event: complete
data: {"jobId":"...","status":"completed","progress":1.0,"totalCount":20,"booksCount":20}

event: error
data: {"jobId":"...","status":"failed","error":{"code":"INVALID_CSV","message":"..."}}
```

**iOS Implementation Example:**
```swift
let eventSource = EventSource(url: streamUrl, headers: ["Authorization": "Bearer \(token)"])

eventSource.onOpen {
    print("[CSV SSE] Connection established")
    // Backend receives this and starts processing
}

eventSource.addEventListener("progress") { id, event, data in
    if let jsonData = data?.data(using: .utf8),
       let progress = try? JSONDecoder().decode(ProgressEvent.self, from: jsonData) {
        updateUI(progress: progress.progress, message: progress.message)
    }
}

eventSource.addEventListener("complete") { id, event, data in
    print("[CSV SSE] Import complete")
    fetchResults(jobId: jobId)
}

eventSource.addEventListener("error") { id, event, data in
    print("[CSV SSE] Error: \(data ?? "unknown")")
    handleError(data)
}

eventSource.connect()
```

---

### Step 3: Fetch Results (After Completion)

**Endpoint:** `GET /v3/jobs/imports/{jobId}/results`

**Request:**
```http
GET https://api.oooefam.net/v3/jobs/imports/{jobId}/results
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "jobId": "c068e127-44b3-489d-aaa7-9f2ff675068e",
    "status": "completed",
    "results": [
      {
        "title": "The Great Gatsby",
        "author": "F. Scott Fitzgerald",
        "isbn": "9780743273565",
        "publishedYear": 1925,
        "userRating": 4,
        "readingStatus": "read",
        "dateRead": "2024-03-15"
      }
    ]
  }
}
```

**Note:** Results cached for 1 hour after completion.

---

## Critical Requirements

### ✅ MUST DO

1. **Connect to SSE stream immediately after receiving job response**
   - Timeout: 15 seconds for initial connection
   - Backend waits for client "ready" signal before starting Gemini parsing

2. **Handle reconnection gracefully**
   - Use `Last-Event-ID` header for resuming stream
   - Browser/native clients handle this automatically

3. **Display progress updates to user**
   - Show percentage (0.0 to 1.0)
   - Display status messages ("Validating CSV...", "Parsing with Gemini...")

4. **Save `token` securely**
   - Token valid for 1 hour
   - Required for SSE stream authentication

### ❌ AVOID

1. **Polling `/v3/jobs/imports/{jobId}` instead of SSE**
   - Max 1 request every 2 seconds if polling
   - Rate limit: 30 requests/minute per job
   - SSE is preferred and more efficient

2. **Closing SSE connection prematurely**
   - Keep connection open until `complete` or `error` event
   - Early disconnect causes client to miss completion event

3. **Large CSV files without user feedback**
   - Max file size: 8MB (fits Gemini 2M token context)
   - Show upload progress for files >1MB

---

## Supported CSV Formats

### Column Name Variations (Backward Compatible)

The API automatically maps common column names:

| Field | Accepted Column Names |
|-------|----------------------|
| `title` | Title, Book Title |
| `author` | Author, Authors, Author Name |
| `isbn` | ISBN, ISBN13 |
| `userRating` | My Rating, Rating, User Rating |
| `readingStatus` | Exclusive Shelf, Read Status |
| `goodreadsId` | Book Id, Goodreads ID |
| `publishedYear` | Publication Year, Published Year, Year Published |
| `publisher` | Publisher |
| `pageCount` | Page Count, Pages, Number of Pages |
| `dateRead` | Date Read, Date Finished |
| `shelves` | Bookshelves, Shelves, Tags |

### Example CSV (Goodreads Export)
```csv
Title,Author,ISBN13,My Rating,Exclusive Shelf,Date Read
The Great Gatsby,F. Scott Fitzgerald,9780743273565,4,read,2024-03-15
1984,George Orwell,9780451524935,5,read,2024-02-10
```

---

## Error Handling

### Common Errors

| Error Code | Status | Description | Client Action |
|------------|--------|-------------|---------------|
| `INVALID_REQUEST` | 400 | Missing file or wrong Content-Type | Check multipart/form-data format |
| `FILE_TOO_LARGE` | 413 | CSV exceeds 8MB limit | Ask user to split file |
| `INVALID_CSV` | 400 | Malformed CSV structure | Show error, suggest manual entry |
| `UNAUTHORIZED` | 401 | Invalid or expired token | Request new job |
| `NOT_FOUND` | 404 | Job not found or results expired | Results cached only 1 hour |

### Error Event Format
```json
{
  "jobId": "...",
  "status": "failed",
  "error": {
    "code": "INVALID_CSV",
    "message": "Invalid CSV: Missing required header 'Title'",
    "retryable": false
  }
}
```

---

## Testing Checklist

- [ ] Upload small CSV (2-3 rows) and verify SSE progress updates
- [ ] Upload large CSV (100+ rows) and verify streaming behavior
- [ ] Test with Goodreads export (standard format)
- [ ] Test with LibraryThing export (alternate column names)
- [ ] Verify error handling for invalid CSV
- [ ] Test reconnection after network interruption
- [ ] Verify results retrieval after completion
- [ ] Test file size validation (>8MB rejection)

---

## Production Endpoints

**Base URL:** `https://api.oooefam.net`

- Upload: `POST /v3/jobs/imports`
- Stream: `GET /v3/jobs/imports/{jobId}/stream`
- Status: `GET /v3/jobs/imports/{jobId}`
- Results: `GET /v3/jobs/imports/{jobId}/results`
- Cancel: `DELETE /v3/jobs/imports/{jobId}`

**OpenAPI Spec:** https://api.oooefam.net/v3/openapi.json
**Interactive Docs:** https://api.oooefam.net/v3/docs

---

## Support

**Issues:** https://github.com/jukasdrj/bendv3/issues
**Status Page:** Check `/health` endpoint for API status
**Version:** 3.4.2 (deployed 2026-01-15)

---

**Last Updated:** 2026-01-15
**Maintainer:** BooksTrack Backend Team
