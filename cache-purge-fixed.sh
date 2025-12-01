#!/bin/bash
###############################################################################
# CACHE PURGE SCRIPT - Alexandria Integration (CORRECTED SYNTAX)
# Mission: Delete old pre-integration cache entries
# Execution: bash cache-purge-fixed.sh
###############################################################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Target ISBNs with old cache
TARGET_ISBNS=(
  "9780525540670"
  "9780802158741"
  "9780593230388"
  "9780593733257"
  "9780593653227"
  "9780063277050"
  "9780593657225"
  "9781250391230"
  "9780593318256"
  "9781668034347"
  "9781945492600"
  "9781324086031"
  "9780802161543"
  "9781668063606"
  "9781250827951"
  "9781982116521"
  "9780141441160"
  "9781982150921"
)

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚨 CACHE PURGE INITIATED${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "⏰ Start Time: $(date)"
echo -e "📋 Target ISBNs: ${#TARGET_ISBNS[@]}"
echo ""

DELETED=0
NOT_FOUND=0
ERRORS=0

for isbn in "${TARGET_ISBNS[@]}"; do
  # Generate cache key (matches CacheKeyFactory.bookISBN format)
  CACHE_KEY="search:isbn:isbn=${isbn}"
  
  echo -e "${YELLOW}📚 Processing: ${isbn}${NC}"
  
  # Delete the cache key using correct Wrangler v4 syntax
  OUTPUT=$(npx wrangler kv key delete "${CACHE_KEY}" --binding CACHE 2>&1)
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -eq 0 ]; then
    if echo "$OUTPUT" | grep -iq "deleted\|success"; then
      echo -e "   ${GREEN}✅ DELETED${NC}"
      ((DELETED++))
    else
      echo -e "   ${YELLOW}ℹ️  NOT FOUND${NC}"
      ((NOT_FOUND++))
    fi
  else
    echo -e "   ${RED}❌ ERROR${NC}"
    ((ERRORS++))
  fi
done

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🏁 CACHE PURGE COMPLETE${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "📊 Results:"
echo -e "   Total: ${#TARGET_ISBNS[@]}"
echo -e "   ${GREEN}✅ Deleted: ${DELETED}${NC}"
echo -e "   ${YELLOW}ℹ️  Not Found: ${NOT_FOUND}${NC}"
echo -e "   ${RED}❌ Errors: ${ERRORS}${NC}"
echo ""
echo -e "${BLUE}🎯 Next: Test ISBNs to verify Alexandria URLs${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
