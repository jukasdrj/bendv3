---
description: Deploy BooksTrack backend to Cloudflare Workers with monitoring
---

Deploy the BooksTrack backend to production using Wrangler, then monitor health metrics and auto-rollback if errors spike.

**Pre-deployment checks:**
- Verify wrangler.toml configuration
- Ensure all required secrets are set
- Check git status for uncommitted changes

**Deployment:**
- Execute `npx wrangler deploy`
- Monitor /health endpoint
- Track error rates for 5 minutes
- Auto-rollback if error rate > 5%

@cf-ops-monitor
