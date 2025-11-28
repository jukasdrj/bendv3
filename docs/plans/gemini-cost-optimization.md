# Gemini API Cost Optimization Plan

**Created:** November 27, 2025
**Status:** Ready for Implementation
**Estimated Monthly Savings:** $25-60 (depending on Flash-Lite viability)

---

## Executive Summary

Analysis of BooksTrack's Gemini API usage identified four optimization opportunities:

| Priority | Optimization | File | Savings |
|----------|--------------|------|---------|
| 1 | Temperature tuning (0.4 -> 0.2) | `gemini-provider.js` | $12-24/mo |
| 2 | Warming endpoint caching | `warming-upload.js` | $1-2/mo |
| 3 | Cache hit telemetry | `csv-processor-core.js` | Analytics |
| 4 | Flash-Lite model comparison | New script | $55-60/mo (if viable) |

---

## Phase 1: Quick Wins

### 1.1 Temperature Tuning for Bookshelf Scanning

**File:** `src/providers/gemini-provider.js`
**Line:** 126

Vision tasks benefit from determinism, not creativity. Reducing temperature from 0.4 to 0.2 reduces output token variance without affecting accuracy.

```javascript
// BEFORE (line 126)
temperature: 0.4, // Balanced - too low reduces spine text variation recognition

// AFTER
temperature: 0.2, // Optimized for determinism - vision tasks need accuracy over creativity
```

**Risk:** Low
**Testing:** Deploy and monitor for 1 week. Compare detection accuracy via logs.

---

### 1.2 Add Caching to Warming Upload Endpoint

**File:** `src/handlers/warming-upload.js`
**Issue:** Currently bypasses KV cache, causing duplicate Gemini calls for identical CSVs.

**Changes Required:**

1. Add imports at top of file:

```javascript
import { generateCSVCacheKey } from "../utils/cache-keys.js"
import { buildCSVParserPrompt, PROMPT_VERSION } from "../prompts/csv-parser-prompt.js"
```

2. Replace direct Gemini call (around line 66) with cached version:

```javascript
// Check cache first (matches csv-processor-core.js pattern)
const cacheKey = await generateCSVCacheKey(csvText, PROMPT_VERSION)
let books = await env.CACHE.get(cacheKey, "json")

if (books) {
  console.log(`[Warming Upload] Cache HIT for ${cacheKey.substring(0, 20)}...`)
} else {
  console.log(`[Warming Upload] Cache MISS - calling Gemini`)
  const prompt = buildCSVParserPrompt()
  books = await parseCSVWithGemini(csvText, prompt, apiKey)

  // Cache for 7 days (matches csv-processor-core.js TTL)
  await env.CACHE.put(cacheKey, JSON.stringify(books), {
    expirationTtl: 604800
  })
}
```

**Risk:** None (reuses proven pattern from csv-processor-core.js)

---

### 1.3 Add Cache Hit Telemetry

**File:** `src/utils/csv-processor-core.js`
**Line:** After line 104 (cache check)

Add structured logging to track cache effectiveness:

```javascript
const cacheKey = await generateCSVCacheKey(csvText, PROMPT_VERSION)
let parsedBooks = await env.CACHE.get(cacheKey, "json")

// NEW: Add telemetry for cache hit tracking
const cacheHit = !!parsedBooks
console.log(JSON.stringify({
  type: "CSV_CACHE_TELEMETRY",
  hit: cacheHit,
  cacheKey: cacheKey.substring(0, 20) + "...",
  csvSizeBytes: csvText.length,
  timestamp: new Date().toISOString()
}))

if (!parsedBooks) {
  // existing Gemini call logic...
}
```

**Benefit:** Enables monitoring of cache hit rate (target: >25%)

---

## Phase 2: Model Comparison Test

### 2.1 Overview

The largest potential savings ($55-60/mo) comes from switching bookshelf scanning from `gemini-2.5-flash` to `gemini-2.5-flash-lite`. However, this requires accuracy validation.

**Current model costs:**
- Flash: $20.83/1M input, $83.33/1M output
- Flash-Lite: $0.075/1M input, $0.3/1M output (99.6% cheaper)

### 2.2 Comparison Script

Create `scripts/compare-gemini-models.js`:

```javascript
#!/usr/bin/env node
/**
 * Gemini Model Comparison Script
 * Compares Flash vs Flash-Lite for bookshelf vision accuracy
 *
 * Usage:
 *   GEMINI_API_KEY=xxx node scripts/compare-gemini-models.js <image-path>
 *   GEMINI_API_KEY=xxx node scripts/compare-gemini-models.js <directory>
 */

import fs from 'fs'
import path from 'path'

const MODELS = {
  flash: 'gemini-2.5-flash',
  flashLite: 'gemini-2.5-flash-lite'
}

const PRICING = {
  flash: { input: 20.83, output: 83.33 },      // per 1M tokens
  flashLite: { input: 0.075, output: 0.3 }     // per 1M tokens
}

async function scanWithModel(imagePath, model, apiKey) {
  const imageBuffer = fs.readFileSync(imagePath)
  const base64Image = imageBuffer.toString('base64')
  const ext = path.extname(imagePath).toLowerCase()
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg'

  const startTime = Date.now()

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: `Analyze this bookshelf image and extract all visible book information.
For each book you can identify, extract:
- title: The book title
- author: The author name (if visible)
- confidence: high/medium/low based on text clarity

