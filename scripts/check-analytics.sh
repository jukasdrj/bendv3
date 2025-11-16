#!/bin/bash
#
# BooksTrack Analytics Health Check
#
# Simple monitoring script that combines:
# 1. Live tail for real-time errors
# 2. Cloudflare Dashboard metrics access instructions
# 3. Health endpoint check
#

set -e

echo "📊 BooksTrack Production Monitoring"
echo "===================================="
echo ""

# 1. Health Check
echo "🏥 Health Status:"
echo "----------------"
HEALTH=$(curl -s https://api.oooefam.net/health | jq '.' 2>/dev/null || echo '{"status":"unknown"}')
echo "$HEALTH" | jq '.'
echo ""

# 2. Quick Error Scan (10 seconds of live tail)
echo "🔍 Live Error Scan (10 seconds):"
echo "--------------------------------"
echo "Streaming production logs..."
timeout 10 npx wrangler tail --format pretty 2>&1 | grep -i "error\|fail\|exception" || echo "✅ No errors detected in sample"
echo ""

# 3. Analytics Access Guide
echo "📈 Analytics Engine Data:"
echo "------------------------"
echo "Analytics Engine datasets are write-only from Workers."
echo "To query historical data, use:"
echo ""
echo "1. Cloudflare Dashboard:"
echo "   https://dash.cloudflare.com/"
echo "   → Workers & Pages → api-worker → Analytics"
echo ""
echo "2. GraphQL API (requires API token):"
echo "   See: docs/deployment/MONITORING_DASHBOARD.md"
echo ""
echo "3. Available datasets:"
echo "   - books_api_performance"
echo "   - books_api_cache_metrics"
echo "   - books_api_provider_performance"
echo "   - bookshelf_ai_performance"
echo "   - books_api_sampling_metrics"
echo ""

# 4. Key Metrics Summary
echo "📊 Key Metrics (from Dashboard):"
echo "--------------------------------"
echo "To view these metrics, visit the Cloudflare Dashboard and run:"
echo ""
echo "Request Volume (last 24h):"
echo "  SELECT COUNT(*) FROM books_api_performance"
echo "  WHERE timestamp > NOW() - INTERVAL 24 HOUR"
echo ""
echo "Error Rate:"
echo "  SELECT"
echo "    (SUM(CASE WHEN double1 >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as error_rate"
echo "  FROM books_api_performance"
echo "  WHERE timestamp > NOW() - INTERVAL 1 HOUR"
echo ""
echo "P95 Latency:"
echo "  SELECT QUANTILE(double2, 0.95) as p95_latency"
echo "  FROM books_api_performance"
echo "  WHERE timestamp > NOW() - INTERVAL 1 HOUR"
echo ""
echo "Cache Hit Rate:"
echo "  SELECT"
echo "    blob3 as cache_status,"
echo "    COUNT(*) as requests"
echo "  FROM books_api_performance"
echo "  WHERE timestamp > NOW() - INTERVAL 1 HOUR"
echo "  GROUP BY blob3"
echo ""

echo "💡 Quick Commands:"
echo "----------------"
echo "  npx wrangler tail                # Live logs"
echo "  /logs                            # Slash command"
echo "  /deploy                          # Deploy with monitoring"
echo "  curl https://api.oooefam.net/health  # Health check"
echo ""
