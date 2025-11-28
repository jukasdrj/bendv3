#!/usr/bin/env tsx
/**
 * Breaking Change Detection Script
 *
 * Compares OpenAPI specs between current branch and main branch to detect breaking changes.
 * Uses openapi-diff library to identify:
 * - Removed endpoints
 * - Changed response schemas
 * - Removed required fields
 * - Changed parameter types
 *
 * Usage:
 *   npm run detect-breaking-changes
 *   npm run detect-breaking-changes -- --base-spec=./spec-v1.yaml --current-spec=./spec-v2.yaml
 *
 * Exit codes:
 *   0 - No breaking changes detected
 *   1 - Breaking changes detected (fails CI)
 *   2 - Script error (invalid args, file not found, etc.)
 */

import openApiDiff from 'openapi-diff'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface BreakingChange {
  type: string
  path: string
  description: string
  severity: 'breaking' | 'non-breaking'
}

/**
 * Parse command line arguments
 */
function parseArgs(): { baseSpec: string; currentSpec: string } {
  const args = process.argv.slice(2)
  let baseSpec = 'docs/openapi.yaml'
  let currentSpec = 'docs/openapi.yaml'

  for (const arg of args) {
    if (arg.startsWith('--base-spec=')) {
      baseSpec = arg.split('=')[1]
    } else if (arg.startsWith('--current-spec=')) {
      currentSpec = arg.split('=')[1]
    }
  }

  return { baseSpec, currentSpec }
}

/**
 * Get the default branch name (main or bendv3)
 */
async function getDefaultBranch(): Promise<string> {
  try {
    const { stdout } = await execAsync('git symbolic-ref refs/remotes/origin/HEAD')
    return stdout.trim().replace('refs/remotes/origin/', '')
  } catch {
    // Fallback to common names
    return 'main'
  }
}

/**
 * Get OpenAPI spec from base branch via git
 */
async function getBaseBranchSpec(specPath: string): Promise<string> {
  try {
    const baseBranch = await getDefaultBranch()
    const { stdout } = await execAsync(`git show ${baseBranch}:${specPath}`)
    return stdout
  } catch (error: any) {
    // If file doesn't exist on base branch, return empty spec
    if (error.message.includes('does not exist') || error.message.includes('invalid object name')) {
      console.warn(`⚠️  Spec not found on base branch: ${specPath}`)
      console.warn('   This is expected for initial OpenAPI migration')
      return JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Empty', version: '0.0.0' },
        paths: {}
      })
    }
    throw error
  }
}

/**
 * Analyze diff results to identify breaking changes
 */
function analyzeBreakingChanges(diff: any): BreakingChange[] {
  const breakingChanges: BreakingChange[] = []

  // Check for removed paths (breaking)
  if (diff.breakingDifferencesFound) {
    for (const change of diff.breakingDifferences || []) {
      breakingChanges.push({
        type: change.type || 'unknown',
        path: change.sourceSpecEntityDetails?.[0]?.location || 'unknown',
        description: change.action || 'Unknown breaking change',
        severity: 'breaking'
      })
    }
  }

  return breakingChanges
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Detecting breaking changes in OpenAPI spec...\n')

  const { baseSpec, currentSpec } = parseArgs()

  // Check if current spec exists
  if (!existsSync(currentSpec)) {
    console.error(`❌ Current spec not found: ${currentSpec}`)
    process.exit(2)
  }

  try {
    // Get base branch spec
    const baseBranch = await getDefaultBranch()
    console.log(`📥 Fetching base spec from ${baseBranch} branch: ${baseSpec}`)
    const baseSpecContent = await getBaseBranchSpec(baseSpec)

    // Read current spec
    console.log(`📥 Reading current spec: ${currentSpec}`)
    const currentSpecContent = await readFile(currentSpec, 'utf-8')

    // Compare specs
    console.log('🔬 Comparing OpenAPI specs...\n')

    const diffResult = await openApiDiff.diffSpecs({
      sourceSpec: {
        content: baseSpecContent,
        location: 'main:' + baseSpec,
        format: baseSpec.endsWith('.yaml') ? 'openapi3' : 'openapi3'
      },
      destinationSpec: {
        content: currentSpecContent,
        location: currentSpec,
        format: currentSpec.endsWith('.yaml') ? 'openapi3' : 'openapi3'
      }
    })

    // Analyze changes
    const breakingChanges = analyzeBreakingChanges(diffResult)

    // Report results
    if (breakingChanges.length === 0) {
      console.log('✅ No breaking changes detected!')
      console.log('\nSummary:')
      console.log(`  - Breaking changes: 0`)
      console.log(`  - Non-breaking changes: ${diffResult.nonBreakingDifferences?.length || 0}`)
      process.exit(0)
    } else {
      console.log('❌ Breaking changes detected!\n')
      console.log('Breaking Changes:')
      console.log('=' .repeat(80))

      for (const change of breakingChanges) {
        console.log(`\n🚨 ${change.type}`)
        console.log(`   Path: ${change.path}`)
        console.log(`   ${change.description}`)
      }

      console.log('\n' + '='.repeat(80))
      console.log(`\nTotal breaking changes: ${breakingChanges.length}`)
      console.log('\n⚠️  Breaking changes require a MAJOR version bump (x.0.0)')
      console.log('   or must be reverted before merging to main.\n')

      process.exit(1)
    }
  } catch (error: any) {
    console.error('❌ Error detecting breaking changes:', error.message)
    console.error('\nStack trace:')
    console.error(error.stack)
    process.exit(2)
  }
}

main()
