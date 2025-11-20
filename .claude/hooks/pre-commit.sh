#!/bin/bash

# BooksTrack Backend Pre-Commit Hook
# Runs code quality checks before allowing commits

set -e

echo "🤖 Running pre-commit checks..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track if any checks fail
FAILED=0

# 1. Check for sensitive files
echo "🔐 Checking for sensitive files..."
SENSITIVE_FILES=(
  ".dev.vars"
  ".env"
  ".env.local"
  "wrangler.toml.local"
  "*credentials*.json"
  "*secret*.json"
)

for pattern in "${SENSITIVE_FILES[@]}"; do
  if git diff --cached --name-only | grep -qF "$pattern"; then
    echo -e "${RED}✗ Blocked: Attempting to commit sensitive file matching '$pattern'${NC}"
    FAILED=1
  fi
done

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ No sensitive files detected${NC}"
fi

# 2. Check for hardcoded secrets
echo "🔑 Checking for hardcoded secrets..."
SECRET_PATTERNS=(
  "GOOGLE_BOOKS_API_KEY.*['\"]AIza[A-Za-z0-9_-]{35}['\"]"
  "GEMINI_API_KEY.*['\"]AIza[A-Za-z0-9_-]{35}['\"]"
  "ISBNDB_API_KEY.*['\"][A-Za-z0-9_-]{32}['\"]"
  "Bearer [A-Za-z0-9_-]{20,}"
  "password.*['\"][^'\"]{8,}['\"]"
)

for pattern in "${SECRET_PATTERNS[@]}"; do
  if git diff --cached | grep -iE "$pattern" > /dev/null; then
    echo -e "${RED}✗ Blocked: Potential hardcoded secret detected${NC}"
    echo "  Pattern: $pattern"
    FAILED=1
  fi
done

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ No hardcoded secrets detected${NC}"
fi

# 3. Check for debug statements
echo "🐛 Checking for debug statements..."
DEBUG_PATTERNS=(
  "console\.log\("
  "console\.debug\("
  "debugger;"
)

DEBUG_COUNT=0
for pattern in "${DEBUG_PATTERNS[@]}"; do
  count=$(git diff --cached | grep -c "$pattern" || true)
  DEBUG_COUNT=$((DEBUG_COUNT + count))
done

if [ $DEBUG_COUNT -gt 0 ]; then
  echo -e "${YELLOW}⚠ Warning: Found $DEBUG_COUNT debug statement(s)${NC}"
  echo "  Consider removing before production deployment"
fi

# 4. Run Prettier formatting check (if installed)
if command -v npx &> /dev/null && [ -f "package.json" ]; then
  echo "✨ Checking code formatting..."

  # Get list of staged JS files
  STAGED_JS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|mjs|cjs)$' || true)

  if [ -n "$STAGED_JS" ]; then
    if ! npx prettier --check $STAGED_JS 2>/dev/null; then
      echo -e "${YELLOW}⚠ Warning: Code formatting issues detected${NC}"
      echo "  Run: npx prettier --write $STAGED_JS"
      echo "  Or: npm run format (if configured)"
    else
      echo -e "${GREEN}✓ Code formatting looks good${NC}"
    fi
  fi
fi

# 5. Run basic JavaScript syntax check
echo "📝 Checking JavaScript syntax..."
STAGED_JS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|mjs|cjs)$' || true)

if [ -n "$STAGED_JS" ]; then
  for file in $STAGED_JS; do
    if [ -f "$file" ]; then
      if ! node --check "$file" 2>/dev/null; then
        echo -e "${RED}✗ Syntax error in: $file${NC}"
        FAILED=1
      fi
    fi
  done

  if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ JavaScript syntax valid${NC}"
  fi
fi

# 6. Check wrangler.toml validity (if modified)
if git diff --cached --name-only | grep -q "wrangler.toml"; then
  echo "⚙️  Checking wrangler.toml validity..."

  if command -v npx &> /dev/null; then
    if npx wrangler publish --dry-run --outdir=.wrangler-test 2>&1 | grep -q "error"; then
      echo -e "${RED}✗ Invalid wrangler.toml configuration${NC}"
      FAILED=1
    else
      echo -e "${GREEN}✓ wrangler.toml is valid${NC}"
      rm -rf .wrangler-test
    fi
  fi
fi

# 7. Check for large files
echo "📦 Checking file sizes..."
LARGE_FILES=$(git diff --cached --name-only --diff-filter=ACM | while read file; do
  if [ -f "$file" ]; then
    size=$(wc -c < "$file")
    if [ $size -gt 1048576 ]; then # 1MB
      echo "$file ($(numfmt --to=iec-i --suffix=B $size))"
    fi
  fi
done)

if [ -n "$LARGE_FILES" ]; then
  echo -e "${YELLOW}⚠ Warning: Large files detected:${NC}"
  echo "$LARGE_FILES"
  echo "  Consider using Cloudflare R2 for large assets"
fi

# 8. Verify test files exist for new handlers
echo "🧪 Checking test coverage..."
NEW_HANDLERS=$(git diff --cached --name-only --diff-filter=A | grep "src/handlers/.*\.js$" || true)

if [ -n "$NEW_HANDLERS" ]; then
  for handler in $NEW_HANDLERS; do
    test_file=$(echo "$handler" | sed 's|src/|test/|' | sed 's|\.js$|.test.js|')

    if [ ! -f "$test_file" ]; then
      echo -e "${YELLOW}⚠ Warning: No test file for new handler: $handler${NC}"
      echo "  Expected: $test_file"
    fi
  done
fi

# 9. Check API endpoint documentation
if git diff --cached --name-only | grep -qE "src/handlers/|src/index.js"; then
  echo "📚 Checking API documentation..."

  if git diff --cached --name-only | grep -q "docs/API_README.md"; then
    echo -e "${GREEN}✓ API documentation updated${NC}"
  else
    echo -e "${YELLOW}⚠ Warning: Handler changes without API doc updates${NC}"
    echo "  Consider updating docs/API_README.md"
  fi
fi

# Final result
echo ""
if [ $FAILED -eq 1 ]; then
  echo -e "${RED}❌ Pre-commit checks failed. Commit blocked.${NC}"
  echo "  Fix the errors above and try again."
  exit 1
else
  echo -e "${GREEN}✅ All pre-commit checks passed!${NC}"
  exit 0
fi
