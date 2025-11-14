#!/bin/bash

# Fix Wrangler Commands Across Documentation
# Updates all wrangler commands to use npx and correct --remote flag usage
# Based on Wrangler v4.37+ standards

set -e

echo "🔧 Fixing Wrangler Commands (Wrangler v4.37+ Standards)"
echo "======================================================="
echo ""

# Backup original files
BACKUP_DIR=".wrangler-fixes-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo "📦 Creating backup in $BACKUP_DIR..."

# Find all markdown files
MD_FILES=$(find . -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*" -not -path "$BACKUP_DIR/*")

# Count files to process
TOTAL_FILES=$(echo "$MD_FILES" | wc -l | tr -d ' ')
PROCESSED=0
CHANGED=0

echo "📄 Found $TOTAL_FILES markdown files to process"
echo ""

for file in $MD_FILES; do
  PROCESSED=$((PROCESSED + 1))
  echo -n "[$PROCESSED/$TOTAL_FILES] Processing: $file... "

  # Backup original
  cp "$file" "$BACKUP_DIR/$(basename $file).bak"

  # Create temporary file for changes
  TMP_FILE=$(mktemp)
  cp "$file" "$TMP_FILE"

  FILE_CHANGED=false

  # Fix 1: Add npx prefix to wrangler commands (except in comments and backticks contexts)
  # This handles: "wrangler deploy" -> "npx wrangler deploy"
  if grep -q "^wrangler \|[^x] wrangler \|^\`wrangler " "$TMP_FILE"; then
    sed -i.tmp -E '
      # Skip comment lines
      /^[[:space:]]*#/b
      # Add npx to standalone wrangler commands
      s/^wrangler /npx wrangler /g
      s/([^x]) wrangler /\1 npx wrangler /g
      s/^`wrangler /`npx wrangler /g
    ' "$TMP_FILE"
    rm -f "$TMP_FILE.tmp"
    FILE_CHANGED=true
  fi

  # Fix 2: Remove --remote from secret list (now defaults to remote)
  if grep -q "npx wrangler secret list --remote" "$TMP_FILE"; then
    sed -i.tmp 's/npx wrangler secret list --remote/npx wrangler secret list/g' "$TMP_FILE"
    rm -f "$TMP_FILE.tmp"
    FILE_CHANGED=true
  fi

  # Fix 3: Remove --remote from KV commands (now use binding config)
  if grep -q "npx wrangler kv.*--remote" "$TMP_FILE"; then
    sed -i.tmp 's/npx wrangler kv:\(key\|bulk\) \(list\|get\|put\|delete\) --remote/npx wrangler kv:\1 \2/g' "$TMP_FILE"
    sed -i.tmp 's/npx wrangler kv \(key\|bulk\) \(list\|get\|put\|delete\) --remote/npx wrangler kv \1 \2/g' "$TMP_FILE"
    rm -f "$TMP_FILE.tmp"
    FILE_CHANGED=true
  fi

  # Fix 4: Remove --remote from deployments list (now defaults to remote)
  if grep -q "npx wrangler deployments list --remote" "$TMP_FILE"; then
    sed -i.tmp 's/npx wrangler deployments list --remote/npx wrangler deployments list/g' "$TMP_FILE"
    rm -f "$TMP_FILE.tmp"
    FILE_CHANGED=true
  fi

  # Fix 5: Ensure tail ALWAYS has --remote (only command that needs it)
  if grep -q "npx wrangler tail[^-]" "$TMP_FILE" || grep -q "npx wrangler tail$" "$TMP_FILE"; then
    sed -i.tmp -E 's/(npx wrangler tail)([^-]|$)/\1 --remote\2/g' "$TMP_FILE"
    rm -f "$TMP_FILE.tmp"
    FILE_CHANGED=true
  fi

  # Fix 6: Replace wrangler dev --remote with note about config
  if grep -q "npx wrangler dev --remote" "$TMP_FILE"; then
    sed -i.tmp 's/npx wrangler dev --remote/npx wrangler dev  # DEPRECATED: Use remote: true in wrangler.toml/g' "$TMP_FILE"
    rm -f "$TMP_FILE.tmp"
    FILE_CHANGED=true
  fi

  # Fix 7: Remove --remote from analytics queries
  if grep -q "npx wrangler.*analytics.*--remote" "$TMP_FILE"; then
    sed -i.tmp 's/\(npx wrangler.*analytics[^"]*\)--remote/\1/g' "$TMP_FILE"
    rm -f "$TMP_FILE.tmp"
    FILE_CHANGED=true
  fi

  # If file changed, save it
  if [ "$FILE_CHANGED" = true ]; then
    mv "$TMP_FILE" "$file"
    CHANGED=$((CHANGED + 1))
    echo "✅ Fixed"
  else
    rm "$TMP_FILE"
    echo "⏭️  No changes needed"
  fi
done

echo ""
echo "======================================================="
echo "✨ Complete!"
echo ""
echo "📊 Summary:"
echo "   - Total files processed: $TOTAL_FILES"
echo "   - Files changed: $CHANGED"
echo "   - Files unchanged: $((TOTAL_FILES - CHANGED))"
echo ""
echo "💾 Backups saved to: $BACKUP_DIR"
echo ""
echo "🔍 Review changes with:"
echo "   git diff"
echo ""
echo "↩️  To rollback all changes:"
echo "   ./rollback-wrangler-fixes.sh $BACKUP_DIR"
echo ""

# Create rollback script
cat > rollback-wrangler-fixes.sh << 'ROLLBACK_EOF'
#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./rollback-wrangler-fixes.sh <backup-dir>"
  exit 1
fi

BACKUP_DIR="$1"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "Error: Backup directory not found: $BACKUP_DIR"
  exit 1
fi

echo "🔄 Rolling back wrangler fixes..."
echo ""

for backup_file in "$BACKUP_DIR"/*.bak; do
  original_file=$(basename "$backup_file" .bak)
  # Find original file location
  original_path=$(find . -name "$original_file" -not -path "./node_modules/*" -not -path "./.git/*" | head -n 1)

  if [ -n "$original_path" ]; then
    echo "↩️  Restoring: $original_path"
    cp "$backup_file" "$original_path"
  fi
done

echo ""
echo "✅ Rollback complete!"
ROLLBACK_EOF

chmod +x rollback-wrangler-fixes.sh

echo "✅ Created rollback script: ./rollback-wrangler-fixes.sh"
echo ""
