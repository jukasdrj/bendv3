# AI Shelf Scan Manual Test Guide

**Date:** 2026-01-16
**Tester:** Follow these steps to validate the scan workflow

---

## Prerequisites

1. Bookshelf photo ready (the one with decorative clock)
2. Save photo as: `/tmp/test-bookshelf.jpg`
3. Terminal open in bendv3 directory

---

## Option 1: Automated Test Script (Recommended)

```bash
# Save your bookshelf photo first
# Then run the automated test:
bun run test-scan-workflow.ts /tmp/test-bookshelf.jpg
```

The script will:
- ✅ POST photo to `/v3/jobs/scans`
- ✅ Poll status every 2 seconds
- ✅ Validate schema compliance automatically
- ✅ Check progress monotonicity
- ✅ Fetch and validate results
- ✅ Generate detailed report

---

## Option 2: Manual curl Testing

### Step 1: Create Scan Job

```bash
# Save response to extract jobId
curl -X POST https://api.oooefam.net/v3/jobs/scans \
  -F "photos[]=@/tmp/test-bookshelf.jpg" \
  | jq '.' | tee /tmp/scan-init.json

# Extract jobId and token
export JOB_ID=$(jq -r '.data.jobId' /tmp/scan-init.json)
export AUTH_TOKEN=$(jq -r '.data.token' /tmp/scan-init.json)

echo "Job ID: $JOB_ID"
echo "Token: $AUTH_TOKEN"
```

**Expected Response:**
- Status: `202 Accepted`
- `success: true`
- `data.jobId`: UUID format
- `data.status`: "queued"
- `data.streamUrl`: SSE endpoint
- `data.token`: Authentication token

**Validate:**
- [ ] Response matches `JobInitResponseSchema`
- [ ] jobId is valid UUID
- [ ] token is non-empty string
- [ ] streamUrl contains jobId

---

### Step 2: Poll Job Status

```bash
# Poll every 2 seconds until completed
while true; do
  STATUS=$(curl -s "https://api.oooefam.net/v3/jobs/scans/$JOB_ID" | tee /tmp/scan-status-latest.json)

  echo "$(date '+%H:%M:%S') - Status: $(echo $STATUS | jq -r '.data.status') | Progress: $(echo $STATUS | jq -r '.data.progress') | Processed: $(echo $STATUS | jq -r '.data.processedCount')/$(echo $STATUS | jq -r '.data.totalCount')"

  # Check if completed
  if echo $STATUS | jq -e '.data.status == "completed"' > /dev/null; then
    echo "✅ Job completed!"
    break
  fi

  # Check if failed
  if echo $STATUS | jq -e '.data.status == "failed"' > /dev/null; then
    echo "❌ Job failed!"
    echo $STATUS | jq '.data.error'
    break
  fi

  sleep 2
done
```

**Expected Behavior:**
- Status transitions: `queued` → `processing` → `completed`
- Progress: Monotonically increases from 0.0 → 1.0
- processedCount: Increments (not always, depends on photo count)
- No backwards progress movement

**Validate:**
- [ ] Status transitions correctly
- [ ] Progress never decreases
- [ ] processedCount ≤ totalCount
- [ ] Timestamps are ISO 8601
- [ ] P95 latency < 200ms

---

### Step 3: Fetch Results

```bash
# Get scan results
curl -s "https://api.oooefam.net/v3/jobs/scans/$JOB_ID/results" \
  | jq '.' | tee /tmp/scan-results.json

# Count detected books
BOOK_COUNT=$(jq '.data.results | length' /tmp/scan-results.json)
echo "📚 Books detected: $BOOK_COUNT"

# Show first book
echo "Sample book:"
jq '.data.results[0]' /tmp/scan-results.json
```

**Expected Response:**
- Status: `200 OK`
- `success: true`
- `data.jobId`: Matches original jobId
- `data.status`: "completed"
- `data.results`: Array of DetectedBook objects

**Validate:**
- [ ] Results array is present
- [ ] Each book has title or ISBN
- [ ] Confidence scores are 0-1
- [ ] Bounding boxes are normalized (0-1)
- [ ] enrichmentStatus is valid enum

---

