# BooksTrack Log Analysis Commands

This directory contains specialized command-line tools for searching and analyzing Cloudflare Workers logs.

---

## 🚀 Quick Start

### Search Logs for Pattern
```bash
./search-logs.sh "error" 5m
./search-logs.sh "GeminiCSVProvider" 30m json
```

### Analyze CSV Import Job
```bash
./analyze-csv-job.sh 1922f56e-1603-4e19-a08c-fd61ec8a617e
```

---

## 📋 Available Commands

### `search-logs.sh` - General Log Search

**Purpose:** Search production logs for specific patterns with flexible output formats.

**Usage:**
```bash
./search-logs.sh <pattern> [since] [format] [output-file]
```

**Arguments:**
- `pattern` - Search pattern (required)
- `since` - Time window (default: 5m) - examples: 1h, 30m, 24h
- `format` - Output format: pretty, json, csv (default: pretty)
- `output-file` - Optional file to save results

**Examples:**
```bash
# Search for errors in last 5 minutes
./search-logs.sh "error" 5m

# Search for specific job ID
./search-logs.sh "1922f56e-1603-4e19-a08c-fd61ec8a617e" 1h

# Search for Gemini provider logs
./search-logs.sh "GeminiCSVProvider" 30m json

# Search and save to file
./search-logs.sh "CSV TRUNCATED" 1h pretty debug.log
```

**Common Patterns:**
- `"error"` - All errors
- `"GeminiCSVProvider"` - Gemini API calls
- `"CSV TRUNCATED"` - CSV truncation warnings
- `"JobStateManager"` - Job lifecycle events
- `"9780439708180"` - Specific ISBN
- `"Circuit breaker"` - Circuit breaker events
- `"rate limit"` - Rate limiting issues

---

### `analyze-csv-job.sh` - CSV Job Deep Analysis

**Purpose:** Extract and analyze all debug logs for a specific CSV import job across all processing stages.

**Usage:**
```bash
./analyze-csv-job.sh <job-id> [duration]
```

**Arguments:**
- `job-id` - CSV import job ID (required)
- `duration` - Time window to search (default: 30m)

**Examples:**
```bash
# Analyze recent CSV job
./analyze-csv-job.sh 1922f56e-1603-4e19-a08c-fd61ec8a617e

# Analyze older job with extended window
./analyze-csv-job.sh abc123 2h
```

**Output Stages:**

The analyzer extracts logs across 6 processing stages:

1. **UPLOAD** - File.text() conversion, size verification
2. **STORAGE** - Durable Object put/get operations
3. **RETRIEVAL** - Alarm trigger, CSV fetch from storage
4. **GEMINI REQUEST** - API call, truncation check
5. **RESPONSE** - Gemini parsing, token usage
6. **COMPLETION** - Results persistence, job status

**What It Detects:**
- ✅ CSV truncation at any stage
- ✅ Storage corruption or size mismatches
- ✅ Gemini API failures
- ✅ Job completion status
- ✅ Errors and warnings

**Sample Output:**
```
═══════════════════════════════════════════════════════════
📊 CSV IMPORT JOB ANALYSIS
═══════════════════════════════════════════════════════════

🔹 STAGE 1: UPLOAD (File.text conversion)
───────────────────────────────────────────────────────────
2026-01-15T19:51:20Z | [V3 Import] ✅ File.text() completed: 2577 bytes
2026-01-15T19:51:20Z | [V3 Import] 📊 CSV line count: 50 lines

🔹 STAGE 4: GEMINI REQUEST (API call & truncation check)
───────────────────────────────────────────────────────────
2026-01-15T19:51:25Z | [GeminiCSVProvider] Request payload size: 8421 bytes
2026-01-15T19:51:25Z | [GeminiCSVProvider] Original CSV size: 2577 bytes
2026-01-15T19:51:25Z | [GeminiCSVProvider] CSV in payload: FULL

═══════════════════════════════════════════════════════════
📋 SUMMARY
═══════════════════════════════════════════════════════════
✅ No CSV truncation detected
✅ Job completed successfully
✅ No errors logged
```

---

## 🔗 Integration with Claude Code

### Via `/logsearch` Skill

You can invoke these tools through the `/logsearch` skill:

```
/logsearch "GeminiCSVProvider" --since=30m
/logsearch csv-job:1922f56e-1603-4e19-a08c-fd61ec8a617e
```

### Via cf-ops-monitor Agent

The `cf-ops-monitor` agent can use these tools automatically:

```
@cf-ops-monitor analyze CSV job 1922f56e-1603-4e19-a08c-fd61ec8a617e
@cf-ops-monitor search logs for "rate limit" in last hour
```

---

## 🛠️ Troubleshooting

### "No logs found for job ID"

**Possible reasons:**
- Job is too old (logs retained for ~24 hours)
- Job ID is incorrect
- Job hasn't started yet

**Solution:** Run a new CSV import to capture fresh logs

### "jq: parse error"

**Reason:** Non-JSON output from wrangler tail

**Solution:** Fallback to pretty format:
```bash
./search-logs.sh "pattern" 5m pretty
```

### Timeout or no output

**Reason:** No matching logs in time window

**Solution:**
- Increase duration: `./search-logs.sh "pattern" 1h`
- Broaden search pattern
- Check if Worker is receiving traffic

---

## 📊 Advanced Usage

### Combine with jq for Custom Analysis

```bash
# Extract only error messages
./search-logs.sh "error" 1h json | jq -r '.message'

# Count errors by status code
./search-logs.sh "error" 1h json | jq -r '.status' | sort | uniq -c

# Export to CSV for spreadsheet analysis
./search-logs.sh "GeminiCSVProvider" 1h csv > gemini-calls.csv
```

### Continuous Monitoring

```bash
# Watch for CSV truncation in real-time
watch -n 10 './search-logs.sh "CSV TRUNCATED" 1m'

# Alert on errors
while true; do
  ERRORS=$(./search-logs.sh "error" 1m json | wc -l)
  if [[ "$ERRORS" -gt 10 ]]; then
    echo "⚠️  High error rate: $ERRORS errors in last minute"
  fi
  sleep 60
done
```

### Create Incident Reports

```bash
# Generate markdown report
cat > incident-report.md <<EOF
# Incident Report - $(date)

## Error Pattern: Rate Limit Exceeded

## Logs:
\`\`\`
$(./search-logs.sh "rate limit" 1h)
\`\`\`

## Analysis:
$(./analyze-csv-job.sh abc123)
EOF
```

---

## 🔧 Development

### Adding New Analysis Tools

1. Create new script in `.claude/commands/`
2. Make executable: `chmod +x script.sh`
3. Update this README
4. Add to `/logsearch` skill if user-facing

### Testing

```bash
# Test search-logs.sh
./search-logs.sh "test" 1m pretty

# Test analyze-csv-job.sh with known job ID
./analyze-csv-job.sh <recent-job-id>
```

---

## 📚 Related Documentation

- **cf-ops-monitor Agent:** `.claude/agents/cf-ops-monitor/agent.md`
- **/logsearch Skill:** `.claude/skills/logsearch.md`
- **API V3 Overview:** `docs/API_V3_OVERVIEW.md`
- **CSV Import Workflow:** `src/utils/jobs/csv-processor-core.ts`

---

**Last Updated:** January 15, 2026
**Maintained By:** AI Team (cf-ops-monitor, Claude Code)
