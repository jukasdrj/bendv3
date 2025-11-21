# BooksTrack Backend - Documentation Index

**Last Updated:** November 20, 2025
**Project:** BooksTrack Cloudflare Workers API
**Production:** https://api.oooefam.net

> **🎯 Start Here:** New to the project? Read [README.md](README.md) → [CLAUDE.md](CLAUDE.md) → [docs/API_CONTRACT.md](docs/API_CONTRACT.md)

---

## 📚 Table of Contents

- [Getting Started](#getting-started)
- [Core Documentation](#core-documentation)
- [AI & Automation](#ai--automation)
- [API & Integration](#api--integration)
- [Deployment & Operations](#deployment--operations)
- [Testing & Quality](#testing--quality)
- [Architecture & Design](#architecture--design)
- [Archives](#archives)

---

## 🚀 Getting Started

**Essential First Reads:**

| Document | Purpose | Audience |
|----------|---------|----------|
| [README.md](README.md) | Project overview, setup, quick start | Everyone |
| [CLAUDE.md](CLAUDE.md) | Claude Code quick reference | AI developers |
| [.claude/CLAUDE.md](.claude/CLAUDE.md) | Comprehensive Claude Code guidelines | AI developers |
| [AGENTS.md](AGENTS.md) | Universal AI agent guide | All AI tools |

**Quick Commands:**
```bash
npm install              # Setup
npm run dev              # Local development
npm test                 # Run tests
npm run deploy           # Deploy to production
```

---

## 📖 Core Documentation

### Project Documentation

| File | Description | Status |
|------|-------------|--------|
| [README.md](README.md) | Main project README with setup and overview | ✅ Current |
| [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) | Detailed system architecture | ✅ Current |
| [CLAUDE.md](CLAUDE.md) | Claude Code quick reference | ✅ Current (v2.3) |
| [AGENTS.md](AGENTS.md) | Universal AI agent instructions | ✅ Current |
| [docs/WARP_TERMINAL_GUIDE.md](docs/WARP_TERMINAL_GUIDE.md) | WARP terminal configuration | ✅ Current |

### API Documentation

| File | Description | Status |
|------|-------------|--------|
| [docs/API_CONTRACT.md](docs/API_CONTRACT.md) | **Canonical API contract (source of truth)** | ✅ Current (v2.4.1) |
| [docs/COVER_HARVEST_SYSTEM.md](docs/COVER_HARVEST_SYSTEM.md) | ISBNdb cover harvesting documentation | ✅ Current |
| [docs/HARVEST_COVERS.md](docs/HARVEST_COVERS.md) | Cover harvesting implementation details | ✅ Current |

---

## 🤖 AI & Automation

### Claude Code Configuration

**Location:** `.claude/`

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| [.claude/CLAUDE.md](.claude/CLAUDE.md) | **Comprehensive Claude Code guidelines** | ✅ Current (773 lines) |
| `.claude/agents/` | Autonomous project agents | ✅ Active |
| `.claude/commands/` | Custom slash commands (/deploy, /review, etc.) | ✅ Active |
| `.claude/hooks/` | Hook-based agent triggers | ✅ Active |
| `.claude/skills/` | Multi-agent development workflow | ✅ Active |
| [.claude/AGENT_SETUP_GUIDE.md](.claude/AGENT_SETUP_GUIDE.md) | Agent setup and configuration | ✅ Current |
| [.claude/MODERNIZATION_SUMMARY.md](.claude/MODERNIZATION_SUMMARY.md) | Recent modernization work | ✅ Current |
| [.claude/WRANGLER_COMMAND_STANDARDS.md](.claude/WRANGLER_COMMAND_STANDARDS.md) | Wrangler CLI best practices | ✅ Current |
| [.claude/ZEN_MCP_COST_GUIDE.md](.claude/ZEN_MCP_COST_GUIDE.md) | MCP cost optimization guide | ✅ Current |

### Autonomous Agents

**Cloudflare Workers Agents:**
- `@cf-ops-monitor` - Deployment & observability (`.claude/agents/cf-ops-monitor/`)
- `@cf-code-reviewer` - Code quality & best practices (`.claude/agents/cf-code-reviewer/`)

**Slash Commands:**
- `/deploy` - Deploy with health monitoring
- `/review` - Code quality review
- `/logs [filter]` - Stream production logs
- `/rollback` - Rollback deployment
- `/cache-check` - KV cache performance

### GitHub Agents

**Location:** `.github/`

| File | Purpose | Status |
|------|---------|--------|
| [.github/AI_COLLABORATION.md](.github/AI_COLLABORATION.md) | GitHub AI collaboration patterns | ✅ Current |
| [.github/JULES_GUIDE.md](.github/JULES_GUIDE.md) | Jules AI agent configuration | ✅ Current |
| [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) | Contribution guidelines | ✅ Current |
| [.github/ISSUE_TEMPLATE.md](.github/ISSUE_TEMPLATE.md) | GitHub issue template | ✅ Current |
| [.github/SYNC_AUTOMATION.md](.github/SYNC_AUTOMATION.md) | Automation sync documentation | ✅ Current |

### AI Context Files

**Location:** `.ai/`

| File | Purpose | Status |
|------|---------|--------|
| [.ai/context.md](.ai/context.md) | Project-wide AI context | ✅ Current |
| [.ai/README.md](.ai/README.md) | AI directory overview | ✅ Current |
| [.ai/api-contract-ref.md](.ai/api-contract-ref.md) | API contract reference | ✅ Current |
| `.ai/prompts/` | AI prompt templates | ✅ Active |

---

## 🔌 API & Integration

### API Contract (Source of Truth)

**Primary Document:** [docs/API_CONTRACT.md](docs/API_CONTRACT.md)

This is the **authoritative contract** for all BooksTrack API integrations. All frontend teams MUST follow this contract.

**Key Sections:**
- Canonical response envelope
- HTTP endpoints (search, enrichment, bookshelf scanning)
- WebSocket protocol
- Error codes and handling
- Rate limiting
- CORS policies
- Authentication (token-based for WebSocket)

**When making API changes:**
1. Update `docs/API_CONTRACT.md` FIRST
2. Implement changes in code
3. Notify frontend teams (90-day notice for breaking changes)

### Workflow Documentation

**Location:** `docs/workflows/`

| File | Purpose | Status |
|------|---------|--------|
| [docs/workflows/canonical-contracts-workflow.md](docs/workflows/canonical-contracts-workflow.md) | API contract update workflow | ✅ Current |

---

## 🚢 Deployment & Operations

### Deployment Guides

**Location:** `docs/deployment/`

| File | Purpose | Status |
|------|-------------|--------|
| [docs/deployment/DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md) | Production deployment guide | ✅ Current |
| [docs/deployment/SECRETS_SETUP.md](docs/deployment/SECRETS_SETUP.md) | Environment secrets configuration | ✅ Current |
| [docs/deployment/ROLLBACK_PROCEDURE.md](docs/deployment/ROLLBACK_PROCEDURE.md) | Emergency rollback procedures | ✅ Current |
| [docs/deployment/TROUBLESHOOTING_RUNBOOK.md](docs/deployment/TROUBLESHOOTING_RUNBOOK.md) | Operational troubleshooting | ✅ Current |

### Monitoring & Observability

**Location:** `docs/deployment/`

| File | Purpose | Status |
|------|-------------|--------|
| [docs/deployment/MONITORING_DASHBOARD.md](docs/deployment/MONITORING_DASHBOARD.md) | Health dashboard documentation | ✅ Current |
| [docs/deployment/DASHBOARD_DEPLOYMENT.md](docs/deployment/DASHBOARD_DEPLOYMENT.md) | Dashboard deployment guide | ✅ Current |
| [docs/deployment/ALERTING_RULES.md](docs/deployment/ALERTING_RULES.md) | Alert configuration | ✅ Current |
| [docs/deployment/NOTIFICATION_PROCEDURES.md](docs/deployment/NOTIFICATION_PROCEDURES.md) | Notification setup | ✅ Current |

### Monitoring Dashboard

**Location:** `dashboard/`

| File | Purpose | Status |
|------|-------------|--------|
| [dashboard/README.md](dashboard/README.md) | Dashboard overview | ✅ Current |
| [dashboard/IMPLEMENTATION_SUMMARY.md](dashboard/IMPLEMENTATION_SUMMARY.md) | Implementation details | ✅ Current |
| [dashboard/DEPLOYMENT_CHECKLIST.md](dashboard/DEPLOYMENT_CHECKLIST.md) | Deployment checklist | ✅ Current |
| [dashboard/VISUAL_PREVIEW.md](dashboard/VISUAL_PREVIEW.md) | Visual preview documentation | ✅ Current |

---

## 🧪 Testing & Quality

### Test Documentation

**Location:** `tests/`

| File | Purpose | Status |
|------|-------------|--------|
| [tests/README.md](tests/README.md) | Test suite overview | ✅ Current |
| [tests/PATTERNS.md](tests/PATTERNS.md) | Testing patterns and conventions | ✅ Current |
| [tests/README-MSW.md](tests/README-MSW.md) | Mock Service Worker setup | ✅ Current |
| [docs/TEST_SUITE_HIBERNATION_UPDATES.md](docs/TEST_SUITE_HIBERNATION_UPDATES.md) | Test suite updates | ✅ Current |

### Code Quality

**Coverage Targets:**
- Overall: 75%+
- Handlers: 80%+
- Services: 85%+
- Critical paths: 90%+

**Test Framework:** Vitest
**Patterns:** Mock external APIs, no real API calls, shared fixtures

---

## 🏗️ Architecture & Design

### Architecture Documentation

| File | Purpose | Status |
|------|-------------|--------|
| [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) | System architecture deep dive | ✅ Current |
| [.claude/CLAUDE.md](.claude/CLAUDE.md) | Architecture patterns (section) | ✅ Current |

### Feature Guides

**Location:** `docs/guides/`

| File | Purpose | Status |
|------|-------------|--------|
| [docs/guides/ISBNDB-HARVEST-IMPLEMENTATION.md](docs/guides/ISBNDB-HARVEST-IMPLEMENTATION.md) | ISBNdb cover harvest implementation | ✅ Current |
| [docs/guides/METRICS.md](docs/guides/METRICS.md) | Metrics and analytics guide | ✅ Current |

### Utility Scripts

**Location:** `scripts/utils/`

| File | Purpose | Status |
|------|-------------|--------|
| [scripts/utils/README-HARVEST-TEST.md](scripts/utils/README-HARVEST-TEST.md) | Harvest testing utilities | ✅ Current |
| [scripts/utils/README-WARMING.md](scripts/utils/README-WARMING.md) | Cache warming utilities | ✅ Current |

---

## 📦 Archives

**All archived documentation is preserved for historical reference.**

### Recent Archives (2025-11-20)

**Location:** `archive/2025-11-20-doc-cleanup/`

| File | Reason | Archive Date |
|------|--------|--------------|
| BRANCH_REVIEW_SUMMARY.md | One-time branch review (Nov 19) | Nov 20, 2025 |

### Historical Archives (2025-11)

**Location:** `archive/2025-11-archive/`

| Category | Files | Purpose |
|----------|-------|---------|
| Test Audits | BATCH_TEST_AUDIT.md | Test suite analysis |
| Issue Resolution | ISSUE-41-RESOLUTION.md | Historical issue tracking |
| Project Summaries | QUICK_START_CONSOLIDATION.md, REORGANIZATION_SUMMARY.md, VERIFICATION_SUMMARY.md | Project reorganization work |
| WebSocket Updates | WEBSOCKET_IMPROVEMENTS_2025-11-14.md, websocket-close-codes-code-review.md | WebSocket implementation history |

### Claude Config Archives

**Location:** `archive/claude-config/`

| File | Purpose | Status |
|------|---------|--------|
| AGENT_SETUP.md | Historical agent setup | 📦 Archived |
| continuation-context.md | Continuation context docs | 📦 Archived |
| OPTIMIZATION_COMPLETE.md | Optimization summary | 📦 Archived |
| UPGRADE_SUMMARY.md | Upgrade documentation | 📦 Archived |
| WRANGLER_COMPAT_UPDATE.md | Wrangler compatibility | 📦 Archived |

### Documentation Archives

**Location:** `docs/archives/`

Includes superseded versions of:
- API migration notices
- Cache warming documentation
- Frontend integration guides
- Monitoring summaries
- Sprint summaries
- WebSocket audits

**See:** [docs/archives/README.md](docs/archives/README.md) for complete archive index

### Plan Archives

**Location:** `archive/plans/`

Historical planning documents including:
- Cache warming fixes
- API contract implementation plans
- Multi-edition harvest strategies
- Phase consolidation plans
- Sprint organization
- Test implementation guides

**See:** [archive/README.md](archive/README.md) for archive navigation

---

## 🗂️ Documentation Organization

### Directory Structure

```
bookstrack-backend/
├── CLAUDE.md                     # Claude Code quick reference
├── AGENTS.md                     # Universal AI agent guide
├── README.md                     # Project overview
├── ARCHITECTURE_OVERVIEW.md      # System architecture
├── DOCS_INDEX.md                 # This file (documentation index)
│
├── .ai/                          # AI context files
│   ├── context.md
│   ├── api-contract-ref.md
│   └── prompts/
│
├── .claude/                      # Claude Code configuration
│   ├── CLAUDE.md                 # Comprehensive guidelines (773 lines)
│   ├── agents/                   # Autonomous agents
│   ├── commands/                 # Slash commands
│   ├── hooks/                    # Hook triggers
│   └── skills/                   # Multi-agent workflows
│
├── .github/                      # GitHub configuration
│   ├── AI_COLLABORATION.md
│   ├── JULES_GUIDE.md
│   ├── CONTRIBUTING.md
│   └── workflows/
│
├── docs/                         # Main documentation
│   ├── API_CONTRACT.md           # **SOURCE OF TRUTH** for API
│   ├── WARP_TERMINAL_GUIDE.md
│   ├── deployment/               # Deployment guides
│   ├── guides/                   # Feature guides
│   ├── workflows/                # Workflow diagrams
│   └── archives/                 # Historical docs
│
├── dashboard/                    # Dashboard docs
│   ├── README.md
│   ├── IMPLEMENTATION_SUMMARY.md
│   └── DEPLOYMENT_CHECKLIST.md
│
├── tests/                        # Test documentation
│   ├── README.md
│   ├── PATTERNS.md
│   └── README-MSW.md
│
└── archive/                      # Historical archives
    ├── 2025-11-20-doc-cleanup/
    ├── 2025-11-archive/
    ├── claude-config/
    ├── docs/
    └── plans/
```

---

## 🔍 Finding Documentation

### By Topic

**Need to know about...** | **Read this**
---|---
Project setup | [README.md](README.md)
Architecture | [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)
API contract | [docs/API_CONTRACT.md](docs/API_CONTRACT.md)
Claude Code usage | [.claude/CLAUDE.md](.claude/CLAUDE.md)
AI agents | [AGENTS.md](AGENTS.md)
Deployment | [docs/deployment/DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md)
Testing | [tests/PATTERNS.md](tests/PATTERNS.md)
Monitoring | [docs/deployment/MONITORING_DASHBOARD.md](docs/deployment/MONITORING_DASHBOARD.md)
Troubleshooting | [docs/deployment/TROUBLESHOOTING_RUNBOOK.md](docs/deployment/TROUBLESHOOTING_RUNBOOK.md)

### By Audience

**I am a...** | **Start here**
---|---
New developer | [README.md](README.md) → [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)
AI tool/agent | [AGENTS.md](AGENTS.md) → [.claude/CLAUDE.md](.claude/CLAUDE.md)
Frontend developer | [docs/API_CONTRACT.md](docs/API_CONTRACT.md)
DevOps engineer | [docs/deployment/](docs/deployment/)
QA engineer | [tests/PATTERNS.md](tests/PATTERNS.md)

---

## 📝 Documentation Standards

### Maintenance Guidelines

**All documentation should:**
- Include a "Last Updated" date
- Link to related documents
- Use consistent markdown formatting
- Include code examples where appropriate
- Mark deprecated sections clearly

**When updating documentation:**
1. Update the relevant document
2. Update the "Last Updated" date
3. Update this index if adding/removing files
4. Create archive copy if superseding old version
5. Update cross-references in related docs

### Deprecation Policy

**When deprecating documentation:**
1. Mark as deprecated with ❌ emoji
2. Link to replacement document
3. Move to appropriate archive directory after 90 days
4. Update all cross-references

---

## 🚀 Quick Actions

**Common Documentation Tasks:**

```bash
# Find all markdown files
find . -name "*.md" ! -path "*/node_modules/*" ! -path "*/.git/*"

# Search documentation
grep -r "search term" docs/ .claude/ .github/

# Validate links (requires markdown-link-check)
npm install -g markdown-link-check
find . -name "*.md" -exec markdown-link-check {} \;
```

---

**Maintained by:** Justin Gardner (@jukasdrj)
**Last Updated:** November 20, 2025
**Questions?** Create an issue or consult [CONTRIBUTING.md](.github/CONTRIBUTING.md)
