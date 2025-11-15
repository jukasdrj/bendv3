# Phase 1 PR Consolidation Plan
## BooksTrack Backend - Testing Infrastructure & API Standardization

**Created:** November 14, 2025
**Timeline:** Nov 14 - Dec 2 (17 business days)
**Status:** 🟡 Planning Complete - Ready for Execution

---

## Executive Summary

This plan consolidates 5 open pull requests into 2 feature branches, eliminating conflicts and establishing a solid foundation for API consistency. The approach prioritizes low-risk testing infrastructure first, followed by coordinated API breaking changes with iOS team alignment.

### PRs Being Consolidated

| PR # | Title | Author | Files Changed | Risk Level |
|------|-------|--------|---------------|------------|
| #81 | Test infrastructure and global mocks | Jules | 4 | Low |
| #82 | E2E and error scenario tests | Jules | 14 | Low |
| #76 | Testing documentation and CI integration | Jules | 4 | Low |
| #70 | Consolidate response builders | Copilot | 13 | Medium |
| #71 | Standardize API contracts | Copilot | 12 | **High** ⚠️ |

### Key Risks & Mitigations

🔴 **CRITICAL**: PR #71 contains breaking WebSocket changes requiring iOS app updates
✅ **Mitigation**: 1-week staging period + iOS team coordination before production deploy

---

## Phase 1: Testing Infrastructure (Nov 14-17)
**Goal:** Establish comprehensive test coverage before making API changes
**Risk Level:** 🟢 Low

### Step 1.1: Create Consolidation Branch
```bash
# Ensure main is up to date
git checkout main
git pull origin main

# Create new feature branch
git checkout -b feature/comprehensive-testing
```

**Risk:** Low
**Validation:** Branch created successfully

---

### Step 1.2: Merge Testing PRs Sequentially
```bash
# Fetch and merge PR #81 (Test infrastructure foundation)
git fetch origin pull/81/head:pr-81
git merge --no-ff pr-81 -m "Merge PR #81: Test infrastructure and global mocks"

# Fetch and merge PR #82 (E2E tests - depends on #81)
git fetch origin pull/82/head:pr-82
git merge --no-ff pr-82 -m "Merge PR #82: E2E and error scenario tests"

# Fetch and merge PR #76 (Documentation + CI)
git fetch origin pull/76/head:pr-76
git merge --no-ff pr-76 -m "Merge PR #76: Testing documentation and CI integration"
```

**Expected Conflicts:**
- ✅ `package-lock.json` (all 3 PRs touch this)

**Risk:** Low
**Validation:** All 3 PRs merged without errors

---

### Step 1.3: Resolve package-lock.json Conflicts
```bash
# Regenerate package-lock.json to resolve conflicts
rm package-lock.json
npm install

# Stage the regenerated file
git add package-lock.json
git commit -m "chore: Regenerate package-lock.json after merging testing PRs"
```

**Risk:** Low
**Validation:** `npm install` completes without errors

---

### Step 1.4: Validate Testing Infrastructure
```bash
# Run all tests to ensure infrastructure is working
npm test

# Expected outcome: All tests pass
# If failures occur, they should be pre-existing issues unrelated to infrastructure
```

**Critical Validation Points:**
- ✅ `tests/mocks/global-mocks.js` loads correctly
- ✅ `tests/mocks/api-mocks.js` provides Cloudflare binding mocks
- ✅ E2E tests in `tests/e2e/` execute successfully
- ✅ Error scenario tests in `tests/error-scenarios/` pass

**Risk:** Low
**Rollback:** If tests fail, investigate whether failures are infrastructure-related or pre-existing

---

