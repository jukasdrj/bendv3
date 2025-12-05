#!/bin/bash
# Create GitHub issues for V3 API deprecation plan
# Usage: ./scripts/create-v3-issues.sh

set -e

echo "🚀 Creating GitHub issues for V3 API migration..."

# Issue 1: Job Framework Foundation
echo "📋 Creating Issue 1: Job Framework Foundation..."
gh issue create \
  --title "[V3 Phase 2.1] Job Framework Foundation" \
  --body "## Overview
Implement shared job management framework for V3 API to support async workflows (CSV import, bookshelf scanning, batch enrichment).

## Scope
Create unified job lifecycle management with:
- Shared Zod schemas for all job types
- Common utilities (DO access, auth token generation)
- Base job routes structure

## Implementation

### File Structure
\`\`\`
src/api-v3/jobs/
  schema.ts          # Shared Zod schemas (JobSchema, JobStatusSchema, etc.)
  common.ts          # Utilities (getJobStateManagerDO, generateAuthToken)
  imports.ts         # CSV import routes (created in separate issue)
  scans.ts           # Bookshelf scan routes (created in separate issue)
  enrichment.ts      # Async batch enrichment (created in separate issue)
\`\`\`

### Deliverables
- [ ] Create \`src/api-v3/jobs/schema.ts\` with all base schemas
- [ ] Create \`src/api-v3/jobs/common.ts\` with DO/auth helpers
- [ ] Unit tests for schema validation (>80% coverage)
- [ ] Update \`@bookstrack/schemas\` package if needed

## Acceptance Criteria
- [ ] All schemas validate correctly with Zod
- [ ] Auth token generation is cryptographically secure (32 bytes)
- [ ] Unit tests pass with >80% coverage

**Effort:** 2-3 days | **Priority:** P0 (blocks all V3 async features)

📖 **References:**
- [V3 Implementation Guide](https://github.com/jukasdrj/bendv3/blob/main/docs/V3_IMPLEMENTATION_GUIDE.md)
- [Deprecation Plan](https://github.com/jukasdrj/bendv3/blob/main/docs/V1_V2_DEPRECATION_PLAN.md)" \
  --label "v3-api,enhancement,priority: critical"

# Issue 2: SSE Streaming
echo "📋 Creating Issue 2: SSE Streaming Implementation..."
gh issue create \
  --title "[V3 Phase 2.2] SSE Progress Streaming" \
  --body "## Overview
Implement Server-Sent Events (SSE) streaming for real-time job progress updates. Replaces WebSocket-based progress tracking from V1/V2.

## Why SSE over WebSocket?
- Browser-native reconnection with \`Last-Event-ID\`
- Firewall-friendly (HTTP/1.1)
- Simpler client implementation
- Books array included in completion event (iOS persistence requirement)

## Implementation

### Route
\`GET /v3/jobs/{type}/{jobId}/stream\`

### Event Types
1. \`progress\` - Every 2s while processing
2. \`complete\` - Includes full results for iOS
3. \`error\` - Includes retryable flag
4. \`ping\` - Heartbeat every 30s

### Deliverables
- [ ] Implement SSE endpoint in \`src/api-v3/jobs/stream.ts\`
- [ ] Add \`Last-Event-ID\` support for reconnection
- [ ] Include books array in completion event (iOS requirement)
- [ ] Bearer token authentication
- [ ] Graceful cleanup on client disconnect
- [ ] Integration tests with SSE client
- [ ] Load test (1000 concurrent streams)

## Acceptance Criteria
- [ ] SSE connection establishes in <50ms P95
- [ ] Reconnection success rate >95%
- [ ] Events delivered every 2s during processing
- [ ] Completion event includes full results array
- [ ] Handles 1000+ concurrent streams without errors

**Effort:** 2-3 days | **Priority:** P0 (required for all async jobs)

📖 **References:**
- [V3 Implementation Guide - SSE Section](https://github.com/jukasdrj/bendv3/blob/main/docs/V3_IMPLEMENTATION_GUIDE.md#priority-2-sse-streaming)
- Port logic from: \`src/handlers/v2/sse-stream.ts\`" \
  --label "v3-api,enhancement,priority: critical"

# Issue 3: CSV Import
echo "📋 Creating Issue 3: CSV Import Workflow..."
gh issue create \
  --title "[V3 Phase 2.3] CSV Import Workflow" \
  --body "## Overview
Migrate CSV import workflow to V3 API with job-based async processing.

## Endpoints
- \`POST /v3/jobs/imports\` - Initiate import (multipart/form-data)
- \`GET /v3/jobs/imports/{jobId}\` - Job status
- \`GET /v3/jobs/imports/{jobId}/stream\` - SSE progress (uses shared SSE from #ISSUE_2)
- \`GET /v3/jobs/imports/{jobId}/results\` - Fetch results
- \`DELETE /v3/jobs/imports/{jobId}\` - Cancel import

## Migration Path
**From:** \`src/handlers/csv-import.ts\` (V2)
**To:** \`src/api-v3/jobs/imports.ts\` (V3)

### Key Changes
1. Replace \`createSuccessResponse\` → RFC 9457 Problem Details
2. Replace \`getProgressDOStub\` → \`getJobStateManagerDO\`
3. Add HATEOAS links to response
4. Return 202 Accepted (not 200 OK)
5. Include auth token in response

### Code Reuse (No Changes Needed)
- \`processCSVCore\` utility
- Gemini API integration
- Durable Object alarm scheduling

## Deliverables
- [ ] Implement \`POST /v3/jobs/imports\` route
- [ ] Add multipart/form-data parsing (8MB limit)
- [ ] Integrate with JobStateManagerDO
- [ ] Generate auth token for SSE streaming
- [ ] Schedule processing via DO alarm
- [ ] Status/results/cancel endpoints
- [ ] Unit + integration tests
- [ ] Test with 8MB CSV files

## Acceptance Criteria
- [ ] Import job creation <200ms P95
- [ ] Handles 8MB CSV files without timeout
- [ ] DO alarm schedules processing correctly
- [ ] Auth tokens expire after 1 hour
- [ ] Integration test covers full workflow

**Effort:** 3-4 days | **Priority:** P0 (iOS blocker)
**Dependencies:** Requires #ISSUE_1 (Job Framework) + #ISSUE_2 (SSE)

📖 **References:**
- [V3 Implementation Guide - CSV Import](https://github.com/jukasdrj/bendv3/blob/main/docs/V3_IMPLEMENTATION_GUIDE.md#csv-import-migration)" \
  --label "v3-api,enhancement,priority: critical"

# Issue 4: Bookshelf Scanning
echo "📋 Creating Issue 4: Bookshelf Scanning..."
gh issue create \
  --title "[V3 Phase 2.4] Bookshelf Scanning (AI Photo Analysis)" \
  --body "## Overview
Migrate bookshelf scanning workflow to V3 API with job-based async processing.

## Endpoints
- \`POST /v3/jobs/scans\` - Initiate scan (multipart/form-data, 1-5 photos)
- \`GET /v3/jobs/scans/{jobId}\` - Job status
- \`GET /v3/jobs/scans/{jobId}/stream\` - SSE progress
- \`GET /v3/jobs/scans/{jobId}/results\` - Fetch detected books
- \`DELETE /v3/jobs/scans/{jobId}\` - Cancel scan + cleanup R2

## Migration Path
**From:** \`src/handlers/batch-scan-handler.ts\` (V2)
**To:** \`src/api-v3/jobs/scans.ts\` (V3)

### Key Changes
1. Add job lifecycle management
2. Include SSE stream URL in response
3. Add bounding box validation (clamp to [0, 1])
4. R2 cleanup on cancellation

### Code Reuse (No Changes Needed)
- \`scanImageWithGemini\` (Gemini Vision API)
- \`enrichBooksParallel\` (parallel enrichment)
- \`deleteR2Objects\` (cleanup utility)
- R2 storage logic (BOOKSHELF_IMAGES bucket)

## Deliverables
- [ ] Implement \`POST /v3/jobs/scans\` route
- [ ] Multipart parsing for binary images (10MB per photo, 50MB total)
- [ ] R2 storage integration
- [ ] Gemini Vision API integration
- [ ] Bounding box coordinate clamping [0, 1]
- [ ] Confidence threshold filtering
- [ ] R2 cleanup on job cancellation
- [ ] Test with 5 photos (max batch size)

## Acceptance Criteria
- [ ] Job creation <200ms P95
- [ ] Processes 5 photos in <60s
- [ ] Bounding boxes clamped correctly
- [ ] R2 cleanup on cancel (all photos deleted)
- [ ] Integration test covers full workflow

**Effort:** 4-5 days | **Priority:** P0 (iOS blocker)
**Dependencies:** Requires #ISSUE_1 (Job Framework) + #ISSUE_2 (SSE)

📖 **References:**
- [V3 Implementation Guide - Bookshelf Scan](https://github.com/jukasdrj/bendv3/blob/main/docs/V3_IMPLEMENTATION_GUIDE.md#bookshelf-scan-migration)" \
  --label "v3-api,enhancement,priority: critical"

# Issue 5: Batch Enrichment Async Mode
echo "📋 Creating Issue 5: Batch Enrichment Async Mode..."
gh issue create \
  --title "[V3 Phase 2.5] Batch Enrichment Async Mode" \
  --body "## Overview
Extend existing \`POST /v3/books/enrich\` endpoint to support async job mode for large batches (iOS requirement: up to 500 books).

## Implementation Strategy
Add \`async\` boolean flag to existing endpoint:
- \`async=false\` (default) - Sync behavior (existing clients unaffected)
- \`async=true\` - Create background job, return job object

## Request Format
\`\`\`json
{
  \"isbns\": [\"978...\", \"...\"],
  \"includeEmbedding\": true,
  \"async\": true  // NEW: trigger background job
}
\`\`\`

## Response Format (when async=true)
\`\`\`json
{
  \"success\": true,
  \"data\": {
    \"jobId\": \"uuid\",
    \"status\": \"queued\",
    \"streamUrl\": \"/v3/jobs/enrichment/{jobId}/stream\"
  },
  \"_links\": {
    \"self\": { \"href\": \"/v3/jobs/enrichment/{jobId}\" },
    \"stream\": { \"href\": \"/v3/jobs/enrichment/{jobId}/stream\" }
  }
}
\`\`\`

## Migration Path
**From:** \`src/handlers/batch-enrichment.ts\` (V2)
**To:** Extend \`src/api-v3/index.ts\` enrichment route

### Code Reuse
- Parallel enrichment logic from \`enrichBooksParallel\`
- Embedding generation from \`generateBookEmbedding\`
- iOS compatibility (accept both \`barcodes\` and \`books\` formats)

## Deliverables
- [ ] Add \`async\` flag to EnrichRequestSchema
- [ ] Fork logic: sync vs. async based on flag
- [ ] Create job endpoints (\`/v3/jobs/enrichment/{jobId}\`)
- [ ] Background processing with progress updates
- [ ] Support both \`barcodes\` and \`books\` formats (iOS compat)
- [ ] Unit tests for both modes
- [ ] Integration test with 500 ISBNs

## Acceptance Criteria
- [ ] Backward compatible (existing sync clients work unchanged)
- [ ] Async mode creates job in <200ms
- [ ] Handles 500 ISBNs without timeout
- [ ] Both request formats accepted (barcodes/books)
- [ ] Progress updates via SSE

**Effort:** 3-4 days | **Priority:** P1 (iOS nice-to-have)
**Dependencies:** Requires #ISSUE_1 (Job Framework) + #ISSUE_2 (SSE)

📖 **References:**
- [V3 Implementation Guide - Batch Enrichment](https://github.com/jukasdrj/bendv3/blob/main/docs/V3_IMPLEMENTATION_GUIDE.md#batch-enrichment-migration)" \
  --label "v3-api,enhancement,priority: high"

# Issue 6: V2 Deprecation Notice
echo "📋 Creating Issue 6: V2 Deprecation Notice..."
gh issue create \
  --title "[V3 Phase 3] Add V2 API Deprecation Headers" \
  --body "## Overview
Add RFC 8594 deprecation headers to all V2 endpoints to notify clients of upcoming sunset (90 days after V3 feature parity).

## Prerequisites
✅ All V3 async workflows production-tested
✅ iOS app updated to V3-only
✅ Web app updated to V3-only
✅ 90-day deprecation notice sent to API consumers

## Implementation

### Deprecation Middleware
Add to \`src/router.ts\`:
\`\`\`typescript
app.use(\"/api/v2/*\", async (c, next) => {
  await next()
  const baseUrl = new URL(c.req.url).origin
  c.header(\"Deprecation\", \"true\")
  c.header(\"Sunset\", \"Sat, 07 Mar 2026 00:00:00 GMT\") // 90 days from start
  c.header(\"Link\", \`<\${baseUrl}/v3>; rel=\"successor-version\"\`)
  c.header(\"X-Deprecation-Notice\", \"V2 API deprecated. Migrate to V3. Sunset: March 7, 2026\")
})
\`\`\`

### Communication Plan
1. **Email to API consumers** (from api-support@oooefam.net)
2. **Update API documentation** home page
3. **Add banner to Swagger UI** (\`/v3/docs\`)
4. **GitHub issue** for public discussion
5. **Analytics dashboard** to track V2 usage decline

## Deliverables
- [ ] Add deprecation middleware to V2 routes
- [ ] Deploy to production
- [ ] Send deprecation email to known API consumers
- [ ] Update API documentation (homepage, Swagger UI)
- [ ] Create public GitHub issue for migration discussion
- [ ] Set up V2 usage analytics dashboard
- [ ] Document rollback procedure (if needed)

## Acceptance Criteria
- [ ] All V2 endpoints return deprecation headers
- [ ] Email sent to all known API consumers
- [ ] Documentation updated with migration guide links
- [ ] Analytics tracking V2 usage over time
- [ ] Rollback tested (can re-enable V2 in <5 minutes)

**Effort:** 1-2 days | **Priority:** P1 (after V3 feature parity)
**Dependencies:** Requires #ISSUE_3 (CSV Import) + #ISSUE_4 (Bookshelf Scan)

📖 **References:**
- [Deprecation Plan - Phase 3](https://github.com/jukasdrj/bendv3/blob/main/docs/V1_V2_DEPRECATION_PLAN.md#phase-3-v2-deprecation-week-5-6)" \
  --label "deprecation,enhancement,priority: high"

# Issue 7: Code Cleanup - Remove V1 API
echo "📋 Creating Issue 7: Code Cleanup - Remove V1 API..."
gh issue create \
  --title "[V3 Phase 4] Code Cleanup - Remove V1 API" \
  --body "## Overview
Remove all V1 API code after sunset date (March 1, 2026).

## Prerequisites
- V1 sunset date passed (March 1, 2026)
- V1 traffic dropped to 0% for 7+ days
- No client support requests for V1

## Cleanup Tasks

### Delete Code
- [ ] Remove all \`/v1/*\` routes from \`src/router.ts\`
- [ ] Delete \`src/handlers/v1/\` directory
- [ ] Remove V1 deprecation middleware
- [ ] Clean up V1-specific types/DTOs

### Archive Documentation
- [ ] Move V1 spec to \`docs/archive/v1-openapi-2026-03.yaml\`
- [ ] Update \`CLAUDE.md\` (remove V1 references)
- [ ] Update \`README.md\` (remove V1 endpoints)

### Update Tests
- [ ] Delete V1-specific tests
- [ ] Remove V1 test fixtures
- [ ] Update integration tests

### Database Cleanup
- [ ] Archive V1 analytics data (>90 days)
- [ ] Drop V1 job records from DOs (if any)

## Acceptance Criteria
- [ ] Zero V1 route references in codebase
- [ ] All tests pass without V1 code
- [ ] Documentation updated (no V1 mentions)
- [ ] Bundle size reduced (measure before/after)

**Effort:** 1-2 days | **Priority:** P2 (after V1 sunset)

📖 **References:**
- [Deprecation Plan - Phase 4](https://github.com/jukasdrj/bendv3/blob/main/docs/V1_V2_DEPRECATION_PLAN.md#phase-4-code-cleanup-week-7-8)" \
  --label "deprecation,enhancement,priority: medium"

# Issue 8: Code Cleanup - Remove V2 API
echo "📋 Creating Issue 8: Code Cleanup - Remove V2 API..."
gh issue create \
  --title "[V3 Phase 4] Code Cleanup - Remove V2 API" \
  --body "## Overview
Remove all V2 API code after sunset date (March 7, 2026 + grace period).

## Prerequisites
- V2 sunset date passed (March 7, 2026)
- V2 traffic dropped to 0% for 14+ days
- No client support requests for V2

## Cleanup Tasks

### Delete Code
- [ ] Remove all \`/api/v2/*\` routes from \`src/router.ts\`
- [ ] Delete \`src/handlers/v2/\` directory
- [ ] Remove V2 deprecation middleware
- [ ] Delete legacy handlers:
  - \`src/handlers/csv-import.ts\` (V2 version)
  - \`src/handlers/batch-scan-handler.ts\` (V2 version)
  - \`src/handlers/batch-enrichment.ts\` (V2 version)
  - \`src/handlers/v2/sse-stream.ts\` (moved to V3)

### Archive Documentation
- [ ] Move \`docs/openapi.yaml\` to \`docs/archive/v2-openapi-2026-03.yaml\`
- [ ] Update \`CLAUDE.md\` (remove V2 references)
- [ ] Update \`README.md\` (V3-only endpoints)

### Update Tests
- [ ] Delete V2-specific tests
- [ ] Remove V2 test fixtures
- [ ] Update integration tests for V3-only

## Acceptance Criteria
- [ ] Zero V2 route references in codebase
- [ ] All tests pass without V2 code
- [ ] Documentation updated (V3-only)
- [ ] Bundle size reduced (target: -15-20%)

**Effort:** 2 days | **Priority:** P2 (after V2 sunset)
**Dependencies:** Requires #ISSUE_7 (V1 cleanup complete)

📖 **References:**
- [Deprecation Plan - Phase 4.2](https://github.com/jukasdrj/bendv3/blob/main/docs/V1_V2_DEPRECATION_PLAN.md#42-remove-v2-api-day-2)" \
  --label "deprecation,enhancement,priority: medium"

# Issue 9: V3 Optimizations
echo "📋 Creating Issue 9: V3-Only Optimizations..."
gh issue create \
  --title "[V3 Phase 4] V3-Only Optimizations" \
  --body "## Overview
Optimize codebase for V3-only after V1/V2 removal. Target: 15-20% bundle reduction, 30% faster tests.

## Optimization Opportunities

### 1. Remove Response Format Conversions
- [ ] Delete \`createSuccessResponse\` (ResponseEnvelope v1/v2)
- [ ] Use RFC 9457 Problem Details natively everywhere
- [ ] Remove backward compatibility error mapping

### 2. Simplify Middleware Stack
- [ ] Remove V1/V2 contract validation middleware
- [ ] Single error handler (no version-specific logic)
- [ ] Consolidate CORS middleware (no version forking)

### 3. Consolidate Cache Keys
- [ ] V3-only cache format (no backward compat)
- [ ] Shorter cache keys (remove version prefix)
- [ ] Update cache TTLs (longer for stable data)

### 4. Reduce Bundle Size
- [ ] Delete unused Zod schemas (V1/V2 DTOs)
- [ ] Tree-shake legacy providers
- [ ] Remove feature flags (\`ENABLE_REFACTORED_DOS\`, etc.)

### 5. Database Cleanup
- [ ] Drop V1/V2 job records from JobStateManagerDO
- [ ] Archive old analytics data (>90 days)
- [ ] Compress KV namespaces

### 6. Simplify Durable Objects
- [ ] Delete \`ProgressWebSocketDO\` (legacy monolithic DO)
- [ ] Remove \`getProgressDOStub\` helper
- [ ] Clean up feature flag checks

### 7. Aggressive Caching
- [ ] Book metadata: 24h → 7d (with ETag)
- [ ] Search results: 1h → 6h
- [ ] Cover images: 7d → 30d
- [ ] Job results: 1h → 24h

## Deliverables
- [ ] Remove all V1/V2 response format code
- [ ] Simplify middleware (measure latency improvement)
- [ ] Update cache strategy (target: 85% hit ratio)
- [ ] Delete unused code (bundle size analysis)
- [ ] Update DO architecture (remove legacy)
- [ ] Performance benchmarks (before/after)

## Acceptance Criteria
- [ ] Bundle size reduced by 15-20%
- [ ] Test suite runtime reduced by 30%
- [ ] Cache hit ratio improved to 85%+
- [ ] Code coverage maintained at 75%+
- [ ] Zero V1/V2 references in codebase
- [ ] All performance tests pass

**Effort:** 3-4 days | **Priority:** P2 (optimization)
**Dependencies:** Requires #ISSUE_7 + #ISSUE_8 (all cleanup complete)

📖 **References:**
- [Deprecation Plan - V3 Optimizations](https://github.com/jukasdrj/bendv3/blob/main/docs/V1_V2_DEPRECATION_PLAN.md#v3-only-optimization-opportunities)" \
  --label "v3-api,enhancement,priority: medium"

# Issue 10: Epic Tracking
echo "📋 Creating Issue 10: Epic Tracking..."
gh issue create \
  --title "[EPIC] V1/V2 API Deprecation & V3 Migration" \
  --body "## Overview
Track the complete V1/V2 API deprecation and V3 migration project.

## Timeline
**Total Duration:** 8 weeks
**Target Completion:** February 2026
**V2 Sunset Date:** March 7, 2026 (90 days after Phase 3 start)

## Phases

### Phase 1: Foundation ✅ COMPLETE
- [x] V3 router with @hono/zod-openapi
- [x] Book search endpoint
- [x] ISBN lookup endpoint
- [x] Batch enrichment (sync mode)
- [x] RFC 9457 error handling

### Phase 2: Async Workflows (Weeks 3-6)
**Goal:** Enable frontend to drop V2 dependencies

- [ ] #ISSUE_1 - Job Framework Foundation (Days 1-3)
- [ ] #ISSUE_2 - SSE Streaming Implementation (Days 4-5)
- [ ] #ISSUE_3 - CSV Import Workflow (Days 6-8)
- [ ] #ISSUE_4 - Bookshelf Scanning (Days 9-11)
- [ ] #ISSUE_5 - Batch Enrichment Async Mode (Days 12-14)

### Phase 3: V2 Deprecation (Weeks 7-8)
**Goal:** Notify clients and monitor migration

- [ ] #ISSUE_6 - Add V2 Deprecation Headers
- [ ] Send 90-day notice to API consumers
- [ ] Monitor V2 usage decline
- [ ] Support frontend teams during migration

### Phase 4: Code Cleanup (After Sunset Dates)
**Goal:** Remove legacy code and optimize

- [ ] #ISSUE_7 - Remove V1 API (after March 1, 2026)
- [ ] #ISSUE_8 - Remove V2 API (after March 7, 2026)
- [ ] #ISSUE_9 - V3-Only Optimizations

## Success Metrics

### Phase 2 Completion
- [ ] All V3 job endpoints <500ms P95
- [ ] SSE reconnection success rate >95%
- [ ] CSV import handles 8MB files
- [ ] Bookshelf scan processes 5 photos in <60s
- [ ] Zero frontend blockers

### V2 Deprecation
- [ ] V2 traffic <10% within 30 days
- [ ] V1 traffic 0% by March 1, 2026
- [ ] Zero critical bugs
- [ ] Frontend satisfaction >8/10

### Code Cleanup
- [ ] Bundle size -15-20%
- [ ] Test runtime -30%
- [ ] Coverage maintained 75%+
- [ ] Zero V1/V2 references

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| iOS app breaks on V2 shutdown | Low | High | Require app update before V2 sunset |
| Performance regression | Medium | Medium | Load test V3 before V2 shutdown |
| Frontend teams miss deadline | Medium | High | Weekly sync meetings, shared tracker |
| Undiscovered V2 dependencies | Low | Medium | Audit analytics, canary deployment |

## Documentation
- [V3 Quick Reference](https://github.com/jukasdrj/bendv3/blob/main/docs/V3_QUICK_REFERENCE.md)
- [Deprecation Plan](https://github.com/jukasdrj/bendv3/blob/main/docs/V1_V2_DEPRECATION_PLAN.md)
- [Implementation Guide](https://github.com/jukasdrj/bendv3/blob/main/docs/V3_IMPLEMENTATION_GUIDE.md)

## Related Issues
Track progress in individual issues linked above." \
  --label "epic,v3-api,deprecation"

echo "✅ All GitHub issues created successfully!"
echo ""
echo "📊 Summary:"
echo "  - 1 Epic tracking issue"
echo "  - 5 Phase 2 issues (async workflows)"
echo "  - 1 Phase 3 issue (deprecation notice)"
echo "  - 3 Phase 4 issues (cleanup + optimization)"
echo ""
echo "🔗 View all issues: gh issue list --label v3-api"
