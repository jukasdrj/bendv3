---
description: Review code changes for Cloudflare Workers best practices
---

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
