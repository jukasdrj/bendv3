#!/bin/bash
# API Contract Sync Checker
# Ensures API_CONTRACT.md, openapi.yaml, and TypeScript types stay in sync

set -e

echo "🔍 Checking API documentation sync..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Check if files exist
if [ ! -f "docs/API_CONTRACT.md" ]; then
  echo -e "${RED}❌ ERROR: docs/API_CONTRACT.md not found${NC}"
  exit 1
fi

if [ ! -f "docs/openapi.yaml" ]; then
  echo -e "${RED}❌ ERROR: docs/openapi.yaml not found${NC}"
  exit 1
fi

if [ ! -f "src/types/websocket-messages.ts" ]; then
  echo -e "${RED}❌ ERROR: src/types/websocket-messages.ts not found${NC}"
  exit 1
fi

# 1. Check version consistency
echo "📋 Checking version consistency..."
CONTRACT_VERSION=$(grep -m 1 "^# BooksTrack API Contract" docs/API_CONTRACT.md | grep -oP 'v\d+\.\d+(\.\d+)?' || echo "")
OPENAPI_VERSION=$(grep -m 1 "  version:" docs/openapi.yaml | grep -oP '\d+\.\d+(\.\d+)?' || echo "")

if [ -z "$CONTRACT_VERSION" ]; then
  echo -e "${YELLOW}⚠️  WARNING: Could not extract version from API_CONTRACT.md${NC}"
  ((WARNINGS++))
elif [ -z "$OPENAPI_VERSION" ]; then
  echo -e "${YELLOW}⚠️  WARNING: Could not extract version from openapi.yaml${NC}"
  ((WARNINGS++))
elif [ "$CONTRACT_VERSION" != "v$OPENAPI_VERSION" ]; then
  echo -e "${RED}❌ ERROR: Version mismatch!${NC}"
  echo "  API_CONTRACT.md: $CONTRACT_VERSION"
  echo "  openapi.yaml: v$OPENAPI_VERSION"
  ((ERRORS++))
else
  echo -e "${GREEN}✓${NC} Versions match: $CONTRACT_VERSION"
fi

# 2. Check if job_complete schema exists in all files
echo "📋 Checking job_complete schema consistency..."
if grep -q "JobCompletePayload" docs/API_CONTRACT.md; then
  if ! grep -q "JobCompletePayload" docs/openapi.yaml; then
    echo -e "${RED}❌ ERROR: JobCompletePayload in contract but missing in OpenAPI${NC}"
    ((ERRORS++))
  else
    echo -e "${GREEN}✓${NC} JobCompletePayload exists in OpenAPI"
  fi

  if ! grep -q "export.*JobCompletePayload" src/types/websocket-messages.ts; then
    echo -e "${RED}❌ ERROR: JobCompletePayload in contract but missing in TypeScript${NC}"
    ((ERRORS++))
  else
    echo -e "${GREEN}✓${NC} JobCompletePayload exists in TypeScript"
  fi
fi

# 3. Check summary-only format (v2.0 breaking change)
echo "📋 Checking summary-only format consistency..."
if grep -q "summary-only\|Summary-Only" docs/API_CONTRACT.md; then
  if ! grep -q "JobCompletionSummary" docs/openapi.yaml; then
    echo -e "${RED}❌ ERROR: Contract mentions summary-only but OpenAPI missing JobCompletionSummary${NC}"
    ((ERRORS++))
  else
    echo -e "${GREEN}✓${NC} JobCompletionSummary exists in OpenAPI"
  fi

  if ! grep -q "JobCompletionSummary" src/types/websocket-messages.ts; then
    echo -e "${RED}❌ ERROR: Contract mentions summary-only but TypeScript missing JobCompletionSummary${NC}"
    ((ERRORS++))
  else
    echo -e "${GREEN}✓${NC} JobCompletionSummary exists in TypeScript"
  fi
fi

