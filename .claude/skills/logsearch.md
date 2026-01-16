---
name: logsearch
description: Advanced log search and analysis for Cloudflare Workers with pattern matching and filtering
user-invocable: true
agent: cf-ops-monitor
context: fork
argument-hint: <search-pattern> [--json|--errors|--time-range]
allowed-tools:
  - Bash
  - Read
  - Write
---

# Advanced Log Search

**Purpose:** Search production Cloudflare Workers logs with powerful filtering, pattern matching, and analysis capabilities.

**When to use:**
- Find specific error messages or stack traces
- Track down issues by ISBN, user ID, or request ID
- Analyze time-based patterns (errors in specific time window)
- Debug specific API provider failures
- Investigate performance bottlenecks

---

## Search Capabilities

### 1. Pattern-Based Search
Search logs for specific patterns with context:

```bash
# Search for specific error messages
wrangler tail --format=json | jq 'select(.message | contains("{{PATTERN}}"))'

# Search with regex patterns
wrangler tail --format=json | jq 'select(.message | test("{{REGEX}}"))'

# Case-insensitive search
wrangler tail --format=json | jq 'select(.message | ascii_downcase | contains("{{PATTERN}}" | ascii_downcase))'
```

### 2. Error-Focused Search
Filter only errors and exceptions:

```bash
# All errors
wrangler tail --format=json | jq 'select(.level == "error")'

# Errors with specific status codes
wrangler tail --format=json | jq 'select(.status >= 500)'

# Errors from specific providers
wrangler tail --format=json | jq 'select(.level == "error" and (.message | contains("Google Books") or contains("ISBNdb") or contains("Alexandria")))'
```

### 3. Time-Based Analysis
Analyze logs within specific time windows:

```bash
# Last N minutes of errors
wrangler tail --format=json --since=15m | jq 'select(.level == "error")'

# Group errors by minute
wrangler tail --format=json | jq -r '[.timestamp, .message] | @tsv' | awk '{print strftime("%Y-%m-%d %H:%M", $1)}'
```

### 4. Request Tracing
Track specific requests end-to-end:

```bash
# Find all logs for specific request ID
wrangler tail --format=json | jq 'select(.requestId == "{{REQUEST_ID}}")'

# Find all logs for specific ISBN
wrangler tail --format=json | jq 'select(.message | contains("{{ISBN}}"))'

# Trace job execution
wrangler tail --format=json | jq 'select(.jobId == "{{JOB_ID}}")'
```

### 5. Performance Analysis
Identify slow requests and bottlenecks:

```bash
# Requests slower than threshold
wrangler tail --format=json | jq 'select(.cpuTime > 1000)' # > 1 second

# Cache miss patterns
wrangler tail --format=json | jq 'select(.cacheStatus == "miss")'

# External API latency
wrangler tail --format=json | jq 'select(.provider != null) | {provider, latency, success}'
```

---

## Common Search Patterns

### Search for Specific ISBN Issues
```bash
wrangler tail --format=json | jq --arg isbn "{{ISBN}}" 'select(.message | contains($isbn))'
```

### Search for Provider Failures
```bash
# Google Books failures
wrangler tail --format=json | jq 'select(.provider == "google-books" and .success == false)'

# Alexandria circuit breaker trips
wrangler tail --format=json | jq 'select(.message | contains("Circuit breaker OPEN") and contains("alexandria"))'
```

### Search for Job Processing Errors
```bash
# Import job failures
wrangler tail --format=json | jq 'select(.jobType == "import" and .status == "failed")'

# Enrichment queue errors
wrangler tail --format=json | jq 'select(.queue == "ENRICHMENT_QUEUE" and .level == "error")'
```

### Search for Rate Limit Issues
```bash
# Rate limit hits
wrangler tail --format=json | jq 'select(.status == 429)'

# External API rate limits
wrangler tail --format=json | jq 'select(.message | contains("rate limit") or contains("quota exceeded"))'
```

### Search for Durable Object Issues
```bash
# DO errors
wrangler tail --format=json | jq 'select(.durableObject != null and .level == "error")'

# WebSocket disconnections
wrangler tail --format=json | jq 'select(.message | contains("WebSocket") and contains("disconnect"))'
```

