# WebSocket Close Codes Implementation Review

**Last Updated:** 2025-11-15

**Reviewed Commit:** bab2aca - "feat: Add proper WebSocket close codes for error handling (Issue #128)"

**Reviewed by:** Claude Code (Haiku 4.5)

**Review Status:** REQUIRES FIXES (2 High-severity issues, 2 Medium-severity issues)

---

## Executive Summary

The WebSocket close codes implementation in commit bab2aca demonstrates **excellent RFC 6455 compliance** in terms of constant definitions and correct usage where implemented. The constants are well-documented, type-safe, and properly used in three key scenarios (cancellation, completion, error).

However, the implementation has **critical gaps in error scenario coverage** that create silent failures and protocol violations:

1. **Protocol errors are silently ignored** - Invalid JSON and malformed messages don't close the connection
2. **Message size validation is missing** - No check against Cloudflare's 32 MiB limit
3. **Invalid messages are dropped silently** - Clients can't distinguish between valid and invalid messages
4. **POLICY_VIOLATION (1008) is unused** - Auth failures return HTTP 401 instead of WebSocket close code

These gaps violate RFC 6455 specifications and prevent clients from implementing robust reconnection logic.

---

## Critical Issues

### NONE - No critical bugs found

The close codes themselves are implemented correctly where used. No security vulnerabilities in close code usage.

---

## High-Severity Issues

### 1. Protocol Error Handling Missing

**Location:** `/Users/justingardner/Downloads/xcode/bookstrack-backend/src/durable-objects/progress-socket.js:224-226`

**Severity:** HIGH

**Problem:**
```javascript
try {
  const msg = JSON.parse(event.data);
  // ... validation ...
} catch (error) {
  console.error(`[${this.jobId}] Failed to parse message:`, error);
  // ❌ SILENTLY RETURNS - Connection stays open!
}
```

When a client sends invalid JSON, the error is logged but the connection remains open. RFC 6455 requires closing with code 1002 (PROTOCOL_ERROR) when protocol violations occur.

**Impact:**
- Malformed messages keep connection open indefinitely
- Resources wasted on dead connections
- Mobile client can't detect the error
- Potential for subtle bugs in client error handling

**RFC 6455 Requirement:**
> "An endpoint MUST NOT send a 1002 Reserved or 1003 Reserved status code."
> But for protocol errors (malformed data): "may be sent as a result of a protocol error caused by an endpoint not following the protocol."

**Recommended Fix:**
```javascript
try {
  const msg = JSON.parse(event.data);
  // ... validation continues ...
} catch (error) {
  console.error(`[${this.jobId}] Protocol error - invalid JSON:`, error);
  // ✅ Close with proper code
  this.webSocket.close(WebSocketCloseCodes.PROTOCOL_ERROR, 'Invalid JSON message');
  return;
}
```

**Testing Approach:**
1. Send `{"invalid": "json"` (missing closing brace) → should close with 1002
2. Send `null` or `undefined` → should close with 1002
3. Verify connection closes after error

---

### 2. Invalid Message Structure Silently Dropped

**Location:** `/Users/justingardner/Downloads/xcode/bookstrack-backend/src/durable-objects/progress-socket.js:188-196`

**Severity:** HIGH

**Problem:**
```javascript
if (!msg || typeof msg !== 'object') {
  console.warn(`[${this.jobId}] Invalid message structure: not an object`);
  return; // ❌ Silently drops message
}

if (!msg.type || typeof msg.type !== 'string') {
  console.warn(`[${this.jobId}] Invalid message structure: missing or invalid 'type' field`, msg);
  return; // ❌ Silently drops message
}
```

Valid JSON but with incorrect structure is silently dropped. Clients can send garbage indefinitely without feedback.

**Impact:**
- Clients can't distinguish between "message received" and "message invalid"
- No way for mobile app to implement proper retry logic
- Silent failures in message validation

**RFC 6455 Requirement:**
> When receiving a frame with an invalid opcode or payload, an endpoint SHOULD close with code 1002.

**Recommended Fix:**
```javascript
try {
  const msg = JSON.parse(event.data);

  // Validate structure
  if (!msg || typeof msg !== 'object') {
    console.warn(`[${this.jobId}] Protocol error - message not object`);
    this.webSocket.close(WebSocketCloseCodes.PROTOCOL_ERROR, 'Message must be object');
    return;
  }

  if (!msg.type || typeof msg.type !== 'string') {
    console.warn(`[${this.jobId}] Protocol error - missing or invalid type field`);
    this.webSocket.close(WebSocketCloseCodes.PROTOCOL_ERROR, 'Missing required "type" field');
    return;
  }

  // Continue processing...
} catch (error) {
  console.error(`[${this.jobId}] Protocol error - JSON parse failed:`, error);
  this.webSocket.close(WebSocketCloseCodes.PROTOCOL_ERROR, 'Invalid JSON');
  return;
}
```

