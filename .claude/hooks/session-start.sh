#!/bin/bash

# BooksTrack Backend Session Start Hook
# Validates environment and displays project context

set -e

echo ""
echo "🚀 BooksTrack Backend - Cloudflare Workers API"
echo "   Production: https://api.oooefam.net"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
  echo "⚠️  Warning: wrangler CLI not found. Install with: npm install -g wrangler"
  echo ""
fi

# Check for required secrets (if in project directory)
if [ -f "wrangler.toml" ]; then
  echo "✅ Project configuration detected"

  # Check if we're in development mode
  if [ -f ".dev.vars" ]; then
    echo "✅ Development secrets configured (.dev.vars)"
  fi

  echo ""
  echo "📋 Quick Reference:"
  echo "   /deploy      - Deploy to production with monitoring"
  echo "   /review      - Review code for Workers best practices"
  echo "   /logs        - Stream production logs"
  echo "   @cf-ops-monitor - Deployment & observability agent"
  echo "   @cf-code-reviewer - Code quality agent"
  echo ""
else
  echo "ℹ️  Not in BooksTrack project root (wrangler.toml not found)"
  echo ""
fi

exit 0
