#!/bin/bash
# Advanced Cloudflare Workers Log Search
# Usage: ./search-logs.sh [pattern] [options]

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
PATTERN="${1:-}"
SINCE="${2:-5m}"
FORMAT="${3:-pretty}"
OUTPUT_FILE=""

# Help text
show_help() {
    cat << EOF
Cloudflare Workers Log Search Utility

USAGE:
    ./search-logs.sh <pattern> [since] [format] [output-file]

ARGUMENTS:
    pattern     Search pattern (required)
    since       Time window (default: 5m) - examples: 1h, 30m, 24h
    format      Output format: pretty, json, csv (default: pretty)
    output-file Optional file to save results

EXAMPLES:
    # Search for errors in last 5 minutes
    ./search-logs.sh "error" 5m

    # Search for specific job ID
    ./search-logs.sh "1922f56e-1603-4e19-a08c-fd61ec8a617e" 1h

    # Search for Gemini provider logs
    ./search-logs.sh "GeminiCSVProvider" 30m json

    # Search and save to file
    ./search-logs.sh "CSV TRUNCATED" 1h pretty debug.log

COMMON PATTERNS:
    - "error"                           All errors
    - "GeminiCSVProvider"               Gemini API calls
    - "CSV TRUNCATED"                   CSV truncation warnings
    - "JobStateManager"                 Job lifecycle events
    - "9780439708180"                   Specific ISBN
    - "Circuit breaker"                 Circuit breaker events
    - "rate limit"                      Rate limiting issues

EOF
    exit 0
}

# Check if help requested
if [[ "${PATTERN}" == "-h" ]] || [[ "${PATTERN}" == "--help" ]] || [[ -z "${PATTERN}" ]]; then
    show_help
fi

echo -e "${BLUE}🔍 Searching Cloudflare Workers logs...${NC}"
echo -e "${BLUE}Pattern: ${YELLOW}${PATTERN}${NC}"
echo -e "${BLUE}Window:  ${YELLOW}${SINCE}${NC}"
echo ""

# Stream logs and search
if [[ "${FORMAT}" == "json" ]]; then
    # JSON format - try to parse, fall back to grep
    echo -e "${GREEN}Streaming logs in JSON format...${NC}"
    npx wrangler tail --format=json 2>/dev/null | \
        while IFS= read -r line; do
            # Try to parse as JSON, skip if invalid
            if echo "$line" | jq -e . >/dev/null 2>&1; then
                # Check if message contains pattern (case-insensitive)
                if echo "$line" | jq -r '.message // .error // ""' 2>/dev/null | grep -qi "$PATTERN"; then
                    echo "$line" | jq -C .
                fi
            else
                # Fallback: plain text contains pattern
                if echo "$line" | grep -qi "$PATTERN"; then
                    echo "$line"
                fi
            fi
        done
elif [[ "${FORMAT}" == "csv" ]]; then
    # CSV format
    echo -e "${GREEN}Streaming logs in CSV format...${NC}"
    echo "timestamp,level,status,message"
    npx wrangler tail --format=json 2>/dev/null | \
        while IFS= read -r line; do
            if echo "$line" | jq -e . >/dev/null 2>&1; then
                if echo "$line" | jq -r '.message // ""' | grep -qi "$PATTERN"; then
                    echo "$line" | jq -r '[.timestamp // "", .level // "", .status // "", .message // ""] | @csv'
                fi
            fi
        done
else
    # Pretty format (default)
    echo -e "${GREEN}Streaming logs in pretty format...${NC}"
    npx wrangler tail --format=pretty 2>&1 | grep -i --color=always "$PATTERN" || {
        echo -e "${YELLOW}⚠️  No matches found for pattern: ${PATTERN}${NC}"
        echo -e "${YELLOW}💡 Try a broader search or check if logs are being generated${NC}"
        exit 1
    }
fi

echo ""
echo -e "${GREEN}✅ Search complete${NC}"
