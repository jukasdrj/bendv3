#!/bin/bash
# CSV Job Log Analyzer
# Extracts and analyzes all debug logs for a specific CSV import job

set -euo pipefail

JOB_ID="${1:-}"
DURATION="${2:-30m}"

if [[ -z "$JOB_ID" ]]; then
    echo "Usage: ./analyze-csv-job.sh <job-id> [duration]"
    echo ""
    echo "Examples:"
    echo "  ./analyze-csv-job.sh 1922f56e-1603-4e19-a08c-fd61ec8a617e"
    echo "  ./analyze-csv-job.sh abc123 1h"
    echo ""
    echo "This will search logs for the specified job ID and extract:"
    echo "  - Upload stage (File.text, size verification)"
    echo "  - Storage stage (Durable Object put/get)"
    echo "  - Processing stage (Alarm trigger, CSV retrieval)"
    echo "  - API stage (Gemini request, truncation check)"
    echo "  - Results stage (Parsing, completion)"
    exit 1
fi

echo "🔍 Analyzing CSV import job: $JOB_ID"
echo "📅 Duration: $DURATION"
echo ""

# Create temporary file for logs
TEMP_LOG=$(mktemp)
trap "rm -f $TEMP_LOG" EXIT

echo "📡 Streaming logs (this may take a moment)..."

# Stream logs and capture job-related entries
timeout 60 npx wrangler tail --format=json 2>/dev/null | \
    while IFS= read -r line; do
        # Check if line contains job ID
        if echo "$line" | grep -q "$JOB_ID" 2>/dev/null; then
            echo "$line" >> "$TEMP_LOG"
        fi
    done || true

# Check if we found any logs
if [[ ! -s "$TEMP_LOG" ]]; then
    echo "❌ No logs found for job ID: $JOB_ID"
    echo ""
    echo "Possible reasons:"
    echo "  - Job is too old (logs only retained for ~24 hours)"
    echo "  - Job ID is incorrect"
    echo "  - Job hasn't started yet"
    echo ""
    echo "💡 Try running a new CSV import to capture fresh logs"
    exit 1
fi

echo "✅ Found $(wc -l < "$TEMP_LOG") log entries"
echo ""

# Extract key stages
echo "═══════════════════════════════════════════════════════════"
echo "📊 CSV IMPORT JOB ANALYSIS"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Stage 1: Upload
echo "🔹 STAGE 1: UPLOAD (File.text conversion)"
echo "───────────────────────────────────────────────────────────"
jq -r 'select(.message | tostring | contains("File.text()")) |
       "\(.timestamp // "unknown") | \(.message // "")"' "$TEMP_LOG" 2>/dev/null || \
    echo "  No upload logs found"
echo ""

# Stage 2: Storage
echo "🔹 STAGE 2: STORAGE (Durable Object put/get)"
echo "───────────────────────────────────────────────────────────"
jq -r 'select(.message | tostring | contains("Stored CSV size") or contains("STORAGE TRUNCATION")) |
       "\(.timestamp // "unknown") | \(.message // "")"' "$TEMP_LOG" 2>/dev/null || \
    echo "  No storage logs found"
echo ""

# Stage 3: Alarm & Retrieval
echo "🔹 STAGE 3: RETRIEVAL (Alarm trigger & CSV fetch)"
echo "───────────────────────────────────────────────────────────"
jq -r 'select(.message | tostring | contains("Retrieved CSV from storage") or contains("ALARM FIRED")) |
       "\(.timestamp // "unknown") | \(.message // "")"' "$TEMP_LOG" 2>/dev/null || \
    echo "  No retrieval logs found"
echo ""

# Stage 4: Gemini Request
echo "🔹 STAGE 4: GEMINI REQUEST (API call & truncation check)"
echo "───────────────────────────────────────────────────────────"
jq -r 'select(.message | tostring | contains("GeminiCSVProvider") and
       (contains("Request payload size") or contains("CSV in payload") or contains("CSV TRUNCATED"))) |
       "\(.timestamp // "unknown") | \(.message // "")"' "$TEMP_LOG" 2>/dev/null || \
    echo "  No Gemini request logs found"
echo ""

# Stage 5: Response & Parsing
echo "🔹 STAGE 5: RESPONSE (Gemini parsing & results)"
echo "───────────────────────────────────────────────────────────"
jq -r 'select(.message | tostring | contains("Token usage") or contains("Gemini returned")) |
       "\(.timestamp // "unknown") | \(.message // "")"' "$TEMP_LOG" 2>/dev/null || \
    echo "  No response logs found"
echo ""

# Completion
echo "🔹 STAGE 6: COMPLETION"
echo "───────────────────────────────────────────────────────────"
jq -r 'select(.message | tostring | contains("Persisted") or contains("completed")) |
       "\(.timestamp // "unknown") | \(.message // "")"' "$TEMP_LOG" 2>/dev/null || \
    echo "  No completion logs found"
echo ""

# Errors
echo "═══════════════════════════════════════════════════════════"
echo "⚠️  ERRORS & WARNINGS"
echo "═══════════════════════════════════════════════════════════"
jq -r 'select(.level == "error" or (.message | tostring | contains("TRUNCATED") or contains("⚠️"))) |
       "\(.timestamp // "unknown") | [\(.level // "warn")] \(.message // "")"' "$TEMP_LOG" 2>/dev/null || \
    echo "  No errors found ✅"
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════"
echo "📋 SUMMARY"
echo "═══════════════════════════════════════════════════════════"

# Check for truncation
TRUNCATED=$(grep -i "TRUNCATED" "$TEMP_LOG" | wc -l || echo "0")
if [[ "$TRUNCATED" -gt 0 ]]; then
    echo "❌ CSV TRUNCATION DETECTED ($TRUNCATED instances)"
else
    echo "✅ No CSV truncation detected"
fi

# Check for completion
COMPLETED=$(grep -i "completed\|Persisted" "$TEMP_LOG" | wc -l || echo "0")
if [[ "$COMPLETED" -gt 0 ]]; then
    echo "✅ Job completed successfully"
else
    echo "⏳ Job may still be processing or failed"
fi

# Check for errors
ERRORS=$(jq -r 'select(.level == "error")' "$TEMP_LOG" 2>/dev/null | wc -l || echo "0")
if [[ "$ERRORS" -gt 0 ]]; then
    echo "⚠️  $ERRORS error(s) logged"
else
    echo "✅ No errors logged"
fi

echo ""
echo "Full log saved to: $TEMP_LOG"
echo "Run: cat $TEMP_LOG | jq . to view complete JSON"