**Testing Approach:**
1. Send `{}` (missing type field) → should close with 1002
2. Send `{"type": 123}` (type not string) → should close with 1002
3. Send `"not an object"` → should close with 1002

---

## Medium-Severity Issues

### 1. Message Size Validation Missing

**Location:** `/Users/justingardner/Downloads/xcode/bookstrack-backend/src/durable-objects/progress-socket.js` - All `send()` calls

**Severity:** MEDIUM

**Problem:**
No validation occurs before sending messages. Cloudflare has a 32 MiB hard limit, but messages that exceed this fail silently at the platform level without being reported to the client.

**Reference:** `/Users/justingardner/Downloads/xcode/bookstrack-backend/docs/WEBSOCKET_IMPROVEMENTS_2025-11-14.md:126` already documents the recommendation:
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
```

**Impact:**
- Messages silently fail at Cloudflare boundary
- Client doesn't know why message wasn't delivered
- No chance for graceful degradation (e.g., summary-only payload)
- RFC 6455 recommends close code 1009 (MESSAGE_TOO_BIG) for this scenario

**Current Send Methods Without Validation:**
- `sendJobStarted()` - line 673
- `updateProgress()` - line 708
- `complete()` - line 745
- `sendError()` - line 790
- `pushProgress()` - line 527

**Recommended Fix:**

Create a helper method in the class:
```javascript
/**
 * Validate message size before sending
 * Cloudflare hard limit: 32 MiB
 * Mobile soft limit: 1 MB (performance warning)
 */
validateMessageSize(message) {
  const payload = JSON.stringify(message);
  const sizeBytes = new TextEncoder().encode(payload).length;

  const CLOUDFLARE_LIMIT = 33_554_432; // 32 MiB
  const MOBILE_WARNING_LIMIT = 1_000_000; // 1 MB

  if (sizeBytes > CLOUDFLARE_LIMIT) {
    console.error(`[${this.jobId}] Message exceeds Cloudflare limit: ${sizeBytes} bytes`);
    this.webSocket.close(WebSocketCloseCodes.MESSAGE_TOO_BIG, 'Message exceeds 32 MiB limit');
    throw new Error(`Message too large: ${sizeBytes} bytes exceeds 32 MiB limit`);
  }

  if (sizeBytes > MOBILE_WARNING_LIMIT) {
    console.warn(`[${this.jobId}] Large message: ${sizeBytes} bytes (mobile performance impact)`);
  }

  return payload; // Return stringified version to avoid double-serialization
}
```

Then update each `send()` method:
```javascript
async complete(pipeline, payload) {
  if (!this.webSocket) {
    console.warn(`[${this.jobId}] No WebSocket connection available`);
    return { success: false };
  }

  const message = {
    type: 'job_complete',
    jobId: this.jobId,
    pipeline,
    timestamp: Date.now(),
    version: '1.0.0',
    payload: {
      type: 'job_complete',
      pipeline,
      ...payload
    }
  };

  try {
    const messageStr = this.validateMessageSize(message); // ✅ NEW
    this.webSocket.send(messageStr);
    console.log(`[${this.jobId}] Job complete message sent`);
    // ... rest of method
  } catch (error) {
    // Size validation already closes connection
    return { success: false };
  }
}
```

**Testing Approach:**
1. Create a large payload (> 32 MiB) → should close with 1009
2. Create a medium payload (1-32 MiB) → should log warning but send
3. Verify connection closes cleanly on oversized messages

**Note:** This is especially important given that the implementation was recently changed to send summary-only payloads (Issue #116). However, validation is still necessary as a safety check.

---

### 2. POLICY_VIOLATION (1008) Code Not Used

**Location:** `/Users/justingardner/Downloads/xcode/bookstrack-backend/src/durable-objects/progress-socket.js:125-144`

**Severity:** MEDIUM

**Problem:**
The `POLICY_VIOLATION` (1008) close code is defined but never used. Authentication failures currently return HTTP 401 before WebSocket upgrade completes.

```javascript
// Current implementation
if (!storedToken || !providedToken || storedToken !== providedToken) {
  console.warn(`[${jobId}] WebSocket authentication failed - invalid token`);
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/plain'
    }
  });
}
```

**Root Cause Analysis:**
- Auth validation happens **before** WebSocket upgrade (pre-upgrade)
- Client can't establish connection in the first place
- HTTP 401 is technically correct but clients can't receive WebSocket close code

**Impact:**
- POLICY_VIOLATION (1008) is unused and may confuse future developers
- If mid-connection auth validation is added, close code needs to be 1008
- Documentation doesn't clarify this design choice

**Recommended Fix:**

This is **not a bug** in the current implementation - it's a design choice. However, it should be clarified:

```javascript
// Clarifying comment at top of fetch() method:
/**
 * WebSocket upgrade with authentication validation
 *
 * Authentication Flow:
 * 1. Token validation happens BEFORE upgrade (line 115-144)
 * 2. Invalid token returns HTTP 401 (no WebSocket connection)
 * 3. Only valid tokens proceed to WebSocket pair creation
 *
 * RFC 6455 Note: POLICY_VIOLATION (1008) is used when policy
 * violations occur AFTER connection. Pre-upgrade auth failures
 * use HTTP 401 per standard REST conventions.
 *
 * If post-upgrade policy validation is added (e.g., token expiration
 * during message processing), use close code 1008.
 */