---

## Output Formatting

### Compact Error Summary
```bash
wrangler tail --format=json | jq -r 'select(.level == "error") | "\(.timestamp) [\(.status)] \(.message)"'
```

### Detailed Error Report
```bash
wrangler tail --format=json | jq 'select(.level == "error") | {
  timestamp,
  status,
  message,
  requestId,
  endpoint: .url,
  provider,
  stackTrace
}'
```

### CSV Export for Analysis
```bash
wrangler tail --format=json | jq -r '[.timestamp, .level, .status, .message] | @csv' > logs.csv
```

---

## Advanced Analysis

### Error Rate by Endpoint
```bash
wrangler tail --format=json --since=1h | jq -r 'select(.level == "error") | .url' | sort | uniq -c | sort -rn
```

### Provider Success Rate
```bash
wrangler tail --format=json --since=1h | jq -r 'select(.provider != null) | "\(.provider) \(.success)"' | sort | uniq -c
```

### Response Time Percentiles
```bash
wrangler tail --format=json --since=1h | jq -r '.cpuTime' | sort -n | awk '{
  count[NR] = $1
}
END {
  print "P50:", count[int(NR*0.5)]
  print "P95:", count[int(NR*0.95)]
  print "P99:", count[int(NR*0.99)]
}'
```

---

## Search Arguments

**Pattern:** `{{ARGS}}`

**Flags:**
- `--json` - Output raw JSON for further processing
- `--errors` - Only show errors (status >= 400)
- `--since=<time>` - Time window (e.g., 15m, 1h, 24h)
- `--sampling-rate=<0-1>` - Sample rate for high-volume logs

**Examples:**
```
/logsearch "Google Books API timeout"
/logsearch "9780439708180" --since=1h
/logsearch --errors --since=30m
/logsearch "Circuit breaker" --json
/logsearch job:1922f56e-1603-4e19-a08c-fd61ec8a617e
```

**Special Commands:**
```
/logsearch csv-job:<job-id>     # Deep analysis of CSV import job
/logsearch live                 # Stream all logs in real-time
```

---

## Workflow

1. **Start log stream** with pattern filter
2. **Capture context** (50 lines before/after match)
3. **Analyze patterns** (frequency, affected endpoints, providers)
4. **Generate summary** (error count, time distribution, root causes)
5. **Suggest fixes** (based on error patterns)
6. **Hand off to cf-code-reviewer** if code changes needed

---

## Integration with Other Tools

### Export for Debugging
```bash
# Save matching logs for analysis
wrangler tail --format=json | jq 'select(.message | contains("{{PATTERN}}"))' > debug-logs.json
```

### Feed to PAL Debug Tool
```bash
# Create context file for deep debugging
wrangler tail --format=json --since=1h | jq 'select(.level == "error")' > error-context.json
# Then use: @pal debug with error-context.json
```

### Create Incident Report
```bash
# Generate markdown report
cat << EOF > incident-report.md
# Incident Report - $(date)

## Error Pattern: {{PATTERN}}

## Affected Time Window: {{SINCE}}

## Error Count: $(wrangler tail --format=json --since={{SINCE}} | jq 'select(.message | contains("{{PATTERN}}"))' | wc -l)

## Sample Errors:
$(wrangler tail --format=json --since={{SINCE}} | jq -r 'select(.message | contains("{{PATTERN}}")) | .message' | head -5)
EOF
```

---

## Quick Reference

**Common Commands:**
```bash
# Find all errors in last hour
/logsearch --errors --since=1h

# Search for specific ISBN issues
/logsearch "9780439708180"

# Find Alexandria failures
/logsearch "alexandria" --errors

# Track job execution
/logsearch "job:abc123"

# Export for analysis
/logsearch "rate limit" --json > rate-limit-errors.json
```

---

@cf-ops-monitor

**Autonomy:** High - Can stream, filter, analyze, and summarize logs without human intervention
**Escalation:** Hand off to cf-code-reviewer for code fixes, or PAL debug for deep investigation
