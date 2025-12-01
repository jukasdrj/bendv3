#!/bin/bash
#
# CACHE PURGE - Nuclear Option for Old Pre-Alexandria Cache
# Deletes all cover and ISBN caches to force Alexandria integration
#

set -e

cd "$(dirname "$0")/.."

echo "🔥 CACHE PURGE INITIATED"
echo "========================"
echo ""

# Function to delete all keys with a prefix
delete_with_prefix() {
    local prefix=$1
    local name=$2
    
    echo "🗑️  Deleting $name..."
    
    # Get all keys
    keys=$(npx wrangler kv key list --binding=CACHE --prefix="$prefix" --remote 2>/dev/null)
    count=$(echo "$keys" | python3 -c "import json, sys; data=json.load(sys.stdin); print(len(data))")
    
    if [ "$count" -eq "0" ]; then
        echo "   ✓ No entries found (already clean)"
        return
    fi
    
    echo "   Found $count entries to delete..."
    
    # Extract key names and delete each one
    echo "$keys" | python3 -c "
import json, sys, subprocess
data = json.load(sys.stdin)
for i, item in enumerate(data, 1):
    key = item['name']
    print(f'   Deleting {i}/{len(data)}: {key[:50]}...')
    result = subprocess.run(
        ['npx', 'wrangler', 'kv', 'key', 'delete', '--binding=CACHE', '--remote', key],
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(f'   ❌ Failed: {result.stderr}')
    else:
        print(f'   ✓ Deleted')
"
    
    echo "   ✅ $name purge complete!"
    echo ""
}

# Delete all patterns
delete_with_prefix "search:isbn:" "ISBN caches"
delete_with_prefix "cover:" "Cover caches"
delete_with_prefix "search:title:" "Title caches"
delete_with_prefix "auto-search:" "Author caches"

echo "✅ CACHE PURGE COMPLETE!"
echo ""
echo "Next steps:"
echo "1. Test fresh ISBN lookups"
echo "2. Verify Alexandria URLs in responses"
echo "3. Monitor cache warming from real requests"
