# CSV A/B Testing Fixtures

Test datasets for Gemini model A/B testing experiments.

## Files

### small.csv (2 books, 114 bytes)
**Purpose:** Quick validation, baseline performance
**Expected results:**
- Valid books: 2
- Errors: 0
- Latency: < 10s (all models)

### medium.csv (50 books, ~5KB)
**Purpose:** Realistic user CSV, accuracy testing
**Expected results:**
- Valid books: 50
- Errors: 0
- Latency: 10-20s

## Usage

### Manual Testing

```bash
# Upload small.csv via POST /v3/jobs/imports
curl -X POST https://api.oooefam.net/v3/jobs/imports \
  -H "Content-Type: multipart/form-data" \
  -F "file=@tests/fixtures/csv-ab-testing/small.csv" \
  -F "userId=test-user-123"
```

### Automated Testing

```typescript
import { readFileSync } from 'fs'

const smallCsv = readFileSync('tests/fixtures/csv-ab-testing/small.csv', 'utf-8')
const mediumCsv = readFileSync('tests/fixtures/csv-ab-testing/medium.csv', 'utf-8')

// Test with different models
const models = ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash-lite']

for (const model of models) {
  const result = await parseCSVWithGemini(smallCsv, PROMPT, API_KEY, { model })
  console.log(`${model}: ${result.books.length} books in ${result.telemetry?.performance.durationMs}ms`)
}
```

## Expected Outcomes

### Performance Comparison

| Model | Small CSV | Medium CSV | Token Usage | Cost |
|-------|-----------|------------|-------------|------|
| gemini-2.5-flash | ~5s | ~15s | ~2,300 | $0.0002 |
| gemini-3-flash-preview | ~5s | ~15s | ~2,300 | TBD |
| gemini-2.5-flash-lite | ~3s | ~10s | ~2,100 | TBD |

### Accuracy Validation

All models should achieve:
- 100% valid book extraction
- 0% validation errors
- No missing titles or authors

## Notes

- **User ID for testing:** Use consistent user IDs to test bucketing logic
- **Telemetry:** Enable `ENABLE_CSV_AB_TELEMETRY=true` to log results
- **Cache clearing:** Clear cache between tests to ensure fair comparison

---

**Last Updated:** January 7, 2026
