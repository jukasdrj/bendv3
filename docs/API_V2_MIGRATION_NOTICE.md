# BooksTrack API v2 Migration Notice

**Effective Date:** December 1, 2025
**API Version:** 2.0.0
**Breaking Changes:** WebSocket Protocol + HTTP Response Envelope

---

## 🚨 Action Required for All API Subscribers

The BooksTrack API is upgrading to v2.0.0 with **breaking changes** to both WebSocket and HTTP response formats. All client applications must be updated by **December 1, 2025**.

### Timeline

| Date | Milestone |
|------|-----------|
| **Nov 21, 2025** | Staging environment available for testing |
| **Nov 28, 2025** | Final deadline for client updates |
| **Dec 1, 2025** | Production deployment (v1 will stop working) |

---

## Breaking Changes Summary

### 1. WebSocket Protocol v1 → v2

#### What Changed
- ❌ **Removed:** `updateProgress(progress, status)` - v1 RPC method
- ❌ **Removed:** `complete(result)` - v1 RPC method
- ❌ **Removed:** `fail(error)` - v1 RPC method
- ✅ **New:** Pipeline-aware message envelope with unified schema

#### Migration Required

**Old v1 Message Format (DEPRECATED):**
```json
{
  "type": "progress",
  "jobId": "abc123",
  "timestamp": 1234567890,
  "data": {
    "progress": 0.5,
    "status": "Processing batch 5 of 10"
  }
}
```

**New v2 Message Format (REQUIRED):**
```json
{
  "type": "job_progress",
  "jobId": "abc123",
  "pipeline": "csv_import",
  "timestamp": 1234567890,
  "version": "1.0.0",
  "payload": {
    "type": "job_progress",
    "progress": 0.5,
    "status": "Processing batch 5 of 10"
  }
}
```

---

### 2. HTTP Response Envelope

#### What Changed
- ❌ **Removed:** `{success: true, data: {...}, meta: {...}}` format
- ✅ **New:** `{data: {...}, metadata: {...}, error?: {...}}` format

#### Migration Required

**Old Format (DEPRECATED):**
```json
{
  "success": true,
  "data": {
    "isbn": "9780439708180",
    "title": "Harry Potter and the Sorcerer's Stone"
  },
  "meta": {
    "source": "google_books",
    "cached": true
  }
}
```

**New Format (REQUIRED):**
```json
{
  "data": {
    "isbn": "9780439708180",
    "title": "Harry Potter and the Sorcerer's Stone"
  },
  "metadata": {
    "source": "google_books",
    "cached": true,
    "timestamp": "2025-11-21T12:00:00Z"
  }
}
```

**Error Responses:**
```json
{
  "error": {
    "code": "INVALID_ISBN",
    "message": "ISBN must be 10 or 13 digits",
    "statusCode": 400
  }
}
```

---

## Client Migration Guide

### For iOS (Swift)

#### 1. Update WebSocket Message Parser

**Before:**
```swift
struct ProgressMessage: Decodable {
    let type: String
    let jobId: String
    let data: ProgressData
}

struct ProgressData: Decodable {
    let progress: Double
    let status: String
}

func handleWebSocketMessage(_ message: String) {
    guard let data = message.data(using: .utf8),
          let msg = try? JSONDecoder().decode(ProgressMessage.self, from: data) else {
        return
    }

    updateProgress(msg.data.progress, status: msg.data.status)
}
```

**After:**
```swift
struct WebSocketMessageV2: Decodable {
    let type: String
    let jobId: String
    let pipeline: String
    let timestamp: Int
    let version: String
    let payload: MessagePayload
}

struct MessagePayload: Decodable {
    let type: String
    let progress: Double?
    let status: String?
    let result: JobResult?
    let error: ErrorPayload?
}

func handleWebSocketMessage(_ message: String) {
    guard let data = message.data(using: .utf8),
          let msg = try? JSONDecoder().decode(WebSocketMessageV2.self, from: data) else {
        return
    }

    switch msg.type {
    case "job_progress":
        if let progress = msg.payload.progress, let status = msg.payload.status {
            updateProgress(progress, status: status)
        }
    case "job_complete":
        if let result = msg.payload.result {
            handleCompletion(result)
        }
    case "error":
        if let error = msg.payload.error {
            handleError(error)
        }
    default:
        print("Unknown message type: \(msg.type)")
    }
}
```

#### 2. Update HTTP Response Parser

