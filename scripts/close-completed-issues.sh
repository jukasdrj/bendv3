#!/bin/bash

# Close completed GitHub issues with proper comments
# Run with: ./scripts/close-completed-issues.sh

set -e

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not found. Install with: brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub. Run: gh auth login"
    exit 1
fi

echo "🚀 Closing completed issues from v2.0 production launch..."
echo ""

# Function to close an issue with a comment
close_issue() {
    local issue_number=$1
    local comment=$2
    
    echo "Closing #$issue_number..."
    gh issue close "$issue_number" --comment "$comment" || echo "  ⚠️  Failed to close #$issue_number (may already be closed)"
}

# Phase 4: Production Launch (Deployed)
close_issue 124 "✅ **COMPLETE** - Go/No-Go decision made: **GO FOR PRODUCTION**

**Decision Date:** November 16, 2025
**Deployment:** Completed via #125 (commit bffefe7)
**Evidence:** \`docs/archives/GO_NO_GO_ASSESSMENT.md\`

All criteria met:
- 769 tests passing (100%)
- Monitoring dashboard operational (#93)
- API v2.1 contract finalized
- WebSocket stability verified

**Next:** Production is live at https://api.oooefam.net"

close_issue 125 "✅ **DEPLOYED** - Production deployment successful

**Deployment Date:** November 16, 2025
**Commit:** bffefe7
**Production URL:** https://api.oooefam.net

**Deployed Features:**
- v2.0 canonical API endpoints
- Summary-only WebSocket completions
- Cultural diversity enrichment (Wikidata)
- Deprecation headers on legacy endpoints (#120)

**Status:** All endpoints operational, monitoring active"

close_issue 126 "✅ **COMPLETE** - Post-launch monitoring NOT REQUIRED

**Decision:** No formal 4-hour monitoring window needed
**Rationale:** 
- Monitoring dashboard already operational (#93)
- Real-time logs via \`wrangler tail\`
- Analytics Engine configured
- Team monitoring via Cloudflare dashboard

**Monitoring Docs:**
- \`docs/MONITORING_GUIDE.md\`
- \`docs/deployment/MONITORING_DASHBOARD.md\`"

close_issue 93 "✅ **COMPLETE** - Monitoring dashboard configured and operational

**Completed:** November 15-16, 2025
**Commit:** d615ea3

**Deliverables:**
- ✅ Analytics Engine configured in \`wrangler.toml\`
- ✅ GraphQL queries documented
- ✅ Real-time logs via \`wrangler tail\`
- ✅ Custom \`/logs\` slash command

**Documentation:**
- \`docs/MONITORING_GUIDE.md\` - Operational guide
- \`docs/deployment/MONITORING_DASHBOARD.md\` - Setup guide

**Archived:** \`docs/archives/MONITORING_IMPLEMENTATION_SUMMARY.md\`"

# Post-Launch Enhancements
close_issue 120 "✅ **LIVE** - Deprecation headers deployed to production

**Deployed:** November 16, 2025
**Commit:** 7d61f60

**Implementation:**
RFC 8594 compliant deprecation headers on all legacy endpoints:
- \`Deprecation: true\`
- \`Sunset: Sat, 1 Mar 2026 00:00:00 GMT\`
- \`Warning: 299 - \"This endpoint is deprecated. Use /v1/* instead. Sunset: March 1, 2026\"\`

**Affected Endpoints:**
- \`GET /search/title\` → Use \`/v1/search/title\`
- \`GET /search/isbn\` → Use \`/v1/search/isbn\`
- \`GET /search/author\` → Use \`/v1/search/advanced\`
- \`GET/POST /search/advanced\` → Use \`/v1/search/advanced\`
- \`POST /enrichment/batch\` → Use \`/v1/enrichment/batch\`

**Verified:** \`curl -I https://api.oooefam.net/search/isbn?isbn=9780439708180\`"

close_issue 129 "✅ **COMPLETE** - WebSocket testing documentation updated

**Completed:** November 16, 2025
**Commit:** 7d61f60

**Documentation:**
- \`API_CONTRACT.md §7.5\` - Reconnection support with \`wrangler dev --remote\`
- \`API_CONTRACT.md §7.6\` - Batch scanning flow
- Swift/iOS code examples for reconnection logic

**Key Updates:**
- 60-second grace period for reconnection
- State sync via \`reconnected\` message
- Token-based reconnection flow
- Batch scanning WebSocket integration

**Testing:**
\`\`\`bash
npx wrangler dev --remote
# Connect to ws://localhost:8787/ws/progress?jobId=test
\`\`\`"

close_issue 137 "✅ **LIVE** - Cultural diversity fields deployed to production

**Deployed:** November 16, 2025
**Commit:** 7d61f60

**Implementation:**
Wikidata enrichment for author diversity data:

\`\`\`typescript
{
  // Author DTO fields
  gender?: 'male' | 'female' | 'non_binary' | 'other';
  culturalRegion?: string;  // e.g., \"Sub-Saharan Africa\", \"East Asia\"
  nationality?: string;      // e.g., \"Nigeria\", \"United States\"
}
\`\`\`

**API Documentation:** \`API_CONTRACT.md §5.3 (AuthorDTO)\`
**Integration:** Automatic enrichment via Wikidata API for all author queries

**Example:**
\`\`\`json
{
  \"name\": \"Chimamanda Ngozi Adichie\",
  \"nationality\": \"Nigeria\",
  \"culturalRegion\": \"Sub-Saharan Africa\"
}
\`\`\`"

# Documentation
close_issue 119 "✅ **COMPLETE** - API contract updated to v2.1

**Version:** 2.1
**Updated:** November 16, 2025
**Location:** \`docs/API_CONTRACT.md\`

**Status:** 📘 **THE SINGLE SOURCE OF TRUTH**

**v2.1 Updates:**
- WebSocket reconnection documentation (§7.5)
- Batch scanning flow (§7.6)
- Token refresh guidance
- Cultural diversity enrichment (§5.3)
- iOS integration checklist expanded

**Documentation Structure:**
- \`docs/README.md\` - Index highlighting API_CONTRACT.md
- \`docs/V2_MIGRATION_GUIDE.md\` - Migration from v1.x
- \`docs/CLIENT_MONITORING_GUIDE.md\` - Adoption tracking"

close_issue 122 "✅ **COMPLETE** - V2 migration guide created and distributed

**Created:** November 15, 2025
**Location:** \`docs/V2_MIGRATION_GUIDE.md\`

**Contents:**
- Migration overview (v1.x → v2.0)
- Breaking changes documentation
- Step-by-step migration guide
- Testing strategy
- Production deployment checklist

**Distribution:**
- Listed prominently in \`docs/README.md\`
- Referenced in API_CONTRACT.md
- Ready for iOS/Flutter teams

**Migration Deadline:** March 1, 2026
**Support:** Office hours Tue/Thu 2-3 PM EST"

close_issue 91 "✅ **COMPLETE** - iOS WebSocket migration fully documented

**Completed:** November 16, 2025
**Location:** \`docs/API_CONTRACT.md §7.5\`

**Documentation Includes:**
- ✅ Reconnection support (60-second grace period)
- ✅ State synchronization via \`reconnected\` message
- ✅ Token-based reconnection flow
- ✅ Swift/iOS code examples
- ✅ Batch scanning integration (§7.6)
- ✅ Error handling patterns
- ✅ Connection lifecycle management

**iOS Integration Checklist:** \`API_CONTRACT.md §9.4\`

**Key Features:**
- Automatic reconnection on network changes
- Job state sync after reconnect
- Graceful degradation
- Test mode support

**Note:** This supersedes any separate iOS WebSocket migration doc (#88)"

close_issue 67 "✅ **COMPLETE** - API/WebSocket contract standardization (Phase 1)

**Completed:** November 2025
**Audit:** \`docs/archives/WEBSOCKET_AUDIT_67.md\`

**Achievements:**
- ✅ WebSocket schema consolidated
- ✅ Summary-only completion payloads
- ✅ Canonical DTO alignment
- ✅ API v2.0 standardization
- ✅ Response format consistency

**Implementation:**
- All endpoints use canonical DTOs
- WebSocket messages under 1 KB
- Results retrieved via HTTP GET
- Consistent error handling

**Documentation:** \`API_CONTRACT.md\` reflects all standardizations"

# Cancelled/Not Required
close_issue 121 "❌ **CANCELLED** - Staging environment not needed

**Decision:** Direct production deployment approach
**Rationale:**
- Team opted for direct production deployment with monitoring
- Staging adds complexity without clear benefit
- Real-time monitoring via Cloudflare dashboard
- Rollback capabilities sufficient

**Alternative:** Production monitoring via #93 + rollback procedures

**Related:** #87 (staging config) also cancelled"

close_issue 87 "❌ **CLOSED** - Duplicate of #121 (staging environment)

**Status:** Cancelled
**Reason:** Merged into #121, then cancelled
**Decision:** Direct production deployment approach chosen

**See:** #121 for full context"

# Duplicates
close_issue 88 "❌ **CLOSED** - Duplicate of #91

**Status:** Duplicate
**Canonical Issue:** #91 (iOS WebSocket migration documentation)

**Resolution:** All iOS WebSocket documentation consolidated in \`API_CONTRACT.md §7.5\`"

close_issue 89 "✅ **COMPLETE** - Covered by #122 (V2 migration guide)

**Status:** Covered by migration guide
**Canonical Issue:** #122

**Subscriber Notification:**
- Migration guide published: \`docs/V2_MIGRATION_GUIDE.md\`
- Listed in \`docs/README.md\`
- Deadline: March 1, 2026
- Support: Office hours Tue/Thu 2-3 PM EST"

echo ""
echo "✅ All completed issues closed!"
echo ""
echo "📊 Summary:"
echo "   - Production Launch: 4 issues (#93, #124, #125, #126)"
echo "   - Enhancements: 3 issues (#120, #129, #137)"
echo "   - Documentation: 4 issues (#67, #91, #119, #122)"
echo "   - Cancelled: 2 issues (#87, #121)"
echo "   - Duplicates: 2 issues (#88, #89)"
echo ""
echo "   Total: 17 issues closed"
