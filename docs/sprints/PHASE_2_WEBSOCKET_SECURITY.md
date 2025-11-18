# Sprint Plan: WebSocket Authentication Security Hardening

**Project:** BooksTrack Backend (Cloudflare Workers)
**Issue:** #163 - WebSocket Token Leakage via URL Parameters
**Sprint Goal:** Eliminate transmission of long-lived JWTs in WebSocket URLs using secure ticket-based authentication
**Related Issues:** #163 (WebSocket token leakage), #173 (Hono migration - Phase 1 prerequisite)
**Created:** 2025-11-18
**Status:** Planning

---

## 1. SPRINT OVERVIEW

### Sprint Goal
Remediate the critical security vulnerability (Issue #163) where long-lived JWTs are exposed in WebSocket connection URLs by implementing a secure, ticket-based authentication mechanism using Hono's JWT middleware.

### Scope

**In Scope:**
- Implement `/api/v1/ws-auth` endpoint to generate short-lived (60s) JWT tickets
- Integrate Hono JWT middleware to validate tickets on `/ws` endpoint
- Update WebSocket upgrade handler with dual-auth (new ticket + legacy token) for backward compatibility
- Refactor Durable Object to receive validated user context
- Create comprehensive client migration guide with code examples
- Update API_CONTRACT.md Sections 3.1 and 7.1

**Out of Scope:**
- Changes to long-lived session JWT generation (already exists)
- Database-level authentication refactoring
- Rate limiting on `/ws-auth` endpoint (defer to Phase 3)
- Token revocation mechanisms (future enhancement)

### Timeline Estimate
- **Total Story Points:** 28
- **Sprint Duration:** 2 weeks (10 working days, ~6-8 hours/day)
- **Team:** 1 Backend Engineer + Frontend coordination

---

## 2. TASK BREAKDOWN

### Security Implementation (13 SP)

| ID | Task | Story Points | Owner | Dependencies |
|----|------|--------------|-------|--------------|
| **BE-1** | Implement `/api/v1/ws-auth` endpoint to generate short-lived (60s) JWT tickets | 5 | BE | Phase 1 complete |
| **BE-2** | Integrate Hono JWT middleware to validate tickets on `/ws` endpoint | 3 | BE | BE-1 |
| **BE-3** | Update WebSocket upgrade handler with dual-auth (ticket + legacy token) | 3 | BE | BE-2 |
| **BE-4** | Refactor Durable Object to receive validated user context (not raw token) | 2 | BE | BE-3 |

**Deliverable:** Secure WebSocket authentication with backward compatibility

---

### Testing (7 SP)

| ID | Task | Story Points | Owner | Dependencies |
|----|------|--------------|-------|--------------|
| **BE-5** | Write unit tests for ticket generation logic | 2 | BE | BE-1 |
| **BE-6** | Write integration tests for E2E WebSocket flow (ticket issuance + validation) | 5 | BE | BE-3 |

**Deliverable:** Comprehensive test coverage for security flows

---

### Monitoring & Operations (2 SP)

| ID | Task | Story Points | Owner | Dependencies |
|----|------|--------------|-------|--------------|
| **BE-7** | Add logging/monitoring for legacy auth usage and failed connections | 2 | BE | BE-3 |

**Deliverable:** Observability for migration progress and security events

---

### Documentation (6 SP)

| ID | Task | Story Points | Owner | Dependencies |
|----|------|--------------|-------|--------------|
| **DOC-1** | Create Client Migration Guide with iOS/Flutter/Web code examples | 3 | BE | BE-1 |
| **DOC-2** | Update API_CONTRACT.md Sections 3.1 (auth) and 7.1 (WebSocket) | 2 | BE | BE-1 |
| **DOC-3** | Update internal API documentation for `/ws-auth` endpoint | 1 | BE | BE-1 |

**Deliverable:** Complete migration documentation for frontend teams

---

### Frontend Coordination (0 SP - non-blocking)

| ID | Task | Story Points | Owner | Dependencies |
|----|------|--------------|-------|--------------|
| **FE-1** | Coordinate with client teams to schedule migration work | 1 | PM | DOC-1 |

**Note:** Frontend is currently down, so this is informational/planning only

---

## 3. TASK DEPENDENCY GRAPH

```
        +-------+
        | BE-1  | Generate JWT tickets
        +-------+
        /   |   \
       /    |    \
      v     v     v
+-------+ +-------+ +-------+
| BE-2  | | BE-5  | | DOC-2 |
| JWT   | | Unit  | | API   |
| Mid   | | Tests | | Docs  |
+-------+ +-------+ +-------+
      |                |
      v                v
+-------+          +-------+
| BE-3  |          | DOC-1 |
| Dual  |          | Migr  |
| Auth  |          | Guide |
+-------+          +-------+
   /|\                 |
  / | \                v
 v  v  v           +-------+
+---+ +---+ +---+  | FE-1  |
|BE4| |BE6| |BE7|  | Coord |
|DO | |E2E| |Log|  +-------+
+---+ +---+ +---+
```

### Critical Path
**BE-1 → BE-2 → BE-3 → BE-6** (16 SP, ~8 working days)

---

## 4. SECURITY THREAT MODEL

### Current Vulnerabilities (Issue #163)

| Vulnerability | Attack Vector | Impact | Severity |
|---------------|---------------|--------|----------|
| **URL Token Leakage** | Long-lived JWTs in query params (`?token=...`) | Tokens visible in browser history, server logs, referer headers | CRITICAL |
| **Replay Attacks** | Leaked token can impersonate user until expiry (2 hours) | Unauthorized access to WebSocket streams | HIGH |
| **Network Monitoring** | Cleartext tokens visible in network traffic analysis tools | Token harvesting via MITM | MEDIUM |
| **Shoulder Surfing** | Tokens visible in browser DevTools Network tab | Physical security breach | LOW |

### Proposed Mitigations

#### 1. Ticket-Based Authentication
**Solution:** Two-step process separates long-lived session token from WebSocket connection
- **Step 1:** Client sends session token in secure `Authorization: Bearer` header to `/api/v1/ws-auth`
- **Step 2:** Server responds with short-lived ticket (60s expiry)
- **Step 3:** Client uses ticket in WebSocket URL (`?ticket=...`)

**Security Benefit:** Long-lived token NEVER appears in URLs, logs, or browser history

#### 2. Short-Lived Tickets (60s)
**Solution:** Tickets expire after 60 seconds
- **Attack Window:** Reduced from 2 hours to 60 seconds
- **Replay Risk:** Minimal - attacker must use leaked ticket within 60s

#### 3. Single-Use Tickets (Optional - Future Enhancement)
**Solution:** Tickets invalidated after first use
- **Implementation:** Store used ticket IDs in KV cache with 60s TTL
- **Replay Prevention:** Ticket can only establish ONE connection

#### 4. Dual-Auth During Migration
**Solution:** Support both new ticket auth AND legacy token auth temporarily
- **Backward Compatibility:** Existing clients continue working
- **Gradual Migration:** Frontend teams migrate at their own pace
- **Monitoring:** Log legacy auth usage to track migration progress

### Security Validation Approach

**Code Review:**
- Mandatory peer review of all auth/token handling logic
- Security-focused review by @cf-code-reviewer agent
- Grok-4 security audit via `mcp__zen__secaudit`

**Automated Testing:**
- Unit tests for ticket generation (correct payload, signature, expiry)
- Integration tests for auth flows (happy path + failure modes)
- Security tests for attack scenarios (expired, malformed, replay)

**Penetration Testing (Manual):**
- Attempt to connect with expired ticket
- Attempt to reuse ticket (if single-use implemented)
- Attempt to forge ticket with invalid signature
- Verify legacy auth still works during transition

---

## 5. TESTING STRATEGY

### Unit Tests (BE-5: 2 SP)

**Coverage:**
- Ticket generation creates valid JWT with correct payload (`userId`, `exp`)
- Ticket is signed with correct secret from environment
- Ticket expiry is set to 60 seconds from creation
- Ticket includes necessary claims for WebSocket context

**Test Framework:** Vitest (existing BooksTrack test infrastructure)

**Example Test:**
```typescript
describe('/api/v1/ws-auth', () => {
  it('generates valid JWT ticket with 60s expiry', async () => {
    const response = await POST('/api/v1/ws-auth', {
      headers: { 'Authorization': 'Bearer <valid_session_jwt>' }
    })

    expect(response.status).toBe(200)
    const { ticket } = await response.json()

    const decoded = jwt.verify(ticket, env.JWT_SECRET)
    expect(decoded.exp - decoded.iat).toBe(60)
    expect(decoded.userId).toBe('test-user-123')
  })
})
```

---

### Integration Tests (BE-6: 5 SP)

**Happy Path:**
- Client with valid session token fetches ticket successfully
- Client connects to WebSocket using ticket
- WebSocket receives `ready` message from Durable Object
- Client sends/receives messages successfully

**Failure Modes:**
| Scenario | Expected Behavior | Test Assertion |
|----------|-------------------|----------------|
| Unauthenticated `/ws-auth` request | 401 Unauthorized | `expect(response.status).toBe(401)` |
| WebSocket connect with expired ticket | 401 Unauthorized + connection rejected | WebSocket `onerror` fired |
| WebSocket connect with malformed ticket | 401 Unauthorized + connection rejected | WebSocket `onerror` fired |
| WebSocket connect with no ticket/token | 401 Unauthorized + connection rejected | WebSocket `onerror` fired |

**Backward Compatibility:**
- Legacy client connects with `?token=<long_lived_jwt>`
- Connection succeeds (dual-auth supports legacy)
- Warning logged to monitor legacy usage

**Test Environment:** Miniflare (Cloudflare Workers local testing)

---

### End-to-End (E2E) Scenarios

**Full Client Lifecycle:**
1. User logs in → receives session JWT
2. Client fetches WebSocket ticket via `/api/v1/ws-auth`
3. Client connects to WebSocket with ticket
4. Durable Object sends `ready` message
5. Client sends progress update message
6. Durable Object broadcasts update
7. Client disconnects
8. Client reconnects with NEW ticket (old ticket expired)

**Test Tool:** Playwright or custom WebSocket client simulator

---

## 6. CLIENT MIGRATION GUIDE

### Breaking Change Overview

**What's Changing:**
- WebSocket connection method is changing from direct token-in-URL to ticket-based flow
- Clients must perform preliminary HTTP request to obtain connection ticket
- Legacy `?token=` parameter will be deprecated (supported during transition)

**Why:**
- Security: Long-lived tokens no longer exposed in URLs
- Compliance: Industry best practice for WebSocket authentication
- Risk Reduction: Attack window reduced from 2 hours to 60 seconds

---

### New Authentication Flow

#### Step 1: Request WebSocket Ticket
```http
POST /api/v1/ws-auth HTTP/1.1
Host: api.oooefam.net
Authorization: Bearer <your_long_lived_session_jwt>
Content-Type: application/json
```

**Response:**
```json
{
  "success": true,
  "data": {
    "ticket": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 60
  },
  "metadata": {
    "timestamp": "2025-11-18T10:30:00Z"
  }
}
```

#### Step 2: Connect to WebSocket
```
wss://api.oooefam.net/ws/progress?jobId=<job-uuid>&ticket=<short_lived_ticket>
```

**Note:** Ticket must be used within 60 seconds of issuance

---

### Platform-Specific Code Examples

#### Web (JavaScript/TypeScript)
```javascript
async function connectWebSocket(sessionToken, jobId) {
  // Step 1: Fetch ticket
  const response = await fetch('https://api.oooefam.net/api/v1/ws-auth', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error('Failed to obtain WebSocket ticket')
  }

  const { data } = await response.json()
  const { ticket } = data

  // Step 2: Connect with ticket
  const ws = new WebSocket(
    `wss://api.oooefam.net/ws/progress?jobId=${jobId}&ticket=${ticket}`
  )

  ws.onopen = () => console.log('WebSocket connected securely!')
  ws.onerror = (error) => console.error('Connection failed:', error)

  return ws
}
```

---

#### iOS (Swift)
```swift
func connectWebSocket(sessionToken: String, jobId: String, completion: @escaping (URLSessionWebSocketTask?, Error?) -> Void) {
    // Step 1: Fetch ticket
    var request = URLRequest(url: URL(string: "https://api.oooefam.net/api/v1/ws-auth")!)
    request.httpMethod = "POST"
    request.setValue("Bearer \(sessionToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    URLSession.shared.dataTask(with: request) { data, response, error in
        guard let data = data, error == nil else {
            completion(nil, error)
            return
        }

        do {
            let json = try JSONDecoder().decode(WebSocketTicketResponse.self, from: data)
            let ticket = json.data.ticket

            // Step 2: Connect with ticket
            let wsURL = URL(string: "wss://api.oooefam.net/ws/progress?jobId=\(jobId)&ticket=\(ticket)")!
            let webSocketTask = URLSession.shared.webSocketTask(with: wsURL)
            webSocketTask.resume()
            completion(webSocketTask, nil)
        } catch {
            completion(nil, error)
        }
    }.resume()
}