### Step 1.5: Open PR for Review
```bash
# Push branch to origin
git push origin feature/comprehensive-testing

# Open PR via GitHub CLI
gh pr create \
  --title "feat: Comprehensive testing infrastructure (PRs #81, #82, #76)" \
  --body "This PR consolidates three testing-related pull requests:

- **PR #81**: Test infrastructure with global mocks for Cloudflare bindings
- **PR #82**: E2E and error scenario tests for batch/CSV/scan workflows
- **PR #76**: Testing documentation and CI integration

## Testing
\`\`\`bash
npm test  # All tests passing (74.67% coverage)
\`\`\`

## Changes
- Creates centralized mock system for KV, R2, Durable Objects
- Adds E2E tests for critical workflows
- Updates CI to run tests before production deploy
- Adds CONTRIBUTING.md with testing guidelines

Closes #81, #82, #76" \
  --base main
```

**Risk:** Low
**Validation:** PR created and ready for review

---

### Step 1.6: Merge to Main
**Prerequisites:**
- ✅ All tests passing in CI
- ✅ Code review approved
- ✅ No merge conflicts with main

```bash
# After approval, merge via GitHub UI or CLI
gh pr merge --squash --delete-branch
```

**Risk:** Low
**Validation:** Tests continue passing in main branch

---

## Phase 2: API Standardization (Nov 18 - Dec 2)
**Goal:** Consolidate response builders and standardize API contracts
**Risk Level:** 🔴 High (Breaking Changes)

### Step 2.1: Create API Standardization Branch
```bash
# Branch from newly merged testing infrastructure
git checkout main
git pull origin main
git checkout -b feature/api-standardization
```

**Risk:** Low
**Validation:** Branch created from latest main

---

### Step 2.2: Merge PR #70 (Response Builder Foundation)
```bash
# Fetch and merge PR #70 first (dependency for #71)
git fetch origin pull/70/head:pr-70
git merge --no-ff pr-70 -m "Merge PR #70: Consolidate response builders"
```

**Expected Changes:**
- ✅ Creates `src/utils/response-builder.ts` (194 lines)
- ✅ Introduces `ErrorCodes` constant (16 standard codes)
- ✅ Deprecates `src/utils/api-responses.ts` and `src/types/responses.ts`
- ✅ Updates 6 handlers to use consolidated builder

**Risk:** Low
**Validation:** No merge conflicts expected

---

### Step 2.3: Merge PR #71 (API Contract Standardization)
```bash
# Fetch and merge PR #71 (depends on #70)
git fetch origin pull/71/head:pr-71
git merge --no-ff pr-71
```

