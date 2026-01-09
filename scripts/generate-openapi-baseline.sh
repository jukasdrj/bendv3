#!/bin/bash
# Generate V3 OpenAPI baseline from running dev server
#
# Usage:
#   npm run generate:openapi
#   bash scripts/generate-openapi-baseline.sh
#
# This script:
# 1. Starts wrangler dev server in background
# 2. Waits for server to be ready
# 3. Fetches /v3/openapi.json
# 4. Saves to docs/v3-openapi-baseline.json
# 5. Cleans up the dev server

set -e

# Build schemas first (required for OpenAPI generation)
echo "📦 Building @bookstrack/schemas package..."
npm run build -w packages/schemas > /dev/null 2>&1

echo "🚀 Starting Wrangler dev server..."
# Use test config for consistency with CI
npx wrangler dev --port 8788 --local --config wrangler.test.jsonc > /tmp/wrangler-dev.log 2>&1 &
WRANGLER_PID=$!
echo "   Wrangler PID: $WRANGLER_PID"
echo "   Logs: /tmp/wrangler-dev.log"

# Cleanup function
cleanup() {
  echo "🧹 Cleaning up..."
  kill $WRANGLER_PID 2>/dev/null || true
  pkill -f "wrangler dev" 2>/dev/null || true
}

# Ensure cleanup on exit
trap cleanup EXIT

# Wait for server to be ready (max 60 seconds - extended for slower machines)
echo "⏳ Waiting for dev server to start..."
for i in {1..60}; do
  if curl -s http://localhost:8788/health > /dev/null 2>&1; then
    echo "✅ Dev server is ready!"
    break
  fi

  if [ $i -eq 60 ]; then
    echo "❌ Dev server failed to start within 60 seconds"
    echo "   Try manually starting wrangler dev:"
    echo "   npx wrangler dev --port 8788 --local"
    exit 1
  fi

  # Show progress every 10 seconds
  if [ $(( $i % 10 )) -eq 0 ]; then
    echo "   Still waiting... ($i/60)"
  fi

  sleep 1
done

# Fetch OpenAPI spec
echo "📥 Fetching V3 OpenAPI spec from /v3/openapi.json..."
if curl -f http://localhost:8788/v3/openapi.json > docs/v3-openapi-baseline.json 2>/dev/null; then
  echo "✅ Baseline spec saved to docs/v3-openapi-baseline.json"

  # Show summary
  echo ""
  echo "📊 Spec summary:"
  cat docs/v3-openapi-baseline.json | jq '{
    openapi: .openapi,
    version: .info.version,
    title: .info.title,
    endpoint_count: (.paths | keys | length)
  }'

  echo ""
  echo "✅ Done! You can now run contract checks with:"
  echo "   npm run detect-breaking-changes"
else
  echo "❌ Failed to fetch OpenAPI spec from dev server"
  exit 1
fi
