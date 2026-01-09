---
name: review
description: Review code for Cloudflare Workers best practices
user-invocable: true
agent: cf-code-reviewer
context: fork
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - mcp__pal__codereview
---

**Before review, ensure tests pass:**
```bash
npm run test:smoke  # Quick validation (5s)
# OR
npm run test:safe   # Full suite (60s, laptop-safe)
```

Review recent code changes for:

**Workers Patterns:**
- Proper env bindings (KV, Durable Objects, Secrets)
- Async/await hygiene (avoid blocking event loop)
- Cache-first patterns for external APIs

**Performance:**
- KV cache implementation
- Parallel API calls with Promise.all()
- Timeout handling for external calls

**Security:**
- Input validation and sanitization
- Secrets never exposed in errors/logs
- CORS origin whitelist enforcement

**Architecture:**
- Canonical response format compliance
- Error handling consistency
- Service layer separation (handlers → services → providers)

@cf-code-reviewer
