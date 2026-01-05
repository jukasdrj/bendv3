#!/usr/bin/env tsx
/**
 * Alexandria Version Sync Check
 *
 * Ensures BendV3 is using the latest compatible Alexandria version.
 * Run this in CI/CD to detect when Alexandria has a new release.
 *
 * Exit codes:
 * 0 - Versions in sync
 * 1 - Update available (minor/patch)
 * 2 - Breaking change detected (major)
 */

import { readFileSync } from 'fs'
import { join } from 'path'

interface PackageJson {
  dependencies?: Record<string, string>
}

async function checkAlexandriaVersion() {
  console.log('🔍 Checking Alexandria version sync...\n')

  // Read current version from package.json
  const packageJsonPath = join(process.cwd(), 'package.json')
  const packageJson: PackageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  const currentVersion = packageJson.dependencies?.['alexandria-worker']?.replace('^', '')

  if (!currentVersion) {
    console.error('❌ ERROR: alexandria-worker not found in dependencies')
    process.exit(2)
  }

  console.log(`📦 Current: alexandria-worker@${currentVersion}`)

  // Fetch latest version from npm registry
  try {
    const response = await fetch('https://registry.npmjs.org/alexandria-worker/latest')
    if (!response.ok) {
      throw new Error(`npm registry returned ${response.status}`)
    }

    const data = await response.json()
    const latestVersion = data.version

    console.log(`📦 Latest:  alexandria-worker@${latestVersion}`)

    // Parse versions
    const [currentMajor, currentMinor, currentPatch] = currentVersion.split('.').map(Number)
    const [latestMajor, latestMinor, latestPatch] = latestVersion.split('.').map(Number)

    // Check for version differences
    if (currentMajor < latestMajor) {
      console.error(`\n🚨 BREAKING CHANGE DETECTED!`)
      console.error(`Alexandria has a major version update: v${currentVersion} → v${latestVersion}`)
      console.error(`This likely contains breaking API changes.`)
      console.error(`\nAction Required:`)
      console.error(`1. Review Alexandria's CHANGELOG for breaking changes`)
      console.error(`2. Update contract tests in tests/integration/alexandria-contract.test.ts`)
      console.error(`3. Update BendV3 code to handle API changes`)
      console.error(`4. Run: npm install alexandria-worker@${latestVersion}`)
      process.exit(2)
    }

    if (currentMinor < latestMinor || currentPatch < latestPatch) {
      console.warn(`\n⚠️  UPDATE AVAILABLE`)
      console.warn(`Alexandria has a ${currentMinor < latestMinor ? 'minor' : 'patch'} update: v${currentVersion} → v${latestVersion}`)
      console.warn(`\nRecommended Actions:`)
      console.warn(`1. Review Alexandria's CHANGELOG: https://www.npmjs.com/package/alexandria-worker`)
      console.warn(`2. Check if new fields are available (authors, covers, etc.)`)
      console.warn(`3. Update BendV3 API to expose new Alexandria fields`)
      console.warn(`4. Run: npm install alexandria-worker@${latestVersion}`)
      console.warn(`5. Update OpenAPI spec and republish @jukasdrj/bookstrack-api-client`)
      process.exit(1)
    }

    console.log(`\n✅ Versions in sync! BendV3 is using the latest Alexandria version.`)
    process.exit(0)

  } catch (error) {
    console.error(`\n❌ ERROR: Failed to fetch latest version from npm registry`)
    console.error(error)
    process.exit(2)
  }
}

checkAlexandriaVersion()
