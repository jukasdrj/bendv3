#!/bin/bash
###############################################################################
# CACHE PURGE SCRIPT - Alexandria Integration
# Mission: Delete old pre-integration cache entries
# Execution: bash cache-purge.sh
###############################################################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# KV namespace binding name
KV_NAMESPACE="b9cade63b6db48fd80c109a013f38fdb"  # CACHE namespace ID

# Target ISBNs with old cache
TARGET_ISBNS=(
  "9780525540670"  # Long Bright River
  "9780802158741"  # Small Things Like These
  "9780593230388"  # The Message
  "9780593733257"  # A Sunny Place for Shady People
  "9780593653227"  # We Solve Murders
  "9780063277050"  # The Mighty Red
  "9780593657225"  # Murderland
  "9781250391230"  # Careless People
  "9780593318256"  # Wandering Stars
  "9781668034347"  # The Safekeep
  "9781945492600"  # I Who Have Never Known Men
  "9781324086031"  # Playground
  "9780802161543"  # Orbital
  "9781668063606"  # Heartwood
  "9781250827951"  # Wild Dark Shore
  "9781982116521"  # Creation Lake
  "9780141441160"  # A Passage to India
  "9781982150921"  # Tender Is the Flesh
)

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚨 CACHE PURGE INITIATED${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "⏰ Start Time: $(date)"
echo -e "📋 Target ISBNs: ${#TARGET_ISBNS[@]}"
echo -e "🗄️  KV Namespace: ${KV_NAMESPACE}"
echo ""

DELETED=0
NOT_FOUND=0
ERRORS=0

for isbn in "${TARGET_ISBNS[@]}"; do
  # Generate cache key (matches CacheKeyFactory.bookISBN format)
  CACHE_KEY="search:isbn:isbn=${isbn}"
  
  echo -e "${YELLOW}Processing: ${isbn}${NC}"
  echo -e "  Key: ${CACHE_KEY}"
  
  # Delete the cache key
  OUTPUT=$(npx wrangler kv:key delete --binding=CACHE "${CACHE_KEY}" 2>&1)
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -eq 0 ]; then
    if echo "$OUTPUT" | grep -q "Deleting"; then
      echo -e "  ${GREEN}✅ DELETED${NC}"
      ((DELETED++))
    else
      echo -e "  ${YELLOW}ℹ️  NOT FOUND (already purged or never cached)${NC}"
      ((NOT_FOUND++))
    fi
  else
    echo -e "  ${RED}❌ ERROR: ${OUTPUT}${NC}"
    ((ERRORS++))
  fi
  
  echo ""
done

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🏁 CACHE PURGE COMPLETE${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "📊 Results:"
echo -e "   Total: ${#TARGET_ISBNS[@]}"
echo -e "   ${GREEN}✅ Deleted: ${DELETED}${NC}"
echo -e "   ${YELLOW}ℹ️  Not Found: ${NOT_FOUND}${NC}"
echo -e "   ${RED}❌ Errors: ${ERRORS}${NC}"
echo ""
echo -e "${BLUE}🎯 Next Step: Test ISBNs to verify Alexandria URLs${NC}"
echo -e "   Run: bash test-cache-purge.sh"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
