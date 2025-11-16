# BooksTrack Backend Documentation

**Last Updated:** November 16, 2025

---

## 📘 Start Here

### For Frontend Developers

**➡️ [API_CONTRACT.md](./API_CONTRACT.md)** - The single source of truth for API integration.

This is the **authoritative contract** maintained by the backend team. All frontend implementations must conform to this contract.

**What's inside:**
- Complete HTTP and WebSocket API specifications
- Canonical DTO schemas with all fields documented
- SLAs, rate limits, and performance guarantees
- Error handling and retry policies
- Cultural diversity enrichment (Wikidata)
- Integration checklist and migration guide

**🔥 Migrating from v1.x to v2.0?**

**➡️ [V2_MIGRATION_GUIDE.md](./V2_MIGRATION_GUIDE.md)** - Comprehensive migration guide for iOS/Flutter teams

**Migration Deadline:** March 1, 2026
**Support:** Office hours every Tue/Thu 2-3 PM EST

---

## 📚 Documentation Index

### Active Documents (Production-Ready)

| Document | Purpose | Audience |
|----------|---------|----------|
| **[API_CONTRACT.md](./API_CONTRACT.md)** | 📘 **THE SINGLE SOURCE OF TRUTH** - Authoritative API contract (v2.1) | **Frontend teams** |
| **[V2_MIGRATION_GUIDE.md](./V2_MIGRATION_GUIDE.md)** | v1.x → v2.0 migration guide | **Frontend teams** |
| [CLIENT_MONITORING_GUIDE.md](./CLIENT_MONITORING_GUIDE.md) | Client adoption tracking | Backend, DevOps |
| [TEST_COVERAGE_ANALYSIS.md](./TEST_COVERAGE_ANALYSIS.md) | Test coverage gaps and testing roadmap | Backend, QA |
| [DEPLOYMENT.md](./deployment/DEPLOYMENT.md) | Deployment procedures and rollback | Backend, DevOps |
| [ROLLBACK_PROCEDURES.md](./deployment/ROLLBACK_PROCEDURE.md) | Emergency rollback procedures | Backend, DevOps |
| [MONITORING_GUIDE.md](./MONITORING_GUIDE.md) | Operational monitoring guide | Backend, DevOps |
| [deployment/MONITORING_DASHBOARD.md](./deployment/MONITORING_DASHBOARD.md) | Analytics dashboard setup | DevOps |
| [deployment/SECRETS_SETUP.md](./deployment/SECRETS_SETUP.md) | Environment secrets configuration | DevOps |

### Reference Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| [QUICK_START.md](./QUICK_START.md) | Quick start guide for new developers | Backend |
| [CLOUDFLARE_WORKERS_LIMITS.md](./CLOUDFLARE_WORKERS_LIMITS.md) | Workers platform limits and quotas | Backend |
| [HARVEST_COVERS.md](./HARVEST_COVERS.md) | Cover image harvesting system | Backend |
| [COVER_HARVEST_SYSTEM.md](./COVER_HARVEST_SYSTEM.md) | Cover harvest implementation details | Backend |
| [guides/ISBNDB-HARVEST-IMPLEMENTATION.md](./guides/ISBNDB-HARVEST-IMPLEMENTATION.md) | ISBNdb integration guide | Backend |
| [guides/METRICS.md](./guides/METRICS.md) | Analytics and metrics reference | Backend, DevOps |

### Archived Documents

**All deprecated and historical docs moved to:** `docs/archives/`

This includes:
- Post-launch assessments (GO_NO_GO, MONITORING_IMPLEMENTATION_SUMMARY)
- Historical audits (WEBSOCKET_AUDIT_67)
- Deprecated guides (FRONTEND_INTEGRATION_GUIDE, API_CONTRACT_CURRENT)
- Setup logs (robit/, ANALYTICS_DASHBOARD)

---

## 🎯 Quick Links

### For iOS/Flutter Developers

**New to the API?**
1. **Getting Started:** Read [API_CONTRACT.md §9 (Integration Checklist)](./API_CONTRACT.md#9-frontend-integration-checklist)
2. **DTO Schemas:** See [API_CONTRACT.md §5 (Canonical DTOs)](./API_CONTRACT.md#5-canonical-data-transfer-objects)
3. **WebSocket Integration:** See [API_CONTRACT.md §7 (WebSocket API)](./API_CONTRACT.md#7-websocket-api)
4. **Cultural Diversity:** See [API_CONTRACT.md §5.3 (AuthorDTO)](./API_CONTRACT.md#53-authordto-creator-of-works)

**Migrating from v1.x?**
1. **Migration Overview:** [V2_MIGRATION_GUIDE.md §1 (Overview)](./V2_MIGRATION_GUIDE.md#1-migration-overview)
2. **Breaking Changes:** [V2_MIGRATION_GUIDE.md §2 (Breaking Changes)](./V2_MIGRATION_GUIDE.md#2-breaking-changes)
3. **Step-by-Step:** [V2_MIGRATION_GUIDE.md §5 (Migration Steps)](./V2_MIGRATION_GUIDE.md#5-step-by-step-migration)
4. **Production Testing:** [V2_MIGRATION_GUIDE.md §6 (Testing Strategy)](./V2_MIGRATION_GUIDE.md#6-testing-strategy)

### For Backend Developers

1. **Quick Start:** [QUICK_START.md](./QUICK_START.md)
2. **Architecture:** [CLAUDE.md](../.claude/CLAUDE.md) (in `.claude/` directory)
3. **Deployment:** [DEPLOYMENT.md](./deployment/DEPLOYMENT.md)
4. **Monitoring:** [MONITORING_GUIDE.md](./MONITORING_GUIDE.md)
5. **Test Coverage:** [TEST_COVERAGE_ANALYSIS.md](./TEST_COVERAGE_ANALYSIS.md)

---

## 🔄 Contract Versioning

**Current Version:** v2.1 (November 16, 2025)

**Version History:**
- **v2.1:** WebSocket documentation (reconnection, batch scanning), token refresh
- **v2.0:** Cultural diversity enrichment, summary-only completions, results endpoints
- **v1.5:** ISBNs array, quality scoring
- **v1.0:** Initial canonical API contract

**Support Policy:**
- v2.x: Fully supported ✅
- v1.x: Deprecated, sunset March 1, 2026 ⚠️

**Migration Resources:**
- [V2_MIGRATION_GUIDE.md](./V2_MIGRATION_GUIDE.md) - Step-by-step migration guide
- [CLIENT_MONITORING_GUIDE.md](./CLIENT_MONITORING_GUIDE.md) - Adoption tracking

---

## 📞 Support

**Questions about the API contract?**
- Email: api-support@oooefam.net
- Slack: #bookstrack-api

**Found a bug or discrepancy?**
- GitHub Issues: https://github.com/bookstrack/backend/issues
- Include: endpoint URL, request/response, error code, timestamp

**API Status:**
- https://status.oooefam.net

---

## 🛠️ Contributing to Documentation

**Updating the API Contract:**
1. Changes to `API_CONTRACT.md` require backend team approval
2. Breaking changes require 90-day notice to frontend teams
3. All changes must include version bump and changelog entry

**Documentation Standards:**
- Use TypeScript for type definitions
- Include real examples (not placeholders)
- Document SLAs and performance targets
- Keep migration guides up-to-date

---

**Last Review:** November 16, 2025 (Post-v2.0 launch cleanup)
**Next Review:** February 15, 2026