async fetch(request) {
  // ... implementation
}
```

In the `message` event handler, if future post-upgrade auth checks are added:
```javascript
// Future: Add if needed for mid-connection auth validation
if (msg.type === 'refresh_token' && !isTokenValid(msg.token)) {
  console.warn(`[${this.jobId}] Policy violation - invalid token in message`);
  this.webSocket.close(WebSocketCloseCodes.POLICY_VIOLATION, 'Authentication required');
  return;
}
```

**Action Items:**
- [x] Add clarifying comment to fetch() method
- [ ] Document pre-upgrade vs post-upgrade auth handling
- [ ] Plan for Issue #127 (reconnection) to handle 1008 responses

---

## Minor Suggestions

### 1. Document Close Code Semantics for Clients

**Location:** `/Users/justingardner/Downloads/xcode/bookstrack-backend/src/types/websocket-messages.ts`

**Suggestion:** Add a file `/docs/WEBSOCKET_CLOSE_CODES.md` documenting what each code means for iOS clients:

```markdown
# WebSocket Close Codes (RFC 6455)

## Client Reconnection Logic

### 1000 - Normal Closure
- **Meaning:** Job completed successfully
- **Client Action:** Show completion screen, don't retry

### 1001 - Going Away
- **Meaning:** Job was canceled by user
- **Client Action:** Show cancellation screen, don't retry

### 1002 - Protocol Error
- **Meaning:** Client sent malformed message
- **Client Action:** Log error, don't reconnect (indicates client bug)

