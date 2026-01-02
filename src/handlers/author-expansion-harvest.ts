/**
 * @deprecated ISBNdb harvest disabled on 2025-12-03, file removal planned for March 2026 (aligned with V1 sunset)
 *
 * Author Expansion Harvest Handler - DEPRECATED
 *
 * This handler has been disabled during Alexandria Phase 2 rollout.
 * Alexandria now provides:
 * - 49.3M+ ISBNs at zero API cost (vs ISBNdb's 5000/day limit)
 * - Sub-100ms response times (vs ISBNdb's 300-500ms)
 * - Real-time cover processing via alexandria-cover-service.ts
 *
 * Migration Status:
 * - Phase 1 (Complete): Alexandria ISBN lookup primary
 * - Phase 2 (Complete): Alexandria cover processing replaces ISBNdb harvest
 * - Phase 3 (Pending): Alexandria title/author search
 *
 * Removal Timeline:
 * - Handler disabled: December 3, 2025
 * - File removal: March 1, 2026 (concurrent with V1 API sunset)
 *
 * @see src/services/alexandria-api.ts for new implementation
 * @see src/services/alexandria-cover-service.ts for cover processing
 * @see docs/CACHE_ARCHITECTURE.md for updated architecture
 */

import type { Env } from '../types/env'

/**
 * Author expansion harvest statistics
 */
interface AuthorHarvestStats {
  authorsProcessed: number
  authorsFailed: number
  totalBooksDiscovered: number
  totalISBNsHarvested: number
  isbndbBatchCalls: number
  cacheWarmingCalls: number
  newlyCached: number
  alreadyCached: number
  errors: string[]
}

/**
 * Author expansion harvest result
 */
interface AuthorExpansionResult {
  success: boolean
  deprecated?: boolean
  disabledDate?: string
  message: string
  stats: AuthorHarvestStats
}

/**
 * Execute author expansion harvest
 *
 * This function is deprecated and always returns with a deprecation notice.
 * Alexandria now handles all book metadata discovery in real-time, making
 * the batch harvest approach obsolete.
 *
 * @param _env - Cloudflare environment bindings (unused)
 * @param _authorCount - Number of authors to process (default: 25, unused)
 * @param _booksPerAuthor - Max books per author (default: 200, unused)
 * @returns Promise resolving to deprecation notice with empty stats
 *
 * @deprecated Use Alexandria's real-time API instead
 */
export async function executeAuthorExpansionHarvest(
  _env: Env,
  _authorCount: number = 25,
  _booksPerAuthor: number = 200,
): Promise<AuthorExpansionResult> {
  // DEPRECATED: Return early with deprecation notice
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('⚠️  DEPRECATED: author-expansion-harvest.ts')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('This harvest has been disabled as of 2025-12-03.')
  console.log('Book metadata now provided by Alexandria (49M+ ISBNs, zero cost).')
  console.log('Cover processing handled by alexandria-cover-service.ts')
  console.log('')
  console.log('Benefits of Alexandria:')
  console.log('  ✅ 49.3M+ ISBNs at zero API cost')
  console.log('  ✅ Sub-100ms response times')
  console.log('  ✅ No daily quota limits (vs ISBNdb 5000/day)')
  console.log('  ✅ Real-time processing, no batch jobs needed')
  console.log('')
  console.log('This file will be removed after March 2026 sunset.')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  return {
    success: true,
    deprecated: true,
    disabledDate: '2025-12-03',
    message: 'ISBNdb harvest disabled - using Alexandria real-time processing',
    stats: {
      authorsProcessed: 0,
      authorsFailed: 0,
      totalBooksDiscovered: 0,
      totalISBNsHarvested: 0,
      isbndbBatchCalls: 0,
      cacheWarmingCalls: 0,
      newlyCached: 0,
      alreadyCached: 0,
      errors: [],
    },
  }
}

/**
 * Manual trigger for testing (also deprecated)
 *
 * This function allows manual triggering of the harvest for testing purposes.
 * It will return a deprecation notice since the harvest is no longer active.
 *
 * @param env - Cloudflare environment bindings
 * @returns Promise resolving to deprecation notice
 *
 * @deprecated Use Alexandria's real-time API instead
 */
export async function manualTrigger(env: Env): Promise<AuthorExpansionResult> {
  console.log('🔧 Manual Author Expansion Harvest Trigger (DEPRECATED)')
  console.log('')

  const result = await executeAuthorExpansionHarvest(env)

  if (result.success && result.deprecated) {
    console.log('ℹ️  Harvest is deprecated - Alexandria handles real-time processing')
  }

  return result
}

/*
 * Original implementation removed (2025-12-03)
 *
 * This handler previously used ISBNdb batch API to harvest book metadata.
 * Alexandria integration now provides 49.3M+ ISBNs at zero cost with
 * sub-100ms response times, making the harvest obsolete.
 *
 * For historical reference, see git history before 2025-12-03.
 */