Return a JSON array of books. Only include books where you can read at least the title.`
            },
            { inline_data: { mime_type: mimeType, data: base64Image } }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json'
        }
      })
    }
  )

  const data = await response.json()
  const processingTime = Date.now() - startTime
  const tokenUsage = data.usageMetadata || {}

  let books = []
  try {
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
    books = JSON.parse(text)
  } catch (e) {
    console.error(`  [${model}] JSON parse error:`, e.message)
  }

  return {
    model,
    books,
    processingTimeMs: processingTime,
    promptTokens: tokenUsage.promptTokenCount || 0,
    outputTokens: tokenUsage.candidatesTokenCount || 0,
    totalTokens: tokenUsage.totalTokenCount || 0
  }
}

function calculateCost(result) {
  const pricing = result.model.includes('lite') ? PRICING.flashLite : PRICING.flash
  return (result.promptTokens * pricing.input + result.outputTokens * pricing.output) / 1_000_000
}

async function compareModels(imagePath, apiKey) {
  console.log(`\n[TEST] ${path.basename(imagePath)}`)
  console.log('─'.repeat(60))

  const [flashResult, liteResult] = await Promise.all([
    scanWithModel(imagePath, MODELS.flash, apiKey),
    scanWithModel(imagePath, MODELS.flashLite, apiKey)
  ])

  const flashCost = calculateCost(flashResult)
  const liteCost = calculateCost(liteResult)

  console.log(`\n  FLASH (${MODELS.flash}):`)
  console.log(`    Books detected: ${flashResult.books.length}`)
  console.log(`    Tokens: ${flashResult.totalTokens} (${flashResult.promptTokens} in + ${flashResult.outputTokens} out)`)
  console.log(`    Time: ${flashResult.processingTimeMs}ms`)
  console.log(`    Cost: $${flashCost.toFixed(6)}`)

  console.log(`\n  FLASH-LITE (${MODELS.flashLite}):`)
  console.log(`    Books detected: ${liteResult.books.length}`)
  console.log(`    Tokens: ${liteResult.totalTokens} (${liteResult.promptTokens} in + ${liteResult.outputTokens} out)`)
  console.log(`    Time: ${liteResult.processingTimeMs}ms`)
  console.log(`    Cost: $${liteCost.toFixed(6)}`)

  const savings = ((1 - liteCost/flashCost) * 100).toFixed(1)
  console.log(`\n  SAVINGS: ${savings}% ($${(flashCost - liteCost).toFixed(6)} per image)`)

  // Compare book detection
  const flashTitles = new Set(flashResult.books.map(b => b.title?.toLowerCase().trim()))
  const liteTitles = new Set(liteResult.books.map(b => b.title?.toLowerCase().trim()))

  const onlyInFlash = [...flashTitles].filter(t => !liteTitles.has(t))
  const onlyInLite = [...liteTitles].filter(t => !flashTitles.has(t))

  if (onlyInFlash.length > 0) {
    console.log(`\n  [!] Only detected by Flash: ${onlyInFlash.join(', ')}`)
  }
  if (onlyInLite.length > 0) {
    console.log(`\n  [!] Only detected by Flash-Lite: ${onlyInLite.join(', ')}`)
  }

  return {
    imagePath,
    flash: flashResult,
    flashLite: liteResult,
    flashCost,
    liteCost,
    savingsPercent: parseFloat(savings),
    onlyInFlash,
    onlyInLite
  }
}

async function processDirectory(dirPath, apiKey) {
  const files = fs.readdirSync(dirPath)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .map(f => path.join(dirPath, f))

  console.log(`\nFound ${files.length} images in ${dirPath}`)

  const results = []
  for (const file of files) {
    results.push(await compareModels(file, apiKey))
  }

  return results
}

function printSummary(results) {
  console.log('\n' + '='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))

  const totalFlashBooks = results.reduce((sum, r) => sum + r.flash.books.length, 0)
  const totalLiteBooks = results.reduce((sum, r) => sum + r.flashLite.books.length, 0)
  const totalFlashCost = results.reduce((sum, r) => sum + r.flashCost, 0)
  const totalLiteCost = results.reduce((sum, r) => sum + r.liteCost, 0)

  console.log(`\nImages tested: ${results.length}`)
  console.log(`\nTotal books detected:`)
  console.log(`  Flash:      ${totalFlashBooks}`)
  console.log(`  Flash-Lite: ${totalLiteBooks}`)
  console.log(`  Difference: ${totalLiteBooks - totalFlashBooks}`)

  console.log(`\nTotal cost:`)
  console.log(`  Flash:      $${totalFlashCost.toFixed(6)}`)
  console.log(`  Flash-Lite: $${totalLiteCost.toFixed(6)}`)
  console.log(`  Savings:    ${((1 - totalLiteCost/totalFlashCost) * 100).toFixed(1)}%`)

  const accuracy = (totalLiteBooks / totalFlashBooks * 100).toFixed(1)
  console.log(`\nFlash-Lite accuracy vs Flash: ${accuracy}%`)

  console.log('\n' + '-'.repeat(60))
  if (parseFloat(accuracy) >= 95) {
    console.log('RECOMMENDATION: Flash-Lite is viable (>=95% accuracy)')
    console.log('Proceed with migration to save ~$55-60/month')
  } else if (parseFloat(accuracy) >= 90) {
    console.log('RECOMMENDATION: Flash-Lite has acceptable accuracy (90-95%)')
    console.log('Consider for cost-sensitive use cases')
  } else {
    console.log('RECOMMENDATION: Keep Flash for production (<90% accuracy)')
    console.log('Flash-Lite quality insufficient for bookshelf scanning')
  }
  console.log('-'.repeat(60))

  return {
    imagesCount: results.length,
    flashBooks: totalFlashBooks,
    liteBooks: totalLiteBooks,
    flashCost: totalFlashCost,
    liteCost: totalLiteCost,
    accuracy: parseFloat(accuracy),
    recommendation: parseFloat(accuracy) >= 95 ? 'migrate' : parseFloat(accuracy) >= 90 ? 'consider' : 'keep-flash'
  }
}

// Main execution
async function main() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('ERROR: GEMINI_API_KEY environment variable required')
    console.error('Usage: GEMINI_API_KEY=xxx node compare-gemini-models.js <path>')
    process.exit(1)
  }

  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('Usage: node compare-gemini-models.js <image-path-or-directory>')
    process.exit(1)
  }

  const fullPath = path.resolve(inputPath)
  const stat = fs.statSync(fullPath)

  let results
  if (stat.isDirectory()) {
    results = await processDirectory(fullPath, apiKey)
  } else {
    results = [await compareModels(fullPath, apiKey)]
  }

  const summary = printSummary(results)

  // Save detailed results
  const outputFile = 'comparison-results.json'
  fs.writeFileSync(outputFile, JSON.stringify({ summary, results }, null, 2))
  console.log(`\nDetailed results saved to: ${outputFile}`)
}

main().catch(err => {
  console.error('ERROR:', err.message)
  process.exit(1)
})
```

