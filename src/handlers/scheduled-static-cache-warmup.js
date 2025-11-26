/**
 * Scheduled Static Cache Warm-up Handler
 *
 * Ensures a static list of popular books is always in the cache, especially
 * after new deployments clear the in-memory cache.
 *
 * This complements the analytics-driven cache warming by guaranteeing a baseline
 * of popular books are always fast to access.
 *
 * Cron Schedule: 0 */6 * * * (every 6 hours)
 */

import { POPULAR_ISBNS } from '../config/popular-books.js';
import { findBookByISBN } from '../services/book-service.ts';

/**
 * Main handler for the static cache warm-up cron job.
 *
 * @param {Object} env - Cloudflare environment bindings
 * @param {Object} ctx - Execution context
 * @returns {Promise<Object>} Stats object with warming results
 */
export async function handleStaticCacheWarmup(env, ctx) {
  const startTime = Date.now();
  console.log(`🔥 Starting static cache warm-up for ${POPULAR_ISBNS.length} predefined books...`);

  const stats = {
    total: POPULAR_ISBNS.length,
    warmed: 0,
    skipped: 0, // In this static model, a skip means an error occurred.
    errors: 0,
    duration: 0,
  };

  for (const isbn of POPULAR_ISBNS) {
    try {
      // Calling findBookByISBN handles the entire cache-check-then-fetch-and-save logic.
      // If the book is already in the repository (KV/D1), it's a quick no-op.
      // If not, it gets fetched from external APIs and saved.
      await findBookByISBN(isbn, env, ctx);
      stats.warmed++;

      // Rate limit to avoid overwhelming external APIs.
      // 1 request per 100ms = 10 requests/second.
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      stats.errors++;
      console.error(`[StaticWarmup] Failed to warm ISBN ${isbn}:`, error);
    }
  }

  stats.duration = Date.now() - startTime;
  console.log(
    `✅ Static cache warm-up complete: ${stats.warmed}/${stats.total} books processed, ${stats.errors} errors in ${stats.duration}ms`
  );

  return { success: true, stats };
}
