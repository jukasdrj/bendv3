# BooksTrack Harvest Dashboard

**Live URL:** https://harvest.oooefam.net

A lightweight, real-time web dashboard for monitoring BooksTrack API health, cache performance, and system metrics.

## Features

### Phase 1 MVP (Current)

✅ **System Health Overview**
- Worker status (uptime, version, router type)
- Request volume tracking
- Error rate monitoring
- Overall health score

✅ **Cache Performance**
- Real-time hit rate gauges (Edge, KV, Combined)
- Visual indicators with color-coded targets
- Cache tier breakdown table
- Volume metrics

✅ **Response Time Metrics**
- P50, P95, P99 latency tracking
- Performance target monitoring

✅ **Cost Tracking**
- KV reads cost estimates
- R2 reads cost estimates
- Total cost per period

✅ **User Experience**
- Auto-refresh every 30 seconds
- Manual refresh button
- Dark mode (BooksTrack branded)
- Responsive design (desktop + mobile)
- No build step required

## Technology Stack

- **Frontend:** Vanilla HTML/CSS/JavaScript
- **Hosting:** Cloudflare Pages
- **Data Sources:**
  - `GET /health` - Basic health check
  - `GET /metrics` - Comprehensive performance metrics
- **No Dependencies:** Pure JavaScript, no frameworks

## Local Development

1. **Serve locally:**
   ```bash
   cd dashboard
   python3 -m http.server 8080
   # or
   npx serve
   ```

2. **Open in browser:**
   ```
   http://localhost:8080
   ```

3. **Test with production API:**
   - Dashboard automatically fetches from `https://api.oooefam.net`
   - CORS is already configured for `harvest.oooefam.net`

## Deployment

### Cloudflare Pages Deployment

1. **Via Cloudflare Dashboard:**
   - Go to **Workers & Pages** → **Create application** → **Pages**
   - Connect to GitHub repository: `jukasdrj/bookstrack-backend`
   - Configure build:
     - Build command: (none)
     - Build output directory: `dashboard`
     - Root directory: `/`
   - Set custom domain: `harvest.oooefam.net`

2. **Via Wrangler CLI:**
   ```bash
   npx wrangler pages project create harvest-dashboard
   npx wrangler pages deploy dashboard --project-name=harvest-dashboard
   ```

### Custom Domain Configuration

The domain `harvest.oooefam.net` is already configured in:
- `wrangler.toml:44` - Route for Workers
- `src/router.ts:40` - CORS whitelist

## API Endpoints Used

### GET /health
Returns basic worker status:
```json
{
  "status": "ok",
  "worker": "api-worker",
  "version": "2.1.0",
  "router": "hono",
  "timestamp": "2025-11-20T15:00:00Z"
}
```

### GET /metrics?period=1h
Returns aggregated performance metrics:
```json
{
  "hitRates": {
    "edge": 82.5,
    "kv": 14.2,
    "combined": 96.7
  },
  "volume": {
    "edge_hits": 15420,
    "kv_hits": 2651,
    "api_misses": 329,
    "r2_rehydrations": 112
  },
  "latency": {
    "p50": 45,
    "p95": 180,
    "p99": 320
  },
  "costs": {
    "kv_reads_estimate": "$0.0013/period",
    "r2_reads": "$0.0004/period",
    "total_estimate": "$0.0017/period"
  },
  "health": {
    "status": "healthy",
    "issues": []
  }
}
```

## File Structure

```
dashboard/
├── index.html          # Main HTML structure
├── styles.css          # Dark mode BooksTrack-branded styles
├── dashboard.js        # Data fetching and rendering logic
└── README.md           # This file
```

## Browser Compatibility

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- **Initial Load:** < 1s (no heavy frameworks)
- **Data Refresh:** 30s interval (configurable)
- **Bundle Size:** < 30KB total (HTML + CSS + JS)

## Future Enhancements (Phase 2+)

### Phase 2: Enhanced Visualizations
- [ ] Chart.js for trend graphs
- [ ] Historical cache hit rate trends (7-day view)
- [ ] Latency trend charts
- [ ] Time range selector (1h/6h/24h/7d)
- [ ] Export data (CSV/JSON)

### Phase 3: Advanced Features
- [ ] Real-time WebSocket updates (via `/ws/progress` pattern)
- [ ] Alert configuration UI
- [ ] Mobile-optimized views
- [ ] ISBNdb harvest progress tracking
- [ ] Per-prefix cache stats (book/author/cover)

## Troubleshooting

### Dashboard shows all "--" values
**Cause:** API endpoints not responding or CORS issue

**Fix:**
1. Check API health: `curl https://api.oooefam.net/health`
2. Verify CORS headers in browser DevTools
3. Check Cloudflare Workers status

### Auto-refresh not working
**Cause:** JavaScript timer stopped or browser tab inactive

**Fix:**
1. Manually refresh the page
2. Check browser console for errors
3. Toggle auto-refresh off and back on

### Metrics are stale
**Cause:** Cache TTL on `/metrics` endpoint (5 minutes)

**Fix:**
- Wait up to 5 minutes for fresh data
- Metrics are cached for performance

## Support

For issues or feature requests:
- Create an issue in the repository
- Tag with `component: dashboard` label
- Reference this README

## License

MIT - Same as BooksTrack Backend
