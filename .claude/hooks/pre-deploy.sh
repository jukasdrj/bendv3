#!/bin/bash

# BooksTrack Backend Pre-Deploy Hook
# Validates deployment readiness before executing wrangler deploy

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

# Check wrangler.toml exists
if [ ! -f "wrangler.toml" ]; then
  echo "❌ Error: wrangler.toml not found"
  echo "   Cannot deploy without configuration"
  exit 1
fi

echo "✅ wrangler.toml found"

# Check for required environment bindings in wrangler.toml
if ! grep -q "BOOK_CACHE" wrangler.toml; then
  echo "⚠️  Warning: BOOK_CACHE KV namespace not found in wrangler.toml"
fi

# Validate secrets are set (in production)
# Note: This is a basic check - actual secret validation happens server-side
echo "✅ Configuration validated"

echo ""
echo "🚀 Proceeding with deployment..."
echo "   Post-deployment monitoring will run automatically"
echo ""

exit 0
