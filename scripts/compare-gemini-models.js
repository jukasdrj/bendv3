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
    if (!Array.isArray(books)) books = []
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
  console.log('-'.repeat(60))

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

  const savings = flashCost > 0 ? ((1 - liteCost/flashCost) * 100).toFixed(1) : '0'
  console.log(`\n  SAVINGS: ${savings}% ($${(flashCost - liteCost).toFixed(6)} per image)`)

  // Compare book detection
  const flashTitles = new Set(flashResult.books.map(b => (b.title || '').toLowerCase().trim()).filter(Boolean))
  const liteTitles = new Set(liteResult.books.map(b => (b.title || '').toLowerCase().trim()).filter(Boolean))

  const onlyInFlash = [...flashTitles].filter(t => !liteTitles.has(t))
  const onlyInLite = [...liteTitles].filter(t => !flashTitles.has(t))

  if (onlyInFlash.length > 0) {
    console.log(`\n  [!] Only detected by Flash (${onlyInFlash.length}):`)
    onlyInFlash.slice(0, 5).forEach(t => console.log(`      - ${t}`))
    if (onlyInFlash.length > 5) console.log(`      ... and ${onlyInFlash.length - 5} more`)
  }
  if (onlyInLite.length > 0) {
    console.log(`\n  [!] Only detected by Flash-Lite (${onlyInLite.length}):`)
    onlyInLite.slice(0, 5).forEach(t => console.log(`      - ${t}`))
    if (onlyInLite.length > 5) console.log(`      ... and ${onlyInLite.length - 5} more`)
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

  const accuracy = totalFlashBooks > 0 ? (totalLiteBooks / totalFlashBooks * 100).toFixed(1) : '100'
  console.log(`\nFlash-Lite detection rate vs Flash: ${accuracy}%`)

  console.log('\n' + '-'.repeat(60))
  if (parseFloat(accuracy) >= 95) {
    console.log('RECOMMENDATION: Flash-Lite is viable (>=95% detection)')
    console.log('Proceed with migration to save ~$55-60/month')
  } else if (parseFloat(accuracy) >= 90) {
    console.log('RECOMMENDATION: Flash-Lite has acceptable detection (90-95%)')
    console.log('Consider for cost-sensitive use cases')
  } else {
    console.log('RECOMMENDATION: Keep Flash for production (<90% detection)')
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
  const outputFile = path.join(process.cwd(), 'comparison-results.json')
  fs.writeFileSync(outputFile, JSON.stringify({ summary, results }, null, 2))
  console.log(`\nDetailed results saved to: ${outputFile}`)
}

main().catch(err => {
  console.error('ERROR:', err.message)
  process.exit(1)
})