**Before:**
```swift
struct APIResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let meta: Metadata?
}

// Usage
if response.success {
    processData(response.data)
} else {
    showError("Request failed")
}
```

**After:**
```swift
struct APIResponseV2<T: Decodable>: Decodable {
    let data: T?
    let metadata: Metadata?
    let error: APIError?
}

struct APIError: Decodable {
    let code: String
    let message: String
    let statusCode: Int
}

// Usage
if let data = response.data {
    processData(data)
} else if let error = response.error {
    showError(error.message)
}
```

---

### For Flutter (Dart)

#### 1. Update WebSocket Handler

**Before:**
```dart
class ProgressMessage {
  final String type;
  final String jobId;
  final ProgressData data;

  ProgressMessage.fromJson(Map<String, dynamic> json)
      : type = json['type'],
        jobId = json['jobId'],
        data = ProgressData.fromJson(json['data']);
}

void handleWebSocketMessage(String message) {
  final msg = ProgressMessage.fromJson(jsonDecode(message));
  updateProgress(msg.data.progress, msg.data.status);
}
```

**After:**
```dart
class WebSocketMessageV2 {
  final String type;
  final String jobId;
  final String pipeline;
  final int timestamp;
  final String version;
  final Map<String, dynamic> payload;

  WebSocketMessageV2.fromJson(Map<String, dynamic> json)
      : type = json['type'],
        jobId = json['jobId'],
        pipeline = json['pipeline'],
        timestamp = json['timestamp'],
        version = json['version'],
        payload = json['payload'];
}

void handleWebSocketMessage(String message) {
  final msg = WebSocketMessageV2.fromJson(jsonDecode(message));

  switch (msg.type) {
    case 'job_progress':
      updateProgress(
        msg.payload['progress'] as double,
        msg.payload['status'] as String
      );
      break;
    case 'job_complete':
      handleCompletion(msg.payload['result']);
      break;
    case 'error':
      handleError(msg.payload['error']);
      break;
  }
}
```

#### 2. Update HTTP Response Parser

**Before:**
```dart
class APIResponse<T> {
  final bool success;
  final T? data;
  final Map<String, dynamic>? meta;

  APIResponse.fromJson(Map<String, dynamic> json, T Function(Map<String, dynamic>) fromJson)
      : success = json['success'],
        data = json['data'] != null ? fromJson(json['data']) : null,
        meta = json['meta'];
}

// Usage
if (response.success) {
  processData(response.data);
}
```

**After:**
```dart
class APIResponseV2<T> {
  final T? data;
  final Map<String, dynamic>? metadata;
  final APIError? error;

  APIResponseV2.fromJson(Map<String, dynamic> json, T Function(Map<String, dynamic>) fromJson)
      : data = json['data'] != null ? fromJson(json['data']) : null,
        metadata = json['metadata'],
        error = json['error'] != null ? APIError.fromJson(json['error']) : null;
}

class APIError {
  final String code;
  final String message;
  final int statusCode;

  APIError.fromJson(Map<String, dynamic> json)
      : code = json['code'],
        message = json['message'],
        statusCode = json['statusCode'];
}

// Usage
if (response.data != null) {
  processData(response.data!);
} else if (response.error != null) {
  showError(response.error!.message);
}
```

---

## Testing Against Staging

### Staging Environment Details

**Base URL:** `https://staging-api.oooefam.net`
**WebSocket URL:** `wss://staging-api.oooefam.net/ws/progress?jobId={jobId}&token={token}`

### Testing Checklist

Before December 1st deployment, verify:

#### WebSocket Tests
- [ ] Connect to staging WebSocket endpoint
- [ ] Receive `job_progress` messages correctly
- [ ] Receive `job_complete` messages correctly
- [ ] Handle `error` messages correctly
- [ ] Parse `pipeline` field correctly
- [ ] Parse `payload` structure correctly

#### HTTP Tests
- [ ] Parse `data` field from success responses
- [ ] Parse `metadata` field correctly
- [ ] Handle `error` responses correctly
- [ ] Check for `error.code` instead of `success: false`
- [ ] Update error handling to use new error format

#### Edge Cases
- [ ] Network disconnections reconnect properly
- [ ] Token expiration handled correctly
- [ ] Invalid jobId returns proper error format
- [ ] Large payloads (1000+ books) parse correctly

---

## New Message Types

### WebSocket Message Types