### Step 4: Validate Book Schema

```bash
# Check each book for required fields
jq -r '.data.results[] | "Title: \(.title // "N/A") | Author: \(.author // "N/A") | ISBN: \(.isbn // "N/A") | Confidence: \(.confidence // "N/A")"' /tmp/scan-results.json
```

**For each book, validate:**
- [ ] Has title OR ISBN (at least one)
- [ ] confidence: 0.0 to 1.0
- [ ] boundingBox: x, y, width, height all 0.0 to 1.0
- [ ] enrichmentStatus: pending | success | not_found | error | circuit_open
- [ ] coverUrl: Valid URL (if present)

---

## Option 3: Test SSE Stream (Real-time Progress)

```bash
# Open in separate terminal to watch real-time updates
curl -N -H "Authorization: Bearer $AUTH_TOKEN" \
  "https://api.oooefam.net/v3/jobs/scans/$JOB_ID/stream"
```

**Expected Events:**
```
event: progress
data: {"jobId":"...","status":"processing","progress":0.5,...}

event: complete
data: {"jobId":"...","status":"completed","progress":1.0,"books":[...]}
```

**Validate:**
- [ ] Connection stays open during processing
- [ ] Progress events received
- [ ] Complete event includes full books array
- [ ] No error events (unless job fails)

---

## Validation Checklist

### Schema Compliance
- [ ] POST response matches `JobInitResponseSchema`
- [ ] Status response matches `JobStatusResponseSchema`
- [ ] Results response matches `JobResultsResponseSchema`
- [ ] Books match `DetectedBookSchema`
- [ ] SSE events match SSE*EventSchema types

### Business Logic
- [ ] Job status transitions correctly
- [ ] Progress is monotonic (never decreases)
- [ ] processedCount ≤ totalCount always
- [ ] Results only available after completion
- [ ] Token-based SSE auth works

### Performance
- [ ] Job creation < 500ms (P95)
- [ ] Status poll < 200ms (P95)
- [ ] Processing < 30s for 1 photo
- [ ] Results fetch < 500ms (P95)

### Error Handling
- [ ] Invalid image format returns 400
- [ ] Missing photos[] returns 400
- [ ] File too large returns 413
- [ ] Invalid jobId returns 404
- [ ] Errors follow RFC 9457 format

---

## Expected Books from Test Image

Based on visual inspection of bookshelf photo:
1. Crime and Punishment - Dostoevsky
2. Murder in Three Acts - Agatha Christie
3. Between/Eileen - Tessa Moshfegh
4. Persuasion - Jane Austen
5. Darkness at Noon - Arthur Koestler
6. Dream Count (unclear author)
7. Wolf Hall - Hilary Mantel
8. Murderland - Caroline Fraser (?)

**Validation:**
- [ ] At least 4-6 books detected (some may be obscured)
- [ ] High confidence (≥0.8) for clear spines
- [ ] Lower confidence (<0.8) for partially obscured books
- [ ] Bounding boxes roughly align with visible books

---

## Troubleshooting

**Job stuck in 'processing':**
```bash
# Check Cloudflare logs
wrangler tail --format=pretty | grep -i "scan\|gemini\|error"
```

**No books detected:**
- Check if image uploaded correctly (should be >100KB)
- Verify image format (JPEG/PNG/WebP)
- Check logs for Gemini API errors

**Schema validation fails:**
- Compare response structure to schemas in `packages/schemas/src/`
- Check if API and SDK versions match
- Look for drift between OpenAPI spec and runtime

---

## Success Criteria

✅ **All validations pass:**
- Schema compliance: 100%
- Business logic: Correct status transitions, monotonic progress
- Performance: Within SLA (<2s job creation, <30s processing)
- Error handling: RFC 9457 format
- Results: Books detected with reasonable accuracy

❌ **Failure scenarios to report:**
- Schema mismatches (log exact differences)
- Progress going backwards
- Missing or incorrect fields
- Performance degradation
- Silent failures

---

## After Testing

1. Save all JSON responses to files
2. Check Cloudflare logs for errors/warnings
3. Document any issues found
4. Update findings.md with results
5. Run: `bun run test-scan-workflow.ts` for automated validation
