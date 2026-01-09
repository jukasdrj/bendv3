---
name: deploy
description: Deploy to Cloudflare Workers with monitoring
user-invocable: true
agent: cf-ops-monitor
context: fork
allowed-tools:
  - Bash
  - Read
  - WebFetch
---

Deploy the BooksTrack backend to production using Wrangler, then monitor health metrics and auto-rollback if errors spike.

**Pre-deployment checks:**
- Run `npm run test:safe` to validate all tests pass (laptop-safe mode)
- Verify wrangler.jsonc configuration
- Ensure all required secrets are set
- Check git status for uncommitted changes

**Deployment:**
- Execute `npx wrangler deploy`
- Monitor /health endpoint
- Track error rates for 5 minutes
- Auto-rollback if error rate > 5%

@cf-ops-monitor
