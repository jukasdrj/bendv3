# BooksTrack Backend Documentation

**Last Updated:** November 15, 2025

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

---

## 📚 Documentation Index

### Active Documents (Production-Ready)

| Document | Purpose | Audience |
|----------|---------|----------|
| **[API_CONTRACT.md](./API_CONTRACT.md)** | Authoritative API contract (v2.0) | **Frontend teams** |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deployment procedures and rollback | Backend, DevOps |
| [SECRETS_SETUP.md](./SECRETS_SETUP.md) | Environment secrets configuration | Backend, DevOps |

### Deprecated Documents (Historical Reference Only)

| Document | Status | Replacement |
|----------|--------|-------------|
| [API_CONTRACT_CURRENT.md](./API_CONTRACT_CURRENT.md) | ⚠️ Deprecated | API_CONTRACT.md |
| [FRONTEND_INTEGRATION_GUIDE.md](./FRONTEND_INTEGRATION_GUIDE.md) | ⚠️ Deprecated | API_CONTRACT.md |

**Why deprecated?**
- Contained aspirational features not fully implemented
- Mixed actual vs. planned behavior
- Superseded by comprehensive API_CONTRACT.md

---

## 🎯 Quick Links

### For iOS/Flutter Developers

1. **Getting Started:** Read [API_CONTRACT.md §9 (Integration Checklist)](./API_CONTRACT.md#9-frontend-integration-checklist)
2. **DTO Schemas:** See [API_CONTRACT.md §5 (Canonical DTOs)](./API_CONTRACT.md#5-canonical-data-transfer-objects)
3. **WebSocket Integration:** See [API_CONTRACT.md §7 (WebSocket API)](./API_CONTRACT.md#7-websocket-api)
4. **Cultural Diversity:** See [API_CONTRACT.md §5.3 (AuthorDTO)](./API_CONTRACT.md#53-authordto-creator-of-works)

### For Backend Developers

1. **Deployment:** [DEPLOYMENT.md](./DEPLOYMENT.md)
2. **Secrets Setup:** [SECRETS_SETUP.md](./SECRETS_SETUP.md)
3. **Architecture:** [CLAUDE.md](../.claude/CLAUDE.md) (in `.claude/` directory)

---

## 🔄 Contract Versioning

**Current Version:** v2.0 (November 15, 2025)

**Version History:**
- **v2.0:** Cultural diversity enrichment, summary-only completions, results endpoints
- **v1.5:** ISBNs array, quality scoring
- **v1.0:** Initial canonical API contract

**Support Policy:**
- v2.x: Fully supported ✅
- v1.x: Deprecated, sunset March 1, 2026 ⚠️

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

**Last Review:** November 15, 2025
**Next Review:** February 15, 2026
