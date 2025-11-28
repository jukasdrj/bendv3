/**
 * Manual trigger for weekly recommendations cron
 *
 * Usage: node scripts/trigger-recommendations-cron.js
 *
 * This script manually invokes the recommendations cron handler
 * to populate the weekly recommendations cache without waiting for Sunday.
 */

import { handleRecommendationsCron } from '../src/cron/recommendations-cron.ts'

async function triggerRecommendationsCron() {
  console.log('🚀 Triggering weekly recommendations cron manually...')

  // Mock env object with required bindings
  // In production, these would be provided by Cloudflare Workers runtime
  const env = {
    DB: null, // Will use fallback if D1 not available
    CACHE: null, // Will skip caching if not available
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  }

  try {
    await handleRecommendationsCron(env)
    console.log('✅ Weekly recommendations cron completed successfully')
  } catch (error) {
    console.error('❌ Error running recommendations cron:', error)
    process.exit(1)
  }
}

triggerRecommendationsCron()
