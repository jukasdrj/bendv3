#!/bin/bash
# Simple R2 bucket cleanup script
# This script provides manual commands since wrangler doesn't support batch deletion

BUCKETS=(
  "bookstrack-covers-processed"
  "cloudflare-managed-ea345b39"
)

echo "🚨 R2 Bucket Cleanup Instructions"
echo "=================================="
echo ""
echo "Wrangler doesn't support batch deletion of R2 objects."
echo "You must use the Cloudflare Dashboard to empty these buckets:"
echo ""

for bucket in "${BUCKETS[@]}"; do
  echo "📦 $bucket"
done

echo ""
echo "Steps:"
echo "1. Go to: https://dash.cloudflare.com/d03bed0be6d976acd8a1707b55052f79/r2/buckets"
echo "2. For each bucket:"
echo "   - Click on the bucket name"
echo "   - Select all objects (may need to do in batches)"
echo "   - Click 'Delete' button"
echo "   - Confirm deletion"
echo "3. Once empty, run these commands:"
echo ""

for bucket in "${BUCKETS[@]}"; do
  echo "   npx wrangler r2 bucket delete $bucket"
done

echo ""
echo "Or wait for this script to check if buckets can be deleted..."
echo ""

# Try to delete buckets (will fail if not empty)
for bucket in "${BUCKETS[@]}"; do
  echo "Attempting to delete $bucket..."
  if npx wrangler r2 bucket delete "$bucket" 2>&1 | grep -q "not empty"; then
    echo "❌ $bucket is not empty - must empty via dashboard first"
  else
    echo "✅ $bucket deleted successfully"
  fi
  echo ""
done
