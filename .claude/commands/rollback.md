---
description: Rollback to previous Cloudflare Workers deployment
---

Rollback the BooksTrack backend to the previous stable deployment:

**Steps:**
1. List recent deployments with `wrangler deployments list`
2. Identify last stable version
3. Execute `wrangler rollback`
4. Verify /health endpoint
5. Monitor error rates for recovery

**Post-rollback:**
- Analyze what caused the need for rollback
- Document incident for future reference
- Plan fix for the issue

@cf-ops-monitor