| Type | Description | When Sent |
|------|-------------|-----------|
| `job_progress` | Progress update during batch operation | Every N books processed |
| `job_complete` | Job completed successfully | At job completion |
| `error` | Error occurred during processing | On failure |

### Pipeline Types

| Pipeline | Description |
|----------|-------------|
| `csv_import` | CSV file import and parsing |
| `batch_enrichment` | Batch metadata enrichment |
| `ai_scan` | AI-powered bookshelf scanning |

---

## Error Code Reference

### Standard HTTP Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Missing or invalid parameters |
| `INVALID_ISBN` | 400 | ISBN format is incorrect |
| `UNAUTHORIZED` | 401 | Authentication token invalid/expired |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `PROVIDER_ERROR` | 502 | External API failure |
| `INTERNAL_ERROR` | 500 | Server error |

### WebSocket Error Codes

| Code | Description |
|------|-------------|
| `CONNECTION_FAILED` | WebSocket connection failed |
| `INVALID_TOKEN` | Authentication token invalid |
| `TOKEN_EXPIRED` | Authentication token expired |
| `JOB_NOT_FOUND` | Job ID does not exist |
| `PROCESSING_FAILED` | Job processing failed |

---

## Support & Questions

### Technical Support
- **Slack:** `#bookstrack-api-support`
- **Email:** api-support@oooefam.net
- **GitHub Issues:** https://github.com/jukasdrj/bookstrack-backend/issues

### Migration Assistance
If you need help migrating your application:
1. Join `#bookstrack-api-support` on Slack
2. Share your current implementation
3. We'll provide migration code examples specific to your use case

### Emergency Contacts
If you cannot meet the December 1st deadline:
- **Escalation:** @jukasdrj (GitHub)
- **Emergency:** engineering-oncall@oooefam.net

---

## FAQ

### Q: Can I keep using v1 after December 1st?
**A:** No. v1 will be completely removed on December 1st. All v1 requests will return errors.

### Q: Is there a grace period?
**A:** Staging is available starting November 21st. That provides a 10-day migration window.

### Q: What if I can't migrate in time?
**A:** Contact engineering-oncall@oooefam.net immediately. We may be able to provide a temporary feature flag, but this is not guaranteed.

### Q: Are there any new features in v2?
**A:** Yes!
- Pipeline awareness for better analytics
- Structured error codes for easier error handling
- Type-safe message schemas with version field
- Better TypeScript/type safety support

### Q: Will my existing data be affected?
**A:** No. This is purely a protocol change. Your book data, caches, and job history remain unchanged.

### Q: Do I need to update my API keys?
**A:** No. API keys and authentication tokens remain the same.

---

## Deprecation Timeline

| Date | Status |
|------|--------|
| **Nov 14, 2025** | v2 migration announced |
| **Nov 21, 2025** | Staging environment live with v2 |
| **Nov 28, 2025** | Final deadline for client migration |
| **Dec 1, 2025** | v2 deployed to production, v1 removed |
| **Dec 8, 2025** | v1 staging environment removed |

---

## Appendix: Complete Type Definitions

### TypeScript Definitions

```typescript
// WebSocket Messages
interface WebSocketMessageV2 {
  type: 'job_progress' | 'job_complete' | 'error'
  jobId: string
  pipeline: 'csv_import' | 'batch_enrichment' | 'ai_scan'
  timestamp: number
  version: '1.0.0'
  payload: ProgressPayload | CompletePayload | ErrorPayload
}

interface ProgressPayload {
  type: 'job_progress'
  progress: number  // 0.0 to 1.0
  status: string
  booksProcessed?: number
  totalBooks?: number
}

interface CompletePayload {
  type: 'job_complete'
  result: {
    totalBooks: number
    successCount: number
    failureCount: number
    books?: Book[]
  }
}

interface ErrorPayload {
  type: 'error'
  error: {
    code: string
    message: string
    details?: unknown
  }
}

// HTTP Responses
interface APIResponseV2<T> {
  data?: T
  metadata?: {
    source: string
    cached: boolean
    timestamp: string
    [key: string]: unknown
  }
  error?: {
    code: string
    message: string
    statusCode: number
  }
}

interface Book {
  isbn: string
  isbn13?: string
  title: string
  authors: string[]
  publisher?: string
  publishedDate?: string
  description?: string
  pageCount?: number
  categories?: string[]
  coverUrl?: string
  language?: string
}
```

---

**Document Version:** 1.0
**Last Updated:** November 14, 2025
**Contact:** api-support@oooefam.net