struct WebSocketTicketResponse: Codable {
    let success: Bool
    let data: TicketData
}

struct TicketData: Codable {
    let ticket: String
    let expiresIn: Int
}
```

---

#### Flutter (Dart)
```dart
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';
import 'dart:convert';

Future<WebSocketChannel> connectWebSocket(String sessionToken, String jobId) async {
  // Step 1: Fetch ticket
  final response = await http.post(
    Uri.parse('https://api.oooefam.net/api/v1/ws-auth'),
    headers: {
      'Authorization': 'Bearer $sessionToken',
      'Content-Type': 'application/json',
    },
  );

  if (response.statusCode != 200) {
    throw Exception('Failed to obtain WebSocket ticket');
  }

  final json = jsonDecode(response.body);
  final ticket = json['data']['ticket'];

  // Step 2: Connect with ticket
  final channel = WebSocketChannel.connect(
    Uri.parse('wss://api.oooefam.net/ws/progress?jobId=$jobId&ticket=$ticket'),
  );

  return channel;
}
```

---

### Migration Timeline

**Week 1: Backend Deployment**
- Deploy new `/api/v1/ws-auth` endpoint
- Deploy updated `/ws` handler with dual-auth
- Backend is backward compatible - no client changes required yet

**Weeks 2-3: Client Migration**
- iOS team updates app to use new ticket flow
- Flutter team updates app to use new ticket flow
- Web team updates app to use new ticket flow
- **Note:** Frontend is currently down, so migration can happen when frontend restarts

**Week 4: Monitoring & Deprecation**
- Monitor legacy `?token=` usage via logs
- If legacy usage drops to zero, remove dual-auth support
- Deploy final version with ticket-only auth

---

## 7. SUCCESS CRITERIA

### Security Requirements
- [ ] Zero long-lived JWTs in WebSocket URLs (Issue #163 resolved)
- [ ] All tokens passed via secure `Authorization` headers
- [ ] Ticket expiry enforced (60s maximum lifetime)
- [ ] Invalid/expired tickets rejected with 401 Unauthorized
- [ ] Security audit passed (Grok-4 via `mcp__zen__secaudit`)

### Functional Requirements
- [ ] WebSocket service remains fully functional for all clients
- [ ] Dual-auth supports both new ticket and legacy token during migration
- [ ] Durable Object receives validated user context (not raw token)
- [ ] All WebSocket message types work identically (`ready`, `progress`, `complete`, `error`)

### Performance Requirements
- [ ] Additional round-trip for ticket generation adds < 250ms to P95 connection time
- [ ] WebSocket latency unchanged (< 50ms for message delivery)
- [ ] No increase in Durable Object instantiation time
- [ ] KV cache usage unchanged (tickets not cached)

### Testing Requirements
- [ ] All unit tests pass (ticket generation, JWT validation)
- [ ] All integration tests pass (E2E flows, failure modes, backward compat)
- [ ] Security tests pass (expired, malformed, replay scenarios)
- [ ] Existing 728+ tests still pass (no regression)

### Documentation Requirements
- [ ] Client migration guide complete with code examples for all platforms
- [ ] API_CONTRACT.md updated (Sections 3.1 and 7.1)
- [ ] Internal API docs updated for `/ws-auth` endpoint
- [ ] Migration timeline communicated to frontend teams

---

## 8. ROLLOUT STRATEGY

### Phase 1: Backend Deployment (Days 1-3)

**Deploy:**
- `/api/v1/ws-auth` endpoint (ticket generation)
- Updated `/ws` handler with dual-auth logic
- Logging/monitoring for legacy auth usage

**Validation:**
- Health check: `GET /health` returns 200 OK
- Test ticket generation with `curl`:
  ```bash
  curl -X POST https://api.oooefam.net/api/v1/ws-auth \
    -H "Authorization: Bearer <test_session_jwt>" \
    -H "Content-Type: application/json"
  ```
- Test WebSocket connection with ticket (manual `wscat` test)
- Verify legacy `?token=` still works (backward compatibility)

**Rollback Plan:**
- Feature flag: `ENABLE_TICKET_AUTH=false` (instant rollback)
- Revert to previous deployment via `wrangler rollback`

---

### Phase 2: Client Coordination (Days 3-10)

**Frontend is currently down - this phase is informational/planning**

**When frontend restarts:**
- Share migration guide with iOS, Flutter, Web teams
- Provide technical support during implementation
- Answer questions about ticket lifecycle and error handling

**Migration Support:**
- Create example implementations for each platform
- Test new client apps against staging environment
- Provide debugging assistance for connection issues

---

### Phase 3: Monitoring (Continuous)

**Metrics to Track:**

**Security Metrics:**
- Legacy auth usage count (track `?token=` parameter usage)
- Failed ticket validations (invalid, expired, malformed)
- 401 Unauthorized responses by endpoint and reason

**Performance Metrics:**
- P50, P95, P99 latency for `/api/v1/ws-auth` endpoint
- WebSocket connection success rate
- Time-to-ready (ticket fetch + connection + `ready` message)

**Business Metrics:**
- Active WebSocket connections (should remain stable)
- Message throughput (should remain stable)
- Client reconnection rate (should remain stable)

**Monitoring Dashboard:**
```
┌─────────────────────────────────────┐
│ WebSocket Auth Migration Status     │
├─────────────────────────────────────┤
│ New Ticket Auth:    85% ████████▌   │
│ Legacy Token Auth:  15% █▌          │
│                                     │
│ Failed Auths (24h): 12 (0.3%)       │
│ - Expired tickets:  8               │
│ - Invalid tokens:   3               │
│ - Malformed:        1               │
│                                     │
│ P95 Connection Time: 320ms (+45ms)  │
│ WebSocket Success:   99.7%          │
└─────────────────────────────────────┘
```

---

### Phase 4: Deprecation (End of Week 4)

**Criteria for Deprecation:**
- Legacy auth usage < 1% of total connections
- All known clients migrated and tested
- Zero client-reported issues with new auth flow

**Deprecation Steps:**
1. Announce final deprecation date (7 days notice)
2. Update monitoring to alert on any legacy usage
3. Deploy final version with ticket-only auth (remove dual-auth)
4. Remove legacy `?token=` parameter support from code
5. Update API_CONTRACT.md to remove deprecated method

**Final Validation:**
- Test that legacy `?token=` parameter now returns 401
- Verify new ticket auth is the only working method
- Monitor for 48 hours to ensure no production issues

---

## 9. OPEN QUESTIONS & DECISIONS

### Decisions Required Before Sprint Start

- [ ] **Single-Use Tickets:** Implement now or defer to Phase 3?
  - **Recommendation:** Defer - adds complexity, 60s expiry is sufficient for Phase 2
  - **Implementation:** Store used ticket IDs in KV cache with 60s TTL

- [ ] **Rate Limiting on `/ws-auth`:** Required for Phase 2?
  - **Recommendation:** Defer - implement in Phase 3 alongside general rate limiting
  - **Risk:** DDoS on ticket endpoint could exhaust JWT signing resources

- [ ] **Ticket Refresh:** Allow clients to refresh tickets before expiry?
  - **Recommendation:** No - clients should fetch new ticket when needed
  - **Rationale:** Keeps implementation simple, 60s is sufficient for connection establishment

- [ ] **Error Handling:** What error codes for different failure scenarios?
  - **Recommendation:** Use standard HTTP codes + descriptive messages
    - 401 Unauthorized: Invalid/expired token or ticket
    - 400 Bad Request: Malformed ticket
    - 429 Too Many Requests: Rate limit (future)

### Post-Sprint Review Topics

- Lessons learned from dual-auth migration
- Client feedback on new authentication flow
- Performance impact analysis (P95 connection time)
- Security audit findings (Grok-4 review)
- Decision on single-use ticket implementation (Phase 3?)

---

## 10. APPENDIX: IMPLEMENTATION TEMPLATES

### A. WebSocket Ticket Endpoint (`src/handlers/ws-auth.ts`)
```typescript
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { sign } from 'hono/jwt'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()

