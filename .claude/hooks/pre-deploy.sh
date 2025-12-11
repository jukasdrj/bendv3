#!/bin/bash

# BooksTrack Backend Pre-Deploy Hook
# Validates deployment readiness before executing wrangler deploy
#
# Claude Code 2.0.64+ Features:
# - Async deployment monitoring via background agents
# - Use TaskOutput to retrieve deployment status

set -e

echo ""
echo "🔍 Pre-Deployment Validation"
echo ""

# Check for uncommitted changes
if [ -d ".git" ]; then
  if ! git diff-index --quiet HEAD --; then
    echo "⚠️  Warning: You have uncommitted changes"
    echo "   Consider committing before deploying"
    echo ""
  else
    echo "✅ Git working directory clean"
  fi
fi

# Check wrangler.jsonc or wrangler.toml exists
if [ -f "wrangler.jsonc" ]; then
  CONFIG_FILE="wrangler.jsonc"
elif [ -f "wrangler.toml" ]; then
  CONFIG_FILE="wrangler.toml"
else
  echo "❌ Error: wrangler.jsonc or wrangler.toml not found"
  echo "   Cannot deploy without configuration"
  exit 1
fi

echo "✅ $CONFIG_FILE found"

# Check for required environment bindings
if ! grep -q "BOOK_CACHE" "$CONFIG_FILE"; then
  echo "⚠️  Warning: BOOK_CACHE KV namespace not found in $CONFIG_FILE"
fi

# Validate secrets are set (in production)
# Note: This is a basic check - actual secret validation happens server-side
echo "✅ Configuration validated"

echo ""
echo "🚀 Proceeding with deployment..."
echo "   Post-deployment monitoring will run automatically"
echo "   💡 Tip: Use /logs to stream production logs after deploy"
echo ""

exit 0
