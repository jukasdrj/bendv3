# Harvest Dashboard Visual Preview

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  📚 BooksTrack Harvest Dashboard                                    │
│  Last updated: 3:32:45 PM                      [🔄 Refresh]         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  System Health Overview                                              │
├─────────────────┬─────────────────┬─────────────────┬──────────────┤
│ Worker Status   │ Request Volume  │ Error Rate      │ Health Score │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌──────────┐ │
│ │     OK      │ │ │   15,420    │ │ │    0.23%    │ │ │ HEALTHY  │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │ └──────────┘ │
│ Version: 2.1.0  │ requests/hour   │ target: < 1%    │ No issues    │
│ Router: hono    │                 │                 │              │
└─────────────────┴─────────────────┴─────────────────┴──────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Cache Performance                                                   │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│ Edge Cache      │ KV Cache        │ Combined Hit Rate               │
│ Hit Rate        │ Hit Rate        │                                 │
│                 │                 │                                 │
│     ╭───╮       │     ╭───╮       │     ╭───╮                       │
│    ╱ 82.5% ╲    │    ╱ 14.2% ╲   │    ╱ 96.7% ╲                    │
│   │         │   │   │         │   │   │         │                   │
│    ╲       ╱    │    ╲       ╱    │    ╲       ╱                    │
│     ╰───╯       │     ╰───╯       │     ╰───╯                       │
│  (green gauge)  │ (yellow gauge)  │  (green gauge)                  │
│ Target: 80%     │ Target: 15%     │ Target: 95%                     │
└─────────────────┴─────────────────┴─────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Cache Volume Breakdown                                              │
├────────────────────┬─────────────────┬──────────────────────────────┤
│ Cache Tier         │ Hits            │ Percentage                   │
├────────────────────┼─────────────────┼──────────────────────────────┤
│ Edge Cache         │ 15,420          │ 82.50%                       │
│ KV Cache           │ 2,651           │ 14.20%                       │
│ API Misses         │ 329             │ 1.76%                        │
│ R2 Rehydrations    │ 112             │ 0.60%                        │
└────────────────────┴─────────────────┴──────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Response Time Metrics                                               │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│ P50 Latency     │ P95 Latency     │ P99 Latency                     │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐                 │
│ │    45ms     │ │ │    180ms    │ │ │    320ms    │                 │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘                 │
│ median          │ 95th percentile │ 99th percentile                 │
└─────────────────┴─────────────────┴─────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Cost Estimates                                                      │
├────────────────────┬─────────────────────────┬───────────────────────┤
│ Service            │ Usage                   │ Cost Estimate         │
├────────────────────┼─────────────────────────┼───────────────────────┤
│ KV Reads           │ Calculated from hits    │ $0.0013/period        │
│ R2 Reads           │ Calculated from rehydr. │ $0.0004/period        │
│ Total              │ Per period              │ $0.0017/period        │
└────────────────────┴─────────────────────────┴───────────────────────┘

─────────────────────────────────────────────────────────────────────
BooksTrack API Monitoring Dashboard | API Health | Raw Metrics
Auto-refresh: ON (30s) | ☑ Enable auto-refresh
─────────────────────────────────────────────────────────────────────
```

## Color Scheme (Dark Mode)

**Background Colors:**
- Primary: `#0f1419` (Very dark blue-grey)
- Secondary: `#1a1f2e` (Dark blue-grey)
- Card: `#22283a` (Slightly lighter blue-grey)

**Text Colors:**
- Primary: `#e6edf3` (Off-white)
- Secondary: `#8b949e` (Grey)

**Accent Colors:**
- Blue: `#58a6ff` (Bright blue - links, refresh button)
- Green: `#3fb950` (Success - OK status, high cache hit rates)
- Yellow: `#d29922` (Warning - medium cache hit rates)
- Red: `#f85149` (Error - low cache hit rates, errors)

**Borders:**
- Border: `#30363d` (Medium grey)

## Status Indicators

