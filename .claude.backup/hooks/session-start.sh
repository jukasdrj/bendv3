#!/bin/bash

# BooksTrack Backend Session Start Hook
# Validates environment and displays project context
#
# Claude Code 2.0.64+ Features:
# - Named sessions: /rename to name, /resume <name> to continue
# - Session stats: /stats for usage statistics
# - Instant auto-compacting for long sessions

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
if [ -f "wrangler.jsonc" ] || [ -f "wrangler.toml" ]; then
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
  echo "   /rollback    - Rollback to previous deployment"
  echo "   /cache-check - Analyze cache performance"
  echo ""
  echo "🤖 Agents:"
  echo "   @cf-ops-monitor   - Deployment & observability"
  echo "   @cf-code-reviewer - Code quality review"
  echo ""
  echo "📝 Session Management (v2.0.64+):"
  echo "   /rename <name>  - Name this session for easy resume"
  echo "   /resume <name>  - Resume a named session"
  echo "   /stats          - View your Claude Code usage stats"
  echo "   Alt+P / Opt+P   - Switch models while typing"
  echo ""
else
  echo "ℹ️  Not in BooksTrack project root (wrangler.jsonc not found)"
  echo ""
fi

exit 0