### 2.3 Running the Comparison

```bash
# Single image
GEMINI_API_KEY=your_key node scripts/compare-gemini-models.js path/to/bookshelf.jpg

# Directory of images
GEMINI_API_KEY=your_key node scripts/compare-gemini-models.js path/to/test-images/
```

### 2.4 Decision Criteria

| Flash-Lite Accuracy | Recommendation |
|---------------------|----------------|
| >= 95% | Migrate to Flash-Lite (full savings) |
| 90-95% | Consider for non-critical scans |
| < 90% | Keep Flash for production |

---

## Phase 3: Model Migration (If Approved)

If Flash-Lite comparison shows >= 95% accuracy:

### 3.1 Add Model Configuration

**File:** `src/providers/gemini-provider.js`

```javascript
// Add at top of file
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash'

// Update endpoint (around line 69)
const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`
```

### 3.2 Configure via Environment

```bash
# For production migration
wrangler secret put GEMINI_VISION_MODEL
# Enter: gemini-2.5-flash-lite
```

### 3.3 Rollback Plan

If issues arise after migration:

```bash
# Revert to Flash
wrangler secret put GEMINI_VISION_MODEL
# Enter: gemini-2.5-flash
wrangler deploy
```

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| CSV cache hit rate | > 25% | Search logs for `CSV_CACHE_TELEMETRY` |
| Token reduction | Measurable | Compare pre/post via `[GeminiProvider] Token usage` logs |
| Monthly cost | -30% to -50% | Google Cloud billing dashboard |
| Detection accuracy | No regression | Monitor user feedback, scan completion rates |

---

## Rollout Schedule

```
Phase 1: Quick Wins
├── 1.1 Temperature change (gemini-provider.js)
├── 1.2 Warming cache fix (warming-upload.js)
└── 1.3 Cache telemetry (csv-processor-core.js)

Phase 2: Model Comparison
└── Run comparison script with test images
    └── Decision: Migrate / Consider / Keep Flash

Phase 3: Model Migration (if approved)
├── Add model configuration
├── Deploy Flash-Lite
├── Monitor for 1 week
└── Full rollout or rollback
```

---

## Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/providers/gemini-provider.js` | Modify | Temperature 0.4 -> 0.2 |
| `src/handlers/warming-upload.js` | Modify | Add KV cache check |
| `src/utils/csv-processor-core.js` | Modify | Add cache telemetry |
| `scripts/compare-gemini-models.js` | New | Model comparison script |

---

## References

- [Gemini API Pricing](https://ai.google.dev/pricing)
- [Gemini Context Caching](https://ai.google.dev/gemini-api/docs/caching) (not applicable - prompt too small)
- [Gemini 2.5 Implicit Caching](https://developers.googleblog.com/en/gemini-2-5-models-now-support-implicit-caching/)
