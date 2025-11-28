# BooksTrack Autonomous Agents

**Quick Reference for AI Agents in the BooksTrack Backend**

This document provides a high-level overview of specialized AI agents available for this project. For detailed configuration and implementation, see `.claude/agents/`.

---

## Available Agents

### 🚀 cf-ops-monitor
**Purpose:** Deployment automation, observability, and incident response for Cloudflare Workers

**Use When:**
- Deploying to production or staging
- Investigating production errors or performance issues
- Monitoring API health and metrics
- Analyzing cache hit rates and external API usage
- Need to rollback a deployment

**Invoke:**
```bash
@cf-ops-monitor
```

**Common Commands:**
- Deploy to production with health monitoring
- Stream and analyze real-time logs
- Check KV cache performance
- Track API quota usage (Google Books, Gemini, ISBNdb)
- Auto-rollback on error threshold breach

---

### ✅ cf-code-reviewer
**Purpose:** Code quality enforcement for Cloudflare Workers patterns and API contract compliance

**Use When:**
- Before creating a PR
- After refactoring handlers or services
- Adding new API endpoints
- Modifying `wrangler.toml`
- Need to validate API contract compliance

**Invoke:**
```bash
@cf-code-reviewer
```

**Key Responsibilities:**
- Validate Workers-specific patterns (env bindings, KV cache, Durable Objects)
- Enforce security (input validation, secrets management, CORS)
- Check API contract compliance (`docs/API_CONTRACT.md`)
- Detect anti-patterns (blocking event loop, missing timeouts)
- Verify canonical response format

---

## API Contract Enforcement

**CRITICAL:** All agents must reference `docs/API_CONTRACT.md` as the authoritative source of truth.

### cf-code-reviewer Checks:
- ✅ New endpoints match documented response format
- ✅ DTOs (WorkDTO, EditionDTO, AuthorDTO) match schemas
- ✅ Error codes from approved list
- ✅ Rate limiting behavior correct
- ✅ Breaking changes flagged (require 90-day notice)

### cf-ops-monitor Monitors:
- ✅ SLA compliance (99.9% uptime, <500ms P95 latency)
- ✅ Data quality metrics (ISBN match rate, cover availability)
- ✅ Contract violations (wrong response format, missing fields)

**Related Issues:** #138 (OpenAPI spec), #139 (Postman collection), #140 (Contract testing)

---

## Agent Coordination

### Workflow Examples

**Deploying New Features:**
1. Run `npm run test:smoke` or `npm run test:safe` for validation
2. `cf-code-reviewer` validates code quality
3. `cf-ops-monitor` deploys with health checks
4. `cf-ops-monitor` monitors for 4 hours post-launch
5. Auto-rollback if error rate > 5%

**Investigating Production Issues:**
1. `cf-ops-monitor` streams logs and identifies patterns
2. Suggests root cause (e.g., API timeout, cache issue)
3. `cf-code-reviewer` validates the fix
4. `cf-ops-monitor` deploys and monitors recovery

**Pre-PR Code Review:**
1. Run `npm run validate` (smoke tests + lint)
2. Developer requests `cf-code-reviewer` review
3. Agent validates patterns, security, API contract
4. Suggests improvements and optimizations
5. Developer addresses feedback and re-reviews if needed

---

## Escalation to Advanced Tools

For complex scenarios requiring deep analysis, escalate to Zen MCP:

- `@zen debug` - Complex bug investigation
- `@zen secaudit` - Security vulnerability assessment  
- `@zen codereview` - Architectural code review
- `@zen thinkdeep` - Multi-stage reasoning for complex problems
- `@zen precommit` - Pre-commit validation across repositories

---

## Quick Tips

### When to Use Agents
✅ Production deployments and monitoring
✅ Pre-PR code reviews
✅ API contract validation
✅ Workers-specific pattern enforcement
✅ Performance optimization

### When NOT to Use Agents
❌ Simple one-line changes
❌ Documentation-only updates (unless API changes)
❌ Generic Node.js code (not Workers-specific)

---

## Testing Integration

### Resource-Aware Testing
**Before invoking agents, always run tests in resource-aware modes:**

```bash
# Quick validation (recommended for daily use)
npm run test:smoke      # 5 seconds, minimal resources

# Pre-commit validation
npm run validate        # Smoke tests + lint

# Full validation (laptop-safe)
npm run test:safe       # 512MB limit, sequential execution
```

### Agent Testing Workflows

**cf-code-reviewer Integration:**
```bash
# 1. Make code changes
# 2. Run quick validation
npm run test:smoke

# 3. If tests pass, invoke reviewer
@cf-code-reviewer

# 4. Address feedback, then full validation
npm run test:safe
```

**cf-ops-monitor Integration:**
```bash
# 1. Validate changes locally
npm run test:safe

# 2. Deploy with monitoring
@cf-ops-monitor deploy

# 3. Monitor logs for issues
@cf-ops-monitor logs
```

**Why Resource-Aware Testing?**
- Prevents laptop crashes from Node.js memory/CPU exhaustion
- Faster feedback loop with smoke tests (5s vs 30s+)
- Safe for 8GB RAM laptops (512MB memory limits)
- See [README_TESTING.md](README_TESTING.md) for full guide  

---

## More Information

- **Detailed Configuration:** `.claude/agents/README.md`
- **Agent Prompts:** `.claude/agents/cf-ops-monitor/` and `.claude/agents/cf-code-reviewer/`
- **Hook Integration:** `.claude/hooks/post-tool-use.sh`
- **Claude Code Guidelines:** `.claude/CLAUDE.md`

---

**Last Updated:** November 16, 2025  
**Maintained By:** AI Team (Claude Code, cf-ops-monitor, cf-code-reviewer)
