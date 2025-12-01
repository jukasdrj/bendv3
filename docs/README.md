# BooksTrack Documentation Index

**Navigation guide for all project documentation**

---

## 🚀 Quick Start

- **[../CLAUDE.md](../CLAUDE.md)** - Quick reference for Claude Code (start here!)
- **[../.claude/CLAUDE.md](../.claude/CLAUDE.md)** - Full guidelines (architecture, patterns, AI workflows)
- **[../README_TESTING.md](../README_TESTING.md)** - Laptop-safe testing guide (prevents crashes)
- **[../AGENTS.md](../AGENTS.md)** - AI agent coordination and workflows

---

## 📖 Core Documentation

### API & Integration
- **[openapi.yaml](openapi.yaml)** - **SOURCE OF TRUTH** - OpenAPI 3.1 specification for frontend integration
- **[../packages/api-client/](../packages/api-client/)** - TypeScript SDK (auto-generated from OpenAPI)

### Architecture & Design
- **[../ARCHITECTURE_OVERVIEW.md](../ARCHITECTURE_OVERVIEW.md)** - System architecture overview
- **[PRD.md](PRD.md)** - Product requirements document
- **[PRD_ALIGNMENT_TRACKING.md](PRD_ALIGNMENT_TRACKING.md)** - PRD implementation tracking

### Feature Documentation
- **[ENRICHMENT_FLOW.md](ENRICHMENT_FLOW.md)** - Book enrichment workflow
- **[AUTHOR_HARVEST_SYSTEM.md](AUTHOR_HARVEST_SYSTEM.md)** - Author data harvesting
- **[CACHE_MONITORING.md](CACHE_MONITORING.md)** - KV cache monitoring and analytics

---

## 🧪 Testing

### Resource-Aware Testing (NEW!)
- **[../README_TESTING.md](../README_TESTING.md)** - **Main testing guide** - Prevents laptop crashes
- **[LAPTOP_TESTING.md](LAPTOP_TESTING.md)** - Detailed laptop-safe testing practices
- **[../.laptop-testing-cheatsheet.txt](../.laptop-testing-cheatsheet.txt)** - Quick reference cheat sheet

**Quick Commands:**
```bash
npm run test:smoke      # ⚡ 5s validation (use this daily)
npm run test:safe       # 🛡️ Full suite with 512MB limit
npm run test:unit       # 🎯 Unit tests only
npm run validate        # ✅ Pre-commit check
```

---

## 🛠️ Development

### AI Tools & Agents
- **[../AGENTS.md](../AGENTS.md)** - Autonomous agents (cf-ops-monitor, cf-code-reviewer)
- **[../.claude/agents/](../.claude/agents/)** - Agent configuration files
- **[../.claude/commands/](../.claude/commands/)** - Slash commands (`/deploy`, `/review`, `/logs`)

### Configuration
- **[../wrangler.jsonc](../wrangler.jsonc)** - Cloudflare Workers configuration
- **[../package.json](../package.json)** - Dependencies and scripts
- **[../vitest.config.js](../vitest.config.js)** - Test framework configuration

---

## 📁 Archive

Historical documentation for reference:

- **[archive/](archive/)** - Deprecated or superseded docs
  - Legacy manual router implementation
  - Old API contract versions
  - Deprecated feature specs

---

## 🎯 Sprint Planning

- **[sprints/](sprints/)** - Sprint retrospectives and planning docs
- **[plans/](plans/)** - Feature implementation plans

---

## 📊 Examples & Guides

- **[examples/](examples/)** - Code examples and integration samples
- **[testImages/](testImages/)** - Test images for bookshelf scanning

---

## 🔗 External Resources

- **Production API:** https://api.oooefam.net
- **Health Endpoint:** https://api.oooefam.net/health
- **Cloudflare Dashboard:** [Workers & Pages](https://dash.cloudflare.com/)

---

## 📝 Documentation Standards

### When to Update Docs

**Always update when:**
- Adding/changing API endpoints → Update `openapi.yaml`
- Modifying response formats → Update `openapi.yaml`, regenerate SDK
- Adding new features → Create feature doc in `docs/`
- Changing configuration → Update relevant config doc
- Adding dependencies → Update `package.json` comments

**OpenAPI is King:**
- `openapi.yaml` is the **authoritative source of truth**
- All frontend integrations MUST follow this contract
- TypeScript SDK auto-generated: `packages/api-client/`
- Breaking changes require 90-day deprecation notice
- Update OpenAPI spec BEFORE implementing changes

### Documentation Hierarchy

1. **openapi.yaml** - Source of truth for API
2. **CLAUDE.md** (root) - Quick reference
3. **.claude/CLAUDE.md** - Comprehensive guidelines
4. **Feature docs** - Specific implementation details
5. **Archive** - Historical reference only

---

## 🆘 Help & Support

**Common Questions:**

- **Testing crashes my laptop?** → See [LAPTOP_TESTING.md](LAPTOP_TESTING.md)
- **How to deploy?** → Run `/deploy` or see [../.claude/commands/deploy.md](../.claude/commands/deploy.md)
- **API contract questions?** → See [openapi.yaml](openapi.yaml)
- **Need code review?** → Run `/review` or see [AGENTS.md](../AGENTS.md)

**Emergency Recovery:**
```bash
# Kill runaway processes
pkill -f node

# Quick validation
npm run test:smoke

# Safe full testing
npm run test:safe
```

---

## 📅 Recent Updates

### November 28, 2025
- ✅ **Laptop-safe testing** - Resource-aware test modes prevent crashes
  - New: `test:smoke`, `test:safe`, `test:unit`, `validate` commands
  - Configuration: Reduced forks from 4→2, added memory limits
  - Documentation: README_TESTING.md, LAPTOP_TESTING.md, cheat sheet
  - Updated: CLAUDE.md, AGENTS.md, deployment commands

### November 27, 2025
- ✅ **Circuit Breaker Chain Complete** - All external APIs protected
- ✅ **Sprint 3 Phase 3** - Issues #80, #77, #97-#100, #81 closed

### November 21, 2025
- ✅ **API Contract v2.0** - ResponseEnvelope standardization
- ✅ **Hono Migration Complete** - Manual router deprecated

---

**Last Updated:** November 28, 2025
**Maintained By:** BooksTrack Team