**Worker Status Badge:**
- ✅ **OK** - Green background, green border
- ❌ **ERROR** - Red background, red border

**Health Score Badge:**
- ✅ **HEALTHY** - Green background, green border
- ⚠️ **DEGRADED** - Yellow background, yellow border
- ❌ **UNHEALTHY** - Red background, red border

**Cache Hit Rate Gauges:**
- Green: >= Target (e.g., Edge >= 80%)
- Yellow: >= 80% of Target (e.g., Edge >= 64%)
- Red: < 80% of Target

## Responsive Design

**Desktop (> 768px):**
- Health cards: 4 columns grid
- Metrics cards: 3 columns grid
- Full-width tables

**Mobile (< 768px):**
- Health cards: 1 column stack
- Metrics cards: 1 column stack
- Horizontally scrollable tables

## Auto-Refresh Behavior

**Default State:**
- Auto-refresh: **ON**
- Interval: **30 seconds**
- Last updated timestamp refreshes automatically

**User Controls:**
- Toggle checkbox to disable/enable
- Manual refresh button always available
- Status indicator shows current state

## Data Flow

```
Dashboard (Browser)
    ↓ Fetch
https://api.oooefam.net/health
    ↓ Response
{
  status: "ok",
  worker: "api-worker",
  version: "2.1.0",
  router: "hono",
  timestamp: "2025-11-20T15:32:00Z"
}

Dashboard (Browser)
    ↓ Fetch
https://api.oooefam.net/metrics
    ↓ Response
{
  hitRates: { edge: 82.5, kv: 14.2, combined: 96.7 },
  volume: { edge_hits: 15420, kv_hits: 2651, api_misses: 329, r2_rehydrations: 112 },
  latency: { p50: 45, p95: 180, p99: 320 },
  costs: { kv_reads_estimate: "$0.0013/period", r2_reads: "$0.0004/period", total_estimate: "$0.0017/period" },
  health: { status: "healthy", issues: [] }
}
```

## Performance Metrics

**Bundle Size:**
- HTML: ~7 KB
- CSS: ~7 KB
- JavaScript: ~10 KB
- **Total: ~24 KB** (uncompressed)

**Load Time:**
- Initial load: < 500ms (static assets)
- Data fetch: < 200ms (API response time)
- **Total time to interactive: < 1s**

**Browser Support:**
- Chrome/Edge: ✅ (latest)
- Firefox: ✅ (latest)
- Safari: ✅ (latest)
- Mobile browsers: ✅ (iOS Safari, Chrome Mobile)

## Accessibility

- ✅ Semantic HTML5 elements
- ✅ ARIA labels on interactive elements
- ✅ Keyboard navigation support
- ✅ High contrast colors (WCAG AA compliant)
- ✅ Responsive font sizes (16px base)

## Future Enhancements (Phase 2)

1. **Chart.js Integration:**
   - Line charts for hit rate trends (7-day view)
   - Area charts for request volume over time
   - Bar charts for cost breakdown

2. **Advanced Filtering:**
   - Time range selector (1h/6h/24h/7d)
   - Per-prefix cache stats (book/author/cover)
   - Provider breakdown (Google Books, ISBNdb, OpenLibrary)

3. **Real-time Updates:**
   - WebSocket connection to `/ws/progress`
   - Live updates without polling
   - Instant notification of errors

4. **Data Export:**
   - Export to CSV
   - Export to JSON
   - Email reports (scheduled)

5. **ISBNdb Harvest Tracking:**
   - Cover harvest rate (covers/hour)
   - Cache population progress bar
   - Harvest job status timeline
   - Quota usage (5000 req/day limit)

## Implementation Notes

- No build step required (pure HTML/CSS/JS)
- No external dependencies (no npm packages)
- Vanilla JavaScript with Fetch API
- CSS Grid for layout
- Custom SVG gauges (CSS conic gradients)
- Cloudflare Pages hosting (free tier)
- < 30KB total bundle size
