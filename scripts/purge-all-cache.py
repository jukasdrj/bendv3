#!/usr/bin/env python3
"""
CACHE NUCLEAR OPTION - Delete ALL cover and ISBN caches
Run with: python3 scripts/purge-all-cache.py
"""

import json
import subprocess
import sys

def run_command(cmd):
    """Run shell command and return output"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout, result.stderr, result.returncode

def delete_with_prefix(prefix, name):
    """Delete all KV keys with given prefix"""
    print(f"\n🗑️  Purging {name}...")
    
    # Get all keys
    cmd = f'cd /Users/juju/dev_repos/bendv3 && npx wrangler kv key list --binding=CACHE --prefix="{prefix}" --remote 2>/dev/null'
    stdout, stderr, code = run_command(cmd)
    
    if code != 0:
        print(f"   ❌ Failed to list keys: {stderr}")
        return 0
    
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        print(f"   ❌ Failed to parse JSON")
        return 0
    
    count = len(data)
    if count == 0:
        print(f"   ✓ Already clean (0 entries)")
        return 0
    
    print(f"   Found {count} entries - deleting...")
    
    deleted = 0
    for i, item in enumerate(data, 1):
        key = item['name']
        if i % 50 == 0 or i == count:
            print(f"   Progress: {i}/{count} ({int(i/count*100)}%)")
        
        delete_cmd = f'cd /Users/juju/dev_repos/bendv3 && npx wrangler kv key delete --binding=CACHE --remote "{key}" 2>/dev/null'
        _, _, code = run_command(delete_cmd)
        
        if code == 0:
            deleted += 1
    
    print(f"   ✅ Deleted {deleted}/{count} entries")
    return deleted

def main():
    print("🔥 CACHE NUCLEAR PURGE INITIATED")
    print("=" * 50)
    
    total_deleted = 0
    
    # Delete all cache patterns
    total_deleted += delete_with_prefix("search:isbn:", "ISBN caches")
    total_deleted += delete_with_prefix("cover:", "Cover caches")
    total_deleted += delete_with_prefix("search:title:", "Title caches")
    total_deleted += delete_with_prefix("auto-search:", "Author caches")
    
    print(f"\n✅ PURGE COMPLETE!")
    print(f"   Total deleted: {total_deleted} cache entries")
    print(f"\nNext steps:")
    print(f"  1. Test fresh ISBN lookups")
    print(f"  2. Verify Alexandria URLs in responses")
    print(f"  3. All future lookups will be fresh through Alexandria!")

if __name__ == "__main__":
    main()