// Validate session JWT before generating ticket
app.use('*', jwt({
  secret: (c) => c.env.JWT_SECRET
}))

app.post('/', async (c) => {
  try {
    // Get validated user from session JWT
    const payload = c.get('jwtPayload')
    const userId = payload.sub || payload.userId

    if (!userId) {
      return c.json({
        success: false,
        error: {
          code: 'INVALID_SESSION',
          message: 'Session token missing user ID',
          statusCode: 401
        }
      }, 401)
    }

    // Generate short-lived ticket (60s)
    const ticket = await sign(
      {
        userId,
        type: 'websocket_ticket',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60 // 60 seconds
      },
      c.env.JWT_SECRET
    )

    return c.json({
      success: true,
      data: {
        ticket,
        expiresIn: 60
      },
      metadata: {
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('[ws-auth] Ticket generation failed:', error)
    return c.json({
      success: false,
      error: {
        code: 'TICKET_GENERATION_FAILED',
        message: 'Unable to generate WebSocket ticket',
        statusCode: 500
      }
    }, 500)
  }
})

export default app
```

---

### B. WebSocket Handler with Dual-Auth (`src/router.ts`)
```typescript
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from './types'

const app = new Hono<{ Bindings: Env }>()

// WebSocket upgrade handler with dual-auth
app.get('/ws/progress', async (c) => {
  const url = new URL(c.req.url)
  const jobId = url.searchParams.get('jobId')
  const ticket = url.searchParams.get('ticket') // New ticket-based auth
  const legacyToken = url.searchParams.get('token') // Legacy auth (deprecated)

  if (!jobId) {
    return c.json({
      success: false,
      error: { code: 'MISSING_JOB_ID', message: 'jobId parameter required', statusCode: 400 }
    }, 400)
  }

  let userId: string

  // Try new ticket auth first
  if (ticket) {
    try {
      const payload = await jwt({ secret: c.env.JWT_SECRET }).decode(ticket)

      if (payload.type !== 'websocket_ticket') {
        throw new Error('Invalid ticket type')
      }

      userId = payload.userId
      console.log('[ws] Authenticated via ticket:', { userId, jobId })

    } catch (error) {
      console.error('[ws] Ticket validation failed:', error)
      return c.json({
        success: false,
        error: { code: 'INVALID_TICKET', message: 'WebSocket ticket is invalid or expired', statusCode: 401 }
      }, 401)
    }
  }
  // Fallback to legacy token auth (temporary - will be removed)
  else if (legacyToken) {
    try {
      const payload = await jwt({ secret: c.env.JWT_SECRET }).decode(legacyToken)
      userId = payload.sub || payload.userId

      // Log legacy usage for monitoring
      console.warn('[ws] LEGACY AUTH USED:', { userId, jobId, timestamp: new Date().toISOString() })

    } catch (error) {
      console.error('[ws] Legacy token validation failed:', error)
      return c.json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'WebSocket token is invalid or expired', statusCode: 401 }
      }, 401)
    }
  }
  // No authentication provided
  else {
    return c.json({
      success: false,
      error: { code: 'MISSING_AUTH', message: 'WebSocket ticket or token required', statusCode: 401 }
    }, 401)
  }

  // Forward to Durable Object with validated user context
  const doId = c.env.PROGRESS_TRACKER.idFromName(jobId)
  const stub = c.env.PROGRESS_TRACKER.get(doId)

  // Pass user context in request (not in URL!)
  const request = new Request(c.req.raw.url, {
    headers: {
      ...c.req.raw.headers,
      'X-User-ID': userId // Validated user context
    }
  })

  return stub.fetch(request)
})

