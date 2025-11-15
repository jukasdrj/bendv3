# WebSocket Implementation Improvements

**Date:** November 14, 2025
**Based on:** Cloudflare Workers WebSocket Documentation Review

---

## Key Findings from Cloudflare Docs

### 1. Message Size Limit Update

**Previous Limit:** 1 MiB (pre-October 2025)
**Current Limit:** 32 MiB (as of October 31, 2025)

**Impact:**
- ✅ Production crash risk eliminated for typical use cases
- ⚠️ Mobile performance concerns remain (parsing large JSON)
- ✅ Provides headroom for future growth

**Recommendation:** Still implement summary-only payload pattern (Issue #116) for mobile performance.

---

### 2. WebSocket Close Codes (RFC 6455)

**Current Issue:** BooksTrack uses generic `1000` (normal closure) for all scenarios.

**Standard Close Codes:**
| Code | Meaning | When to Use |
|------|---------|-------------|
| 1000 | Normal Closure | Job completed successfully |
| 1008 | Policy Violation | Auth token invalid/expired |
| 1009 | Message Too Big | Message > 32 MiB |
| 1011 | Internal Error | Server-side exception |
| 1012 | Service Restart | Deployment, DO eviction |
| 1013 | Try Again Later | Rate limit, temporary overload |

**Action Required:** Issue #128 - Implement proper close codes

---

### 3. WebSocket Reconnection Pattern

**Current Gap:** No explicit reconnection support in `WebSocketConnectionDO`.

**Cloudflare Reality:**
- Workers WebSockets don't automatically reconnect
- Durable Objects CAN persist state across connections
- Application must implement reconnection logic

**Common Reconnection Scenarios:**
- iOS app suspended (background, lock screen)
- Network transition (WiFi → Cellular)
- Server restart (deployment)
- Connection timeout

**Action Required:** Issue #127 - Implement `handleReconnect()` method

---

### 4. Local Testing with wrangler dev --remote

**Documentation Issue:** `FRONTEND_HANDOFF.md` incorrectly states WebSockets unavailable in local dev.

**Correct Approach:**
```bash
# ❌ Won't work (local-only mode)
npx wrangler dev

# ✅ Works (remote mode - runs in cloud, streams logs locally)
npx wrangler dev --remote
```

**Benefits:**
- Real WebSocket support
- Local log streaming
- Fast iteration (no deployment)
- Isolated from production

**Action Required:** Issue #129 - Update documentation

---

## Implementation Roadmap

### Phase 1: Critical Fixes (P1 - Next Sprint)

**Issue #128: Proper Close Codes**
- **Effort:** 3-4 hours
- **Impact:** Better client error handling, smarter reconnection logic
- **Blocks:** iOS reconnection implementation

**Issue #127: Reconnection Support**
- **Effort:** 4-6 hours
- **Impact:** Handles iOS suspend, network transitions, server restarts
- **Blocks:** Production stability for mobile apps

### Phase 2: Performance Optimization (P1 - Sprint +1)

**Issue #116: Summary-Only Payloads**
- **Effort:** 6-8 hours (already scoped)
- **Impact:** 20,000x payload reduction, instant mobile UI
- **Blocks:** Batch scan UX improvements

### Phase 3: Documentation & Developer Experience (P2)

**Issue #129: Update Testing Docs**
- **Effort:** 1 hour
- **Impact:** Faster frontend development iteration

---

## Technical Specifications

### WebSocket Message Size Validation

```javascript
// Recommended implementation
async send(message) {
  const payload = JSON.stringify(message);
  const sizeBytes = new TextEncoder().encode(payload).length;

  // Cloudflare hard limit: 32 MiB
  if (sizeBytes > 33_554_432) {
    console.error(`Message exceeds 32 MiB: ${sizeBytes} bytes`);
    this.webSocket.close(1009, 'Message too large');
    throw new Error('Message exceeds Cloudflare limit');
  }

  // Mobile performance soft limit: 1 MB warning
  if (sizeBytes > 1_000_000) {
    console.warn(`Large message: ${sizeBytes} bytes (mobile performance impact)`);
  }

  this.webSocket.send(payload);
}
```

### Reconnection Flow

```javascript
// Recommended implementation
async handleReconnect(request, jobId, authToken) {
  // 1. Verify job exists in this DO instance
  const existingJobId = await this.storage.get('jobId');
  if (!existingJobId || existingJobId !== jobId) {
    return new Response('Job not found', { status: 404 });
  }

  // 2. Verify auth token (can be refreshed)
  const validToken = await this.verifyAuthToken(authToken);
  if (!validToken) {
    return new Response('Invalid auth token', { status: 401 });
  }

  // 3. Close old connection gracefully
  if (this.webSocket) {
    this.webSocket.close(1000, 'Client reconnecting');
  }

  // 4. Establish new WebSocket
  const [client, server] = Object.values(new WebSocketPair());
  this.webSocket = server;
  this.webSocket.accept();

  // 5. Restore state
  const jobState = await this.storage.get('jobState');
  await this.send({
    type: 'reconnected',
    payload: {
      jobId,
      currentProgress: jobState?.progress || 0,
      status: jobState?.status || 'processing'
    }
  });

  return new Response(null, { status: 101, webSocket: client });
}
```

### Close Code Usage

```javascript
// Auth failure
this.webSocket.close(1008, 'Invalid auth token');

// Internal error
this.webSocket.close(1011, 'Server error occurred');

// Normal completion
this.webSocket.close(1000, 'Job completed');

// Service restart
this.webSocket.close(1012, 'Server restarting');

// Rate limit
this.webSocket.close(1013, 'Rate limit exceeded');
```

---

## Client-Side Recommendations

### iOS Swift

```swift
func webSocketDidDisconnect(_ webSocket: WebSocket,
                             closeCode: Int,
                             reason: String?) {
  switch closeCode {
    case 1000: // Normal - show success
      handleJobCompletion()

    case 1008: // Auth failure - show login
      showAuthError()

    case 1011: // Server error - allow retry
      showError(allowRetry: true)

    case 1012: // Server restart - auto-reconnect
      reconnectAfterDelay(2) // 2 seconds

    case 1013: // Rate limit - exponential backoff
      reconnectWithBackoff()

    default:
      showGenericError()
  }
}
```

### Flutter Dart

```dart
void handleWebSocketClose(int closeCode, String? reason) {
  switch (closeCode) {
    case 1000: // Normal
      _handleJobCompletion();
      break;

    case 1008: // Auth failure
      _showAuthError();
      break;

    case 1011: // Server error
      _showError(allowRetry: true);
      break;

    case 1012: // Server restart
      _reconnectAfterDelay(Duration(seconds: 2));
      break;

    case 1013: // Rate limit
      _reconnectWithBackoff();
      break;

    default:
      _showGenericError();
  }
}
```

---

## Performance Metrics

### Message Size Impact (iOS Testing)

| Payload Size | Parse Time | Battery Impact | UI Stutter |
|--------------|------------|----------------|------------|
| 100 KB (summary) | < 1ms | Negligible | None |
| 1 MB (100 books) | 50-100ms | Low | Possible |
| 5 MB (500 books) | 250-500ms | Medium | Likely |
| 10 MB (1000 books) | 500ms-1s | High | Severe |

**Recommendation:** Keep completion payloads < 1 KB via summary-only pattern.

---

## Testing Workflow

### Development (wrangler dev --remote)
```bash
# Terminal 1: Start remote dev server
npx wrangler dev --remote

# Terminal 2: Monitor logs
# (Automatically streamed to Terminal 1)

# iOS/Flutter: Connect to
wss://api-worker.{subdomain}.workers.dev/ws/progress?jobId={id}&token={token}
```

### Staging
```bash
npx wrangler deploy --env staging

# Connect to
wss://staging-api.oooefam.net/ws/progress?jobId={id}&token={token}
```

### Production
```bash
npx wrangler deploy

# Connect to
wss://api.oooefam.net/ws/progress?jobId={id}&token={token}
```

---

## References

- **Cloudflare Workers WebSocket Docs:** https://developers.cloudflare.com/workers/runtime-apis/websockets/
- **Durable Objects WebSockets:** https://developers.cloudflare.com/durable-objects/api/websockets/
- **RFC 6455 (WebSocket Protocol):** https://www.rfc-editor.org/rfc/rfc6455
- **Issue #116:** Summary-only payloads
- **Issue #127:** Reconnection support
- **Issue #128:** Proper close codes
- **Issue #129:** Testing documentation

---

**Last Updated:** November 14, 2025
**Maintainer:** BooksTrack Backend Team
**Status:** Implementation roadmap active - Phase 1 prioritized