### 1008 - Policy Violation
- **Meaning:** Authentication or policy validation failed
- **Client Action:** Refresh token and reconnect (Issue #127)

### 1009 - Message Too Big
- **Meaning:** Response payload exceeded 32 MiB limit
- **Client Action:** Implement summary-only payload mode (Issue #116)

### 1011 - Internal Server Error
- **Meaning:** Unhandled exception in job processing
- **Client Action:** Implement exponential backoff retry

### 1012 - Service Restart
- **Meaning:** Server restarting (deployment)
- **Client Action:** Wait 5 seconds, then reconnect (Issue #127)

### 1013 - Try Again Later
- **Meaning:** Server overloaded or rate limited
- **Client Action:** Exponential backoff with jitter
```

---

## Positive Findings

### Excellent Close Code Definition

**Location:** `/Users/justingardner/Downloads/xcode/bookstrack-backend/src/types/websocket-messages.ts:51-87`

The close code constants are well-designed:
- Accurate RFC 6455 documentation
- Proper TypeScript typing with `WebSocketCloseCode`
- Clear comments explaining use cases
- Follows project naming conventions (UPPER_SNAKE_CASE)

**Example:**
```typescript
export const WebSocketCloseCodes = {
  /** Normal closure; session completed successfully */
  NORMAL_CLOSURE: 1000,

  /** Going away (e.g., server shutting down, client navigating away) */
  GOING_AWAY: 1001,

  // ... etc
} as const;

export type WebSocketCloseCode = typeof WebSocketCloseCodes[keyof typeof WebSocketCloseCodes];
```

### Correct Usage in Implemented Scenarios

Where close codes are used, they're correct:

1. **cancelJob()** - Uses 1001 (GOING_AWAY) - Correct for user cancellation
2. **closeConnection()** - Uses 1000 (NORMAL_CLOSURE) - Correct for normal shutdown
3. **complete()** - Uses 1000 (NORMAL_CLOSURE) - Correct for successful completion
4. **sendError()** - Uses 1011 (INTERNAL_ERROR) - Correct for job failures

### Security: No Issues Found

- Close codes don't leak sensitive information
- Error messages don't expose internal details
- CORS headers properly set (no secrets exposed)
- No injection vulnerabilities in code paths

### Good Error Message Handling

Error messages are generic and user-friendly:
- ✓ "Job failed" (not "Database connection timeout")
- ✓ "Invalid token" (not "Token hash mismatch on line 42")
- ✓ "Message too large" (not "32554432 bytes > limit")

---

## Architecture Considerations

### 1. RFC 6455 Compliance Strategy

The implementation should follow this hierarchy:
1. **Pre-upgrade validation** → HTTP status codes (401, 400, 426)
2. **Post-upgrade protocol errors** → WebSocket close codes (1002, 1008, 1009)
3. **Job-level errors** → WebSocket messages (error message type) + close (1011)

Currently: (1) and (3) are implemented, (2) is missing.

### 2. Integration with Issue #127 (Reconnection)

When implementing reconnection logic, clients will need to handle:
- **1000** → Success, show results
- **1001** → Cancelled, no retry
- **1002** → Protocol error, log and debug
- **1008** → Auth failure, refresh token and retry
- **1009** → Message too big, use summary mode
- **1011** → Server error, exponential backoff
- **1012** → Service restart, retry with delay
- **1013** → Rate limit, exponential backoff

The current implementation supports 1000/1001/1011. Completing 1002/1008/1009 removes ambiguity.

### 3. Mobile Client Expectations

iOS clients expect:
- Clear distinction between "completed successfully" (1000) and "error occurred" (1011)
- Ability to retry on transient errors (1011, 1013)
- No retry on auth failures (1008) or protocol errors (1002)

Current implementation provides this for job completion/errors but not for protocol-level issues.

---

## Next Steps

### Before Merging
1. **Fix HIGH priority issues** (2 items)
   - [ ] Add protocol error handling for JSON.parse() failures
   - [ ] Add validation for invalid message structure

2. **Fix MEDIUM priority issues** (1 item)
   - [ ] Implement message size validation with 1009 close code

3. **Document design decisions** (1 item)
   - [ ] Add clarifying comments about POLICY_VIOLATION (1008) usage

### Phase 2 (Issue #127 - Reconnection)
- Implement client-side reconnection logic based on close codes
- Document reconnection behavior for each close code
- Add tests for reconnection scenarios

### Phase 3 (Future Enhancement)
- Implement 1012 (SERVICE_RESTART) for deployment notifications
- Implement 1013 (TRY_AGAIN_LATER) for rate limiting
- Add close code metrics to analytics

---

## Testing Recommendations

### Unit Tests
```javascript
describe('WebSocket Close Codes', () => {
  it('should close with 1002 on JSON parse error', async () => {
    // Send invalid JSON
    ws.send('{"invalid": json');

    // Expect connection to close with code 1002
    await expectCloseCode(1002);
  });

  it('should close with 1002 on missing type field', async () => {
    // Send valid JSON but no type
    ws.send('{}');

    // Expect connection to close with code 1002
    await expectCloseCode(1002);
  });

  it('should close with 1009 on oversized message', async () => {
    // Send message > 32 MiB
    const largePayload = 'x'.repeat(34 * 1024 * 1024);

    // Expect connection to close with code 1009
    await expectCloseCode(1009);
  });
});
```

### Integration Tests
```javascript
describe('WebSocket Reconnection', () => {
  it('should handle close code 1000 as success', async () => {
    // Complete job successfully
    // Expect close code 1000
    // Client should show success screen
  });

  it('should handle close code 1011 as retryable error', async () => {
    // Throw error during job
    // Expect close code 1011
    // Client should implement exponential backoff
  });

  it('should handle close code 1001 as cancellation', async () => {
    // Cancel job
    // Expect close code 1001
    // Client should show cancellation confirmation
  });
});
```

---

## Summary of Required Changes

| Issue | Severity | Type | Effort | Impact |
|-------|----------|------|--------|--------|
| Protocol error handling | HIGH | Bug | 30 min | Prevents resource leaks |
| Invalid message validation | HIGH | Bug | 30 min | Proper RFC 6455 compliance |
| Message size validation | MEDIUM | Enhancement | 45 min | Safety check + mobile performance |
| POLICY_VIOLATION documentation | MEDIUM | Documentation | 15 min | Clarity for future development |
| Client reconnection docs | LOW | Documentation | 30 min | Improves implementation quality |

**Total Effort:** ~2.5 hours

**Blocking Issues:** 2 (HIGH severity items)

**Nice to Have:** 3 (MEDIUM and LOW items)

---

Please review the findings and approve which changes to implement before I proceed with any fixes.