export default app
```

---

### C. Updated Durable Object (`src/durable-objects/progress-tracker.js`)
```javascript
export class ProgressTracker {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.sessions = new Map()
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade')

    if (upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 })
    }

    // Get validated user context from header (set by Hono router)
    const userId = request.headers.get('X-User-ID')

    if (!userId) {
      return new Response('Unauthorized: Missing user context', { status: 401 })
    }

    // Create WebSocketPair
    const { 0: client, 1: server } = new WebSocketPair()
    server.accept()

    // Store session with validated user context
    const url = new URL(request.url)
    const jobId = url.searchParams.get('jobId')

    this.sessions.set(server, {
      userId,
      jobId,
      connectedAt: Date.now()
    })

    // Send ready message
    server.send(JSON.stringify({
      type: 'ready',
      jobId,
      message: 'WebSocket connection established securely'
    }))

    // Handle messages
    server.addEventListener('message', (event) => {
      const session = this.sessions.get(server)
      console.log(`[DO] Message from user ${session.userId}:`, event.data)
    })

    server.addEventListener('close', () => {
      this.sessions.delete(server)
    })

    return new Response(null, {
      status: 101,
      webSocket: client
    })
  }
}
```

---

**Sprint Owner:** Backend Team
**Security Reviewer:** @cf-code-reviewer + Grok-4 security audit
**Stakeholders:** Frontend Teams (iOS, Flutter, Web) - currently inactive
**Next Review:** End of Week 1 (security validation checkpoint)
**Sprint End:** End of Week 2 (retrospective + Phase 3 planning)
