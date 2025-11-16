# Issue #141: Document Cloudflare Analytics Dashboard Access

**Priority:** P2 - Medium
**Type:** Documentation
**Component:** Monitoring / Analytics

## Problem

The monitoring documentation references a "Analytics" tab in the Cloudflare Dashboard that doesn't exist in the current UI:

```
Visit: https://dash.cloudflare.com/
Navigate: Workers & Pages → api-worker → Analytics tab
```

However, the actual Cloudflare Dashboard UI for Workers has changed. The Analytics tab may be:
- Named differently (e.g., "Metrics", "Observability", "Insights")
- Located in a different section
- Requires GraphQL API access instead of UI

## Impact

- Users cannot find the Analytics dashboard following current documentation
- Historical metrics queries require correct UI path or API access
- Monitoring guides (`docs/MONITORING_GUIDE.md`, `docs/deployment/MONITORING_DASHBOARD.md`) contain outdated instructions

## Tasks

- [ ] Log into Cloudflare Dashboard at https://dash.cloudflare.com/
- [ ] Navigate to Workers & Pages → api-worker
- [ ] Document the actual tab names and navigation path
- [ ] Take screenshots of the Analytics/Metrics UI
- [ ] Test running the example SQL queries from the documentation
- [ ] Determine if Analytics Engine queries require GraphQL API instead of Dashboard UI
- [ ] Update `docs/MONITORING_GUIDE.md` with correct navigation
- [ ] Update `docs/deployment/MONITORING_DASHBOARD.md` with correct access instructions
- [ ] Update `scripts/check-analytics.sh` with accurate guidance

## Investigation Steps

1. **Check Cloudflare Workers Dashboard:**
   - Account: d03bed0be6d976acd8a1707b55052f79
   - Worker: api-worker
   - Look for tabs: Metrics, Analytics, Observability, Logs, Insights

2. **Test Analytics Engine Access:**
   ```bash
   # Option 1: Dashboard UI (if available)
   # - Navigate and document exact path
   
   # Option 2: GraphQL API
   curl -X POST "https://api.cloudflare.com/client/v4/graphql" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"query":"{ viewer { accounts { analyticsEngine { datasets } } } }"}'
   ```

3. **Verify Analytics Engine Datasets:**
   - books_api_performance
   - books_api_cache_metrics
   - books_api_provider_performance
   - bookshelf_ai_performance
   - books_api_sampling_metrics

## Expected Outcome

Clear, accurate documentation showing:
- Exact navigation path to view Analytics Engine data
- Screenshots of the UI (if Dashboard access exists)
- Working GraphQL API examples (if Dashboard UI doesn't exist)
- Updated monitoring scripts with correct guidance

## References

- Cloudflare Analytics Engine Docs: https://developers.cloudflare.com/analytics/analytics-engine/
- GraphQL API Docs: https://developers.cloudflare.com/analytics/graphql-api/
- Workers Analytics Docs: https://developers.cloudflare.com/workers/observability/analytics-engine/

## Related Issues

- #93 - Configure monitoring dashboard for API v2.0 rollout (COMPLETE)
- This issue addresses the documentation gap discovered post-implementation

---

**Created:** 2025-11-16
**Status:** Open
**Assigned:** TBD
