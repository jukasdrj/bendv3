#!/usr/bin/env node
/**
 * Export OpenAPI spec from Hono router to docs/openapi.json
 *
 * Usage: node scripts/export-openapi-spec.js [url]
 * Default URL: http://localhost:8787/doc/openapi.json
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const url = process.argv[2] || 'http://localhost:8787/doc/openapi.json'
const outputPath = path.join(__dirname, '..', 'docs', 'openapi.json')

console.log(`Fetching OpenAPI spec from ${url}...`)

fetch(url)
  .then(res => {
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    return res.json()
  })
  .then(spec => {
    const json = JSON.stringify(spec, null, 2)
    fs.writeFileSync(outputPath, json, 'utf-8')
    console.log(`✅ Saved OpenAPI spec to ${outputPath}`)
    console.log(`   ${json.split('\n').length} lines, ${json.length} bytes`)
    console.log(`   OpenAPI version: ${spec.openapi}`)
    console.log(`   API version: ${spec.info.version}`)
    console.log(`   Endpoints: ${Object.keys(spec.paths).length}`)
  })
  .catch(err => {
    console.error(`❌ Failed to export OpenAPI spec: ${err.message}`)
    console.error(`   Make sure the dev server is running: npm run dev`)
    process.exit(1)
  })