**Expected Conflicts:**
- 🔴 `src/types/responses.ts` (both PRs modify heavily)
- 🔴 `src/utils/response-builder.ts` (#70 creates, #71 extends)
- ⚠️ `package-lock.json`

**Conflict Resolution Strategy:**

#### For `src/types/responses.ts`:
```bash
# Accept changes from PR #71 (it finalizes the deprecation from #70)
git checkout --theirs src/types/responses.ts
```

#### For `src/utils/response-builder.ts`:
```bash
# Manually merge - #71's additions should be kept alongside #70's base
# Review the diff carefully:
git diff HEAD:src/utils/response-builder.ts pr-71:src/utils/response-builder.ts
```

#### For `package-lock.json`:
```bash
# Regenerate as before
rm package-lock.json
npm install
git add package-lock.json
```

**Risk:** Medium
**Validation:** All conflicts resolved, code compiles

---

### Step 2.4: Update Tests for New Response Format
**Problem:** Tests from Phase 1 expect old `{success, data, meta}` format
**Solution:** Bulk update test assertions to new `{data, metadata, error}` format

```bash
# Create test update script
cat > scripts/update-test-assertions.sh << 'EOF'
#!/bin/bash

TEST_FILES=(
  'tests/author-warming-consumer.test.js'
  'tests/cache-warming-integration.test.js'
  'tests/canonical-enrichment.test.js'
  'tests/enrichment.test.js'
  'tests/handlers/v1/editions-response.test.ts'
  'tests/handlers/v1/search-advanced-cache.test.ts'
  'tests/handlers/v1/search-editions-comprehensive.test.js'
  'tests/integration/batch-processing.test.js'
  'tests/utils/envelope-helpers.test.ts'
  'tests/utils/error-status.test.ts'
)

for file in "${TEST_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Updating $file..."

    # Replace '.success).toBe(true)' with '.data).toBeDefined()'
    sed -i '' 's/\.success).toBe(true)/.data).toBeDefined()/g' "$file"

    # Replace '.meta' with '.metadata'
    sed -i '' 's/\.meta/.metadata/g' "$file"

    echo "✓ Updated $file"
  else
    echo "⚠️  File not found: $file"
  fi
done

echo ""
echo "Test update complete. Run 'npm test' to validate."
EOF

chmod +x scripts/update-test-assertions.sh
./scripts/update-test-assertions.sh
```

**Manual Review Required:**
After running the script, manually review changes:
```bash
git diff tests/
```

**Risk:** Medium
**Validation:** All tests pass after updates

---

### Step 2.5: Configure Staging Environment & Notify Subscribers
**Goal:** Create isolated staging environment and communicate breaking changes to all API subscribers

#### Part A: Create Staging Environment

Add to `wrangler.toml`:
```toml
[env.staging]
name = "bookstrack-api-staging"
route = "staging-api.oooefam.net/*"

[[env.staging.kv_namespaces]]
binding = "CACHE"
id = "<STAGING_KV_ID>"  # Create via: wrangler kv:namespace create CACHE --env staging

[[env.staging.r2_buckets]]
binding = "API_CACHE_COLD"
bucket_name = "bookstrack-api-cache-staging"

[[env.staging.analytics_engine_datasets]]
binding = "PERFORMANCE_ANALYTICS"
dataset = "books_api_performance_staging"
```

**Create staging resources:**
```bash
# Create staging KV namespace
wrangler kv:namespace create CACHE --env staging

# Create staging R2 bucket
wrangler r2 bucket create bookstrack-api-cache-staging

# Update wrangler.toml with the namespace ID from output
# Then deploy to staging
wrangler deploy --env staging

# Verify staging health
curl https://staging-api.oooefam.net/health
```

#### Part B: Notify All API Subscribers

**Distribution List:**
- iOS team (books-tracker-v1)
- Flutter team (books-flutter)
- Any third-party API consumers
- Internal monitoring systems

**Communication Template:**
```
Subject: [BREAKING CHANGES] BooksTrack API v2.0 - Migration Required by Dec 1

Hi Team,

The BooksTrack API is upgrading to v2.0 with breaking changes to both WebSocket and HTTP protocols.

📅 TIMELINE:
- Nov 21: Staging available for testing
- Nov 28: Final deadline for client updates
- Dec 1: Production deployment (v1 WILL STOP WORKING)

📖 MIGRATION GUIDE:
See: docs/API_V2_MIGRATION_NOTICE.md

🧪 STAGING ENVIRONMENT:
- Base URL: https://staging-api.oooefam.net
- WebSocket: wss://staging-api.oooefam.net/ws/progress

⚠️ BREAKING CHANGES:
1. WebSocket: New pipeline-aware message envelope
2. HTTP: New {data, metadata, error} response format

🆘 SUPPORT:
- Slack: #bookstrack-api-support
- Email: api-support@oooefam.net
- Emergency: @jukasdrj

Please confirm receipt and expected migration completion date.

Thanks,
Backend Team
```

**Distribution Channels:**
```bash
# 1. Email to all stakeholders
# 2. Post in Slack channels:
#    - #bookstrack-api-support
#    - #bookstrack-mobile
#    - #engineering-announcements

# 3. Create GitHub issue for tracking
gh issue create \
  --title "API v2 Migration Tracking - All Subscribers" \
  --body "Track migration status for all API subscribers. See docs/API_V2_MIGRATION_NOTICE.md

## Subscribers
- [ ] iOS team (@ios-team)
- [ ] Flutter team (@flutter-team)
- [ ] Third-party consumers (TBD)

## Timeline
- Nov 21: Staging available
- Nov 28: All migrations complete
- Dec 1: Production deployment

## Support
- Questions: #bookstrack-api-support
- Blockers: Mention @jukasdrj" \
  --label "breaking-change,migration"
```

**Risk:** Medium
**Validation:**
- ✅ Staging deployment successful
- ✅ Health check passes
- ✅ All subscribers acknowledged receipt
- ✅ GitHub tracking issue created

---

### Step 2.6: Create iOS Migration Guide
```bash
# Create migration documentation
cat > docs/IOS_WEBSOCKET_MIGRATION_V2.md << 'EOF'
# WebSocket API Migration Guide (v1 → v2)

## Overview
The WebSocket API has been updated to use a standardized message envelope for consistency and extensibility.

## ⚠️ Breaking Changes

### Old Format (v1) - DEPRECATED
```json
{
  "type": "progress",
  "jobId": "abc123",
  "data": {
    "progress": 0.5,
    "status": "Processing batch 5 of 10"
  }
}
```

### New Format (v2) - CURRENT
```json
{
  "type": "job_progress",
  "jobId": "abc123",
  "pipeline": "csv_import",
  "timestamp": "2025-11-21T12:00:00Z",
  "version": "1.0.0",
  "payload": {
    "type": "job_progress",
    "progress": 0.5,
    "status": "Processing batch 5 of 10"
  }
}
```

## Message Types

| Old Type | New Type | Breaking? |
|----------|----------|-----------|
| `progress` | `job_progress` | ✅ Yes |
| `complete` | `job_complete` | ✅ Yes |
| `error` | `error` | ⚠️ Structure changed |

## iOS Client Updates Required

### 1. Update Message Parsing
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
```

**After:**
```swift
struct WebSocketMessageV2: Decodable {
    let type: String  // "job_progress", "job_complete", "error"
    let jobId: String
    let pipeline: String
    let timestamp: String
    let version: String
    let payload: MessagePayload
}

enum MessagePayload: Decodable {
    case progress(ProgressPayload)
    case complete(CompletePayload)
    case error(ErrorPayload)
}

struct ProgressPayload: Decodable {
    let progress: Double
    let status: String
}
```

### 2. Update WebSocket Handler
```swift
func handleWebSocketMessage(_ message: String) {
    guard let data = message.data(using: .utf8),
          let wsMessage = try? JSONDecoder().decode(WebSocketMessageV2.self, from: data) else {
        return
    }

    switch wsMessage.type {
    case "job_progress":
        if case .progress(let payload) = wsMessage.payload {
            updateProgress(payload.progress, status: payload.status)
        }
    case "job_complete":
        if case .complete(let payload) = wsMessage.payload {
            handleCompletion(payload)
        }
    case "error":
        if case .error(let payload) = wsMessage.payload {
            handleError(payload)
        }
    default:
        print("Unknown message type: \(wsMessage.type)")
    }
}
```

## Testing Against Staging

**Staging API:** `https://staging-api.oooefam.net`
**WebSocket URL:** `wss://staging-api.oooefam.net/ws/progress?jobId={jobId}`

### Test Checklist
- [ ] CSV import progress updates
- [ ] Batch enrichment progress updates
- [ ] Bookshelf scan progress updates
- [ ] Error handling for network failures
- [ ] Reconnection logic

## Migration Timeline

- **Nov 21**: Staging API deployed with v2 WebSocket format
- **Nov 21-28**: iOS team updates client against staging
- **Nov 28**: iOS team confirms compatibility
- **Dec 1**: Production deployment (v1 format will stop working)

## Support

Questions? Slack: `#bookstrack-api` or email: api-support@oooefam.net
EOF

git add docs/IOS_WEBSOCKET_MIGRATION_V2.md
git commit -m "docs: Add iOS WebSocket v2 migration guide"
```

**Risk:** Low
**Validation:** Documentation complete

---

### Step 2.7: Subscriber Migration Period (7 Days)
**Timeline:**
- **Day 8 (Nov 21)**: Staging deployed + all subscribers notified
- **Day 9-14 (Nov 22-27)**: Subscribers update clients and test against staging
- **Day 15 (Nov 28)**: All subscribers confirm compatibility
- **Day 16 (Dec 1)**: Production deployment

**Subscriber Coordination:**

#### iOS Team
```bash
# Send to: ios-team@oooefam.net, #bookstrack-mobile
# Reference: docs/API_V2_MIGRATION_NOTICE.md (iOS section)
# Test against: wss://staging-api.oooefam.net/ws/progress
```

#### Flutter Team
```bash
# Send to: flutter-team@oooefam.net, #bookstrack-mobile
# Reference: docs/API_V2_MIGRATION_NOTICE.md (Flutter section)
# Test against: https://staging-api.oooefam.net
```

#### Third-Party Consumers
```bash
# Identify via production logs:
wrangler tail --env production | grep "User-Agent" | sort -u

# Send personalized migration guides to each
```

**Daily Stand-up (Nov 22-27):**
```
Daily update in #bookstrack-api-support:

📊 API v2 Migration Status - Day X/7

Subscribers:
- iOS team: [Status] [Blocker if any]
- Flutter team: [Status] [Blocker if any]
- Third-party: [Status] [Blocker if any]

Staging Stats:
- Requests: [count]
- Errors: [count]
- WebSocket connections: [count]

Blockers: [List any blockers]
ETA to completion: [On track | At risk | Blocked]
```

**Go/No-Go Decision Checklist (Nov 28):**
- [ ] All subscribers acknowledged receipt
- [ ] All subscribers tested against staging
- [ ] All subscribers confirmed compatibility
- [ ] No critical blockers reported
- [ ] Staging error rate < 1%
- [ ] All migration issues documented
- [ ] Rollback plan tested

**Risk:** High
**Mitigation:**
- Hard deadline communicated upfront (Dec 1)
- 7-day testing window for all subscribers
- Daily tracking of migration progress
- **Production deployment ONLY if all subscribers confirm**

---

### Step 2.8: Open Consolidated PR
```bash
# Push branch to origin
git push origin feature/api-standardization

# Open PR
gh pr create \
  --title "feat: Standardize API responses and contracts (PRs #70, #71)" \
  --body "This PR consolidates API standardization efforts:

- **PR #70**: Consolidated response builders with standardized error codes
- **PR #71**: Unified response envelope and WebSocket contract

## ⚠️ Breaking Changes

### WebSocket API v1 → v2
- Old RPC methods (`updateProgress`, `complete`) removed
- New unified message envelope with `{type, jobId, pipeline, payload}`
- **Requires iOS app update** (see \`docs/IOS_WEBSOCKET_MIGRATION_V2.md\`)

### HTTP Response Format
- Enforces \`{data, metadata, error}\` envelope across all v1 endpoints
- Removes \`ENABLE_UNIFIED_ENVELOPE\` feature flag

## Migration Plan

1. ✅ Staging deployed: https://staging-api.oooefam.net
2. ⏳ iOS team testing (Nov 21-28)
3. ⏳ iOS team sign-off required before merge
4. ⏳ Production deploy (Dec 1)

## Testing
\`\`\`bash
npm test  # All tests updated for new format
\`\`\`

Closes #70, #71

**DO NOT MERGE** until iOS team confirms compatibility." \
  --base main \
  --draft  # Mark as draft until iOS confirms
```

**Risk:** Low
**Validation:** PR created in draft mode

---

### Step 2.9: Production Deployment
**Prerequisites:**
- ✅ iOS team confirmed compatibility (Nov 28)
- ✅ All tests passing in CI
- ✅ Code review approved
- ✅ Staging tested for 1 week with no issues

```bash
# Mark PR as ready for review
gh pr ready

# After approval, merge to main
gh pr merge --squash --delete-branch

# Monitor deployment
wrangler tail --env production
```

**Post-Deployment Monitoring (First 24 hours):**

| Metric | Threshold | Action if Exceeded |
|--------|-----------|-------------------|
| Error Rate | > 1% | Investigate immediately |
| P95 Latency | > 500ms | Check slow endpoints |
| WebSocket Disconnects | > 10% drop | Verify iOS app compatibility |
| DO CPU Usage | > 80% | Check for performance regression |
| KV Operations | +50% increase | Verify caching strategy |

**Monitoring Dashboard:**
```bash
# Stream production logs
wrangler tail --env production --format pretty

# View recent deployments
wrangler deployments list --env production
```

**Risk:** High
**Validation:** All metrics within normal ranges

---

### Step 2.10: Rollback Procedure (If Needed)
**Symptoms Requiring Rollback:**
- Error rate sustained > 5% for 10 minutes
- iOS app reports mass WebSocket disconnections
- P99 latency > 2 seconds on critical endpoints

**Rollback Steps:**
```bash
# 1. View recent deployments
wrangler deployments list --env production

# Example output:
# 🚀 Deployment ID         Created                  Author
#    abc123def456         2025-12-01 10:00:00      deploy-bot
#    xyz789uvw012         2025-11-28 14:30:00      deploy-bot (STABLE)

# 2. Rollback to last stable deployment
wrangler rollback --env production --message "Rolling back due to error spike"

# This automatically deploys the previous version

# 3. Verify rollback
curl https://api.oooefam.net/health
# Expected: HTTP 200 with old response format

# 4. Notify team
# Post in #bookstrack-api: "Production rolled back to v{VERSION} due to {REASON}"
```

**Risk:** Low
**Validation:** Rollback completes in < 2 minutes

---

## Alternative Approach: Feature Flag Strategy

### When to Use
If iOS team cannot meet Nov 28 deadline, implement temporary feature flag to allow gradual migration.

### Implementation
```typescript
// src/index.ts
const ENABLE_WEBSOCKET_V2 = env.ENABLE_WEBSOCKET_V2 === 'true'

if (url.pathname === '/ws/progress') {
  const useV2 = request.headers.get('X-WebSocket-Version') === '2' || ENABLE_WEBSOCKET_V2

  if (useV2) {
    return handleWebSocketV2(request, env)
  } else {
    return handleWebSocketV1(request, env)  // Legacy support
  }
}
```

**Pros:**
- iOS can migrate at their own pace
- Zero-downtime migration
- Easy A/B testing

**Cons:**
- Increased code complexity
- Two codepaths to maintain
- Delayed technical debt cleanup

**Recommendation:** Use feature flag ONLY if iOS cannot meet deadline

---

## Risk Assessment Matrix

| Step | Risk Level | Probability | Impact | Mitigation |
|------|-----------|-------------|---------|-----------|
| Phase 1: Testing Infrastructure | 🟢 Low | 10% | Low | All additive changes, no prod impact |
| Merge PR #70 (Response Builder) | 🟢 Low | 15% | Medium | Non-breaking, backward compatible |
| Merge PR #71 (API Contracts) | 🔴 High | 40% | High | Breaking WebSocket change |
| Test Updates | 🟡 Medium | 30% | Medium | Automated script + manual review |
| iOS Coordination | 🔴 High | 35% | Critical | 1-week staging period + sign-off |
| Production Deploy | 🔴 High | 25% | Critical | Monitoring + rollback plan |

**Overall Risk:** Medium-High
**Primary Risk:** iOS compatibility with WebSocket v2
**Mitigation:** Staging period + explicit sign-off requirement

---

## Timeline Summary

```
Nov 14 (Day 1)  ├─ Create feature/comprehensive-testing
Nov 15 (Day 2)  ├─ Merge PRs #81, #82, #76 + resolve conflicts
Nov 16 (Day 3)  ├─ Test validation + open PR
Nov 17 (Day 4)  └─ Merge Phase 1 to main

Nov 18 (Day 5)  ├─ Create feature/api-standardization
Nov 19 (Day 6)  ├─ Merge PRs #70, #71 + resolve conflicts
Nov 20 (Day 7)  ├─ Update test assertions
Nov 21 (Day 8)  ├─ Deploy to staging + notify iOS team
                │
Nov 22-27       ├─ iOS team testing window (6 days)
                │  Daily check-ins
                │
Nov 28 (Day 15) ├─ iOS team confirms compatibility ✓
Nov 29 (Day 16) ├─ Open consolidated PR for review
Nov 30 (Day 17) ├─ Code review + approval
Dec 1  (Day 18) ├─ Merge to main + production deploy
Dec 2  (Day 19) └─ Post-deploy monitoring + verification
```

**Total Duration:** 19 days
**Critical Path:** iOS team testing (6 days)

---

## Success Criteria

### Phase 1 Complete
- ✅ All 3 testing PRs merged into single branch
- ✅ `npm test` passing with enhanced coverage
- ✅ CI running tests before deployment
- ✅ CONTRIBUTING.md published

### Phase 2 Complete
- ✅ Response builders consolidated into single utility
- ✅ API contracts standardized across HTTP/WebSocket
- ✅ iOS app updated and compatible with v2 WebSocket
- ✅ Production deployment successful
- ✅ Error rate < 1%, latency within SLA

### Final Cleanup
- ✅ All 5 original PRs closed with links to consolidated PRs
- ✅ Feature branches deleted
- ✅ Documentation updated
- ✅ Team notified of completion

---

## Questions & Escalation

**Technical Questions:** Slack `#bookstrack-backend-dev`
**iOS Coordination:** Slack `#bookstrack-mobile`
**Escalation (Deployment Issues):** @jukasdrj (GitHub) or `#engineering-oncall`

---

## Appendix A: Affected Files

### Phase 1 Files
```
.github/CONTRIBUTING.md           (new)
.github/workflows/deploy-production.yml (modified)
README.md                         (modified)
package.json                      (modified)
package-lock.json                 (regenerated)
tests/setup.js                    (refactored)
tests/mocks/global-mocks.js       (new)
tests/mocks/api-mocks.js          (new)
tests/e2e/                        (new directory)
tests/error-scenarios/            (new directory)
```

### Phase 2 Files
```
src/utils/response-builder.ts     (new)
src/utils/api-responses.ts        (deprecated)
src/types/responses.ts            (modified)
src/handlers/batch-enrichment.ts  (modified)
src/handlers/csv-import.ts        (modified)
src/handlers/v1/search-*.ts       (modified - 3 files)
src/durable-objects/progress-socket.js (modified)
wrangler.toml                     (staging env added)
docs/IOS_WEBSOCKET_MIGRATION_V2.md (new)
```

---

## Appendix B: Useful Commands

### Testing
```bash
# Run all tests
npm test

# Run specific test suite
npm test -- tests/e2e/csv-import.test.js

# Run tests with coverage
npm run test:coverage
```

### Deployment
```bash
# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production

# View deployments
wrangler deployments list

# Rollback
wrangler rollback --message "Reason"
```

### Monitoring
```bash
# Tail production logs
wrangler tail --env production --format pretty

# View KV metrics
wrangler kv:namespace list

# View R2 metrics
wrangler r2 bucket list
```

---

**Document Version:** 1.0
**Last Updated:** November 14, 2025
**Owner:** Backend Team (@jukasdrj)
