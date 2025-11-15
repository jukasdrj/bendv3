# Staging Environment Testing Guide

**Audience:** iOS & Flutter Development Teams  
**Purpose:** Test API v2.0 migration before production deployment  
**Staging URL:** `https://staging-api.oooefam.net`  
**Available:** November 21, 2025 - Ongoing

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [API v2.0 Changes Overview](#api-v20-changes-overview)
3. [Test Scenarios](#test-scenarios)
4. [WebSocket Testing](#websocket-testing)
5. [Expected Response Format](#expected-response-format)
6. [Issue Reporting](#issue-reporting)

---

## Quick Start

### Staging Base URL

Replace your production API base URL with the staging URL:

**Production:** `https://api.oooefam.net`  
**Staging:** `https://staging-api.oooefam.net`

### Configuration Change

**iOS (Swift):**
```swift
// Configuration.swift
struct APIConfig {
    #if STAGING
    static let baseURL = "https://staging-api.oooefam.net"
    static let wsURL = "wss://staging-api.oooefam.net"
    #else
    static let baseURL = "https://api.oooefam.net"
    static let wsURL = "wss://api.oooefam.net"
    #endif
}
```

**Flutter (Dart):**
```dart
// config.dart
class APIConfig {
  static const String baseURL = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://staging-api.oooefam.net'
  );
  
  static const String wsURL = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'wss://staging-api.oooefam.net'
  );
}
```

### Health Check

Verify staging connectivity:

```bash
curl https://staging-api.oooefam.net/health
```

Expected response:
```json
{
  "data": {
    "status": "ok",
    "worker": "api-worker-staging",
    "version": "2.0.0",
    "environment": "staging"
  },
  "metadata": {
    "timestamp": "2025-11-21T12:00:00Z"
  }
}
```

---

## API v2.0 Changes Overview

### Breaking Change #1: HTTP Response Envelope

**Old Format (v1 - DEPRECATED):**
```json
{
  "success": true,
  "data": { /* resource data */ },
  "meta": { /* metadata */ }
}
```

**New Format (v2 - REQUIRED):**
```json
{
  "data": { /* resource data */ },
  "metadata": { /* metadata */ },
  "error": { /* only present on error */ }
}
```

**Migration Impact:**
- ❌ Remove `success` boolean check
- ✅ Check for `error` field instead
- ✅ `meta` renamed to `metadata`
- ✅ Always expect `data` on success

### Breaking Change #2: WebSocket Protocol

**Old Format (v1 - DEPRECATED):**
```json
{
  "type": "progress",
  "jobId": "abc123",
  "data": {
    "progress": 0.5,
    "status": "Processing..."
  }
}
```

**New Format (v2 - REQUIRED):**
```json
{
  "type": "job_progress",
  "jobId": "abc123",
  "pipeline": "csv_import",
  "timestamp": 1700000000000,
  "version": "1.0.0",
  "payload": {
    "type": "job_progress",
    "progress": 0.5,
    "status": "Processing...",
    "booksProcessed": 50,
    "totalBooks": 100
  }
}
```

**Migration Impact:**
- ✅ Added `pipeline` field (csv_import, batch_enrichment, ai_scan)
- ✅ Added `version` field for protocol versioning
- ✅ Added `timestamp` for message ordering
- ✅ Data moved to `payload` object
- ✅ Additional progress fields (booksProcessed, totalBooks)

---

## Test Scenarios

### 1. Title Search

**Endpoint:** `GET /v1/search/title`

**Example:**
```bash
curl "https://staging-api.oooefam.net/v1/search/title?q=hamlet"
```

**Expected Response (v2.0):**
```json
{
  "data": {
    "results": [
      {
        "isbn": "9780743477123",
        "title": "Hamlet",
        "authors": ["William Shakespeare"],
        "publisher": "Simon & Schuster",
        "publishedDate": "2003-07-01",
        "coverUrl": "https://covers.openlibrary.org/b/isbn/9780743477123-L.jpg"
      }
    ]
  },
  "metadata": {
    "source": "google_books",
    "cached": false,
    "timestamp": "2025-11-21T12:00:00Z",
    "totalResults": 1
  }
}
```

**Test Cases:**
- [ ] Simple query returns results
- [ ] Empty query returns validation error
- [ ] Special characters handled correctly
- [ ] Response includes `metadata.timestamp`
- [ ] No `success` field present

### 2. ISBN Search

**Endpoint:** `GET /v1/search/isbn`

**Example:**
```bash
curl "https://staging-api.oooefam.net/v1/search/isbn?isbn=9780743273565"
```

**Expected Response:**
```json
{
  "data": {
    "isbn": "9780743273565",
    "isbn13": "9780743273565",
    "title": "The Great Gatsby",
    "authors": ["F. Scott Fitzgerald"],
    "publisher": "Scribner",
    "publishedDate": "2004-09-30",
    "description": "The novel chronicles...",
    "pageCount": 180,
    "categories": ["Fiction"],
    "coverUrl": "https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg",
    "language": "en"
  },
  "metadata": {
    "source": "google_books",
    "cached": true,
    "timestamp": "2025-11-21T12:00:00Z"
  }
}
```

**Test Cases:**
- [ ] Valid ISBN-13 returns book data
- [ ] Valid ISBN-10 returns book data
- [ ] Invalid ISBN returns error (see Error Response below)
- [ ] Book not found returns 404 error
- [ ] Response uses v2 envelope format

### 3. Error Response Format

**Invalid ISBN Example:**
```bash
curl "https://staging-api.oooefam.net/v1/search/isbn?isbn=invalid"
```

**Expected Error Response (v2.0):**
```json
{
  "error": {
    "code": "INVALID_ISBN",
    "message": "ISBN must be 10 or 13 digits",
    "statusCode": 400
  }
}
```

**Test Cases:**
- [ ] Error response has `error` object (not `success: false`)
- [ ] Error includes `code`, `message`, and `statusCode`
- [ ] No `data` field on error responses
- [ ] HTTP status code matches `error.statusCode`

### 4. Advanced Search

**Endpoint:** `POST /v1/search/advanced`

**Example:**
```bash
curl -X POST "https://staging-api.oooefam.net/v1/search/advanced" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "harry potter",
    "author": "rowling",
    "isbn": "9780439708180"
  }'
```

**Expected Response:**
```json
{
  "data": {
    "results": [
      {
        "isbn": "9780439708180",
        "title": "Harry Potter and the Sorcerer's Stone",
        "authors": ["J.K. Rowling"],
        "publisher": "Scholastic Inc.",
        "publishedDate": "1998-09-01"
      }
    ]
  },
  "metadata": {
    "source": "google_books",
    "cached": false,
    "timestamp": "2025-11-21T12:00:00Z",
    "totalResults": 1
  }
}
```

**Test Cases:**
- [ ] Multiple search criteria work together
- [ ] Partial matches return results
- [ ] Empty criteria returns validation error

---

## WebSocket Testing

### Connection Setup

**WebSocket URL Pattern:**
```
wss://staging-api.oooefam.net/ws/progress?jobId={jobId}&token={token}
```

**iOS Example:**
```swift
import Foundation

class WebSocketManager {
    var webSocket: URLSessionWebSocketTask?
    
    func connect(jobId: String, token: String) {
        let urlString = "wss://staging-api.oooefam.net/ws/progress?jobId=\(jobId)&token=\(token)"
        guard let url = URL(string: urlString) else { return }
        
        let session = URLSession(configuration: .default)
        webSocket = session.webSocketTask(with: url)
        webSocket?.resume()
        
        receiveMessage()
    }
    
    func receiveMessage() {
        webSocket?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self?.handleMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self?.handleMessage(text)
                    }
                @unknown default:
                    break
                }
                // Continue receiving
                self?.receiveMessage()
            case .failure(let error):
                print("WebSocket error: \(error)")
            }
        }
    }
    
    func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let message = try? JSONDecoder().decode(WebSocketMessageV2.self, from: data) else {
            return
        }
        
        switch message.type {
        case "job_progress":
            updateProgress(message.payload)
        case "job_complete":
            handleCompletion(message.payload)
        case "error":
            handleError(message.payload)
        default:
            print("Unknown message type: \(message.type)")
        }
    }
}

// Message models
struct WebSocketMessageV2: Decodable {
    let type: String
    let jobId: String
    let pipeline: String
    let timestamp: Int64
    let version: String
    let payload: MessagePayload
}

struct MessagePayload: Decodable {
    let type: String
    let progress: Double?
    let status: String?
    let booksProcessed: Int?
    let totalBooks: Int?
    let result: JobResult?
    let error: ErrorInfo?
}

struct JobResult: Decodable {
    let totalBooks: Int
    let successCount: Int
    let failureCount: Int
}

struct ErrorInfo: Decodable {
    let code: String
    let message: String
}
```

**Flutter Example:**
```dart
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

class WebSocketManager {
  WebSocketChannel? _channel;
  
  void connect(String jobId, String token) {
    final uri = Uri.parse(
      'wss://staging-api.oooefam.net/ws/progress?jobId=$jobId&token=$token'
    );
    
    _channel = WebSocketChannel.connect(uri);
    
    _channel!.stream.listen(
      (message) => _handleMessage(message),
      onError: (error) => print('WebSocket error: $error'),
      onDone: () => print('WebSocket closed'),
    );
  }
  
  void _handleMessage(dynamic message) {
    final data = jsonDecode(message);
    final msg = WebSocketMessageV2.fromJson(data);
    
    switch (msg.type) {
      case 'job_progress':
        _updateProgress(msg.payload);
        break;
      case 'job_complete':
        _handleCompletion(msg.payload);
        break;
      case 'error':
        _handleError(msg.payload);
        break;
      default:
        print('Unknown message type: ${msg.type}');
    }
  }
  
  void disconnect() {
    _channel?.sink.close();
  }
}

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
```

### WebSocket Message Types

#### 1. Progress Update

```json
{
  "type": "job_progress",
  "jobId": "abc123",
  "pipeline": "csv_import",
  "timestamp": 1700000000000,
  "version": "1.0.0",
  "payload": {
    "type": "job_progress",
    "progress": 0.5,
    "status": "Processing batch 5 of 10",
    "booksProcessed": 50,
    "totalBooks": 100
  }
}
```

#### 2. Job Complete

```json
{
  "type": "job_complete",
  "jobId": "abc123",
  "pipeline": "csv_import",
  "timestamp": 1700000000000,
  "version": "1.0.0",
  "payload": {
    "type": "job_complete",
    "result": {
      "totalBooks": 100,
      "successCount": 98,
      "failureCount": 2
    }
  }
}
```

#### 3. Error

```json
{
  "type": "error",
  "jobId": "abc123",
  "pipeline": "csv_import",
  "timestamp": 1700000000000,
  "version": "1.0.0",
  "payload": {
    "type": "error",
    "error": {
      "code": "PROCESSING_FAILED",
      "message": "Failed to process CSV file: Invalid format"
    }
  }
}
```

### WebSocket Test Scenarios

**Using wscat (Command Line):**
```bash
# Install wscat
npm install -g wscat

# Connect to staging WebSocket
wscat -c "wss://staging-api.oooefam.net/ws/progress?jobId=test-123&token=test-token"

# You should receive messages in v2 format
```

**Test Cases:**
- [ ] Connection establishes successfully
- [ ] Receives `job_progress` messages
- [ ] Receives `job_complete` message at end
- [ ] Handles `error` messages
- [ ] All messages include `pipeline` field
- [ ] All messages include `version: "1.0.0"`
- [ ] Payload structure matches v2 schema
- [ ] Connection survives network interruptions
- [ ] Token expiration handled gracefully

---

## Expected Response Format

### Success Response Structure

```json
{
  "data": {
    // Resource data (book, search results, etc.)
  },
  "metadata": {
    "source": "google_books" | "openlibrary" | "isbndb" | "cache",
    "cached": true | false,
    "timestamp": "2025-11-21T12:00:00Z",
    // Additional endpoint-specific metadata
  }
}
```

### Error Response Structure

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "statusCode": 400 | 401 | 404 | 429 | 500 | 502
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description | Example |
|------|-------------|-------------|---------|
| `INVALID_REQUEST` | 400 | Missing or invalid parameters | Missing `q` parameter |
| `INVALID_ISBN` | 400 | ISBN format incorrect | ISBN too short |
| `UNAUTHORIZED` | 401 | Token invalid/expired | WebSocket auth failed |
| `NOT_FOUND` | 404 | Resource not found | Book not in any provider |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | More than 10 req/min |
| `PROVIDER_ERROR` | 502 | External API failure | Google Books timeout |
| `INTERNAL_ERROR` | 500 | Server error | Unexpected exception |

---

## Issue Reporting

### How to Report Issues

If you encounter issues during staging testing:

1. **Check Existing Issues:**
   - Visit: https://github.com/jukasdrj/bookstrack-backend/issues
   - Search for similar issues

2. **Create New Issue:**
   - Use template: **[Staging] Issue Title**
   - Include:
     - Platform (iOS/Flutter)
     - Staging URL used
     - Request/response examples
     - Expected vs actual behavior
     - Steps to reproduce

3. **Join Slack Channel:**
   - `#bookstrack-api-support`
   - Real-time help available
   - Share screenshots/logs

### Issue Template

```markdown
**Platform:** iOS 17.0 / Flutter 3.13.0

**Staging URL:** https://staging-api.oooefam.net

**Endpoint:** GET /v1/search/title?q=hamlet

**Request:**
\`\`\`bash
curl "https://staging-api.oooefam.net/v1/search/title?q=hamlet"
\`\`\`

**Expected Response:**
\`\`\`json
{
  "data": { ... },
  "metadata": { ... }
}
\`\`\`

**Actual Response:**
\`\`\`json
{
  "success": true,  // OLD FORMAT - SHOULD NOT APPEAR
  "data": { ... }
}
\`\`\`

**Impact:** High - Breaks response parsing

**Steps to Reproduce:**
1. Call title search endpoint
2. Parse response
3. Expect v2 format, receive v1 format
```

### Emergency Contact

If critical blocking issues prevent testing:

- **Slack:** `#bookstrack-api-support`
- **Email:** api-support@oooefam.net
- **Escalation:** @jukasdrj (GitHub)
- **Emergency:** engineering-oncall@oooefam.net

---

## Testing Checklist

Before signing off on staging validation:

### HTTP API Tests
- [ ] Title search returns v2 envelope format
- [ ] ISBN search returns v2 envelope format
- [ ] Advanced search returns v2 envelope format
- [ ] Error responses use v2 error format
- [ ] No `success` boolean in responses
- [ ] `metadata` field present (not `meta`)
- [ ] `metadata.timestamp` included
- [ ] HTTP status codes match `error.statusCode`

### WebSocket Tests
- [ ] Connection establishes with valid token
- [ ] Messages include `pipeline` field
- [ ] Messages include `version: "1.0.0"`
- [ ] Messages include `timestamp`
- [ ] Payload structure matches v2 schema
- [ ] Progress updates received correctly
- [ ] Completion messages received
- [ ] Error messages handled properly
- [ ] Token expiration handled

### Integration Tests
- [ ] CSV import works end-to-end
- [ ] Batch enrichment processes correctly
- [ ] AI bookshelf scan completes
- [ ] Large datasets (1000+ books) handled
- [ ] Network interruptions recovered gracefully
- [ ] Rate limiting works (429 errors)

### Edge Cases
- [ ] Empty search results handled
- [ ] Special characters in queries
- [ ] Very long titles/descriptions
- [ ] Books without ISBNs
- [ ] Multiple authors
- [ ] Missing cover images

---

## FAQ

### Q: When does staging go live?
**A:** November 21, 2025

### Q: How long is staging available?
**A:** Ongoing - staging will remain available after production launch

### Q: Can I use staging in production apps?
**A:** No - staging is for testing only. Use production URL for released apps.

### Q: What data is in staging?
**A:** Staging uses the same external APIs (Google Books, ISBNdb) but isolated caches

### Q: Will my staging data affect production?
**A:** No - staging uses separate KV/R2 storage

### Q: What if I find a critical bug?
**A:** Report immediately via Slack `#bookstrack-api-support` or email api-support@oooefam.net

### Q: Are API keys the same as production?
**A:** Yes - staging shares production API keys (managed by DevOps)

---

**Document Version:** 1.0  
**Last Updated:** November 15, 2025  
**Contact:** api-support@oooefam.net