# 4. Check expiresAt field
echo "📋 Checking expiresAt field consistency..."
CONTRACT_EXPIRES=$(grep -c "expiresAt" docs/API_CONTRACT.md || echo "0")
OPENAPI_EXPIRES=$(grep -c "expiresAt" docs/openapi.yaml || echo "0")
TS_EXPIRES=$(grep -c "expiresAt" src/types/websocket-messages.ts || echo "0")

if [ "$CONTRACT_EXPIRES" -gt "0" ]; then
  if [ "$OPENAPI_EXPIRES" -eq "0" ]; then
    echo -e "${RED}❌ ERROR: expiresAt in contract but missing in OpenAPI${NC}"
    ((ERRORS++))
  else
    echo -e "${GREEN}✓${NC} expiresAt exists in OpenAPI ($OPENAPI_EXPIRES mentions)"
  fi

  if [ "$TS_EXPIRES" -eq "0" ]; then
    echo -e "${RED}❌ ERROR: expiresAt in contract but missing in TypeScript${NC}"
    ((ERRORS++))
  else
    echo -e "${GREEN}✓${NC} expiresAt exists in TypeScript ($TS_EXPIRES mentions)"
  fi
fi

# 5. Check pipeline-specific payloads
echo "📋 Checking pipeline-specific payload schemas..."
for PIPELINE in "CSVImport" "BatchEnrichment" "AIScan"; do
  PAYLOAD_NAME="${PIPELINE}CompletePayload"

  if grep -q "$PAYLOAD_NAME" docs/API_CONTRACT.md; then
    if ! grep -q "$PAYLOAD_NAME" docs/openapi.yaml; then
      echo -e "${YELLOW}⚠️  WARNING: $PAYLOAD_NAME in contract but missing in OpenAPI${NC}"
      ((WARNINGS++))
    else
      echo -e "${GREEN}✓${NC} $PAYLOAD_NAME exists in OpenAPI"
    fi

    if ! grep -q "export.*$PAYLOAD_NAME" src/types/websocket-messages.ts; then
      echo -e "${YELLOW}⚠️  WARNING: $PAYLOAD_NAME in contract but missing in TypeScript${NC}"
      ((WARNINGS++))
    else
      echo -e "${GREEN}✓${NC} $PAYLOAD_NAME exists in TypeScript"
    fi
  fi
done

# 6. Check if files were modified together
echo "📋 Checking if modified files are in sync..."
if git rev-parse --git-dir > /dev/null 2>&1; then
  # In a git repo
  STAGED_FILES=$(git diff --cached --name-only)

  if echo "$STAGED_FILES" | grep -q "docs/API_CONTRACT.md"; then
    if ! echo "$STAGED_FILES" | grep -q "docs/openapi.yaml"; then
      echo -e "${YELLOW}⚠️  WARNING: API_CONTRACT.md staged but openapi.yaml not staged${NC}"
      echo "   Consider if OpenAPI spec needs updating too."
      ((WARNINGS++))
    fi
  fi

  if echo "$STAGED_FILES" | grep -q "docs/openapi.yaml"; then
    if ! echo "$STAGED_FILES" | grep -q "docs/API_CONTRACT.md"; then
      echo -e "${YELLOW}⚠️  WARNING: openapi.yaml staged but API_CONTRACT.md not staged${NC}"
      echo "   Consider if contract documentation needs updating too."
      ((WARNINGS++))
    fi
  fi

  if echo "$STAGED_FILES" | grep -q "src/types/websocket-messages.ts"; then
    if ! echo "$STAGED_FILES" | grep -q "docs/API_CONTRACT.md"; then
      echo -e "${YELLOW}⚠️  WARNING: websocket-messages.ts staged but API_CONTRACT.md not staged${NC}"
      echo "   If you changed the API, update the contract documentation."
      ((WARNINGS++))
    fi
  fi
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}✅ All API sync checks passed!${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}⚠️  Sync check passed with $WARNINGS warning(s)${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  echo -e "${RED}❌ Sync check FAILED with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Fix the errors above before committing."
  echo "API_CONTRACT.md, openapi.yaml, and TypeScript types MUST stay in sync."
  exit 1
fi
