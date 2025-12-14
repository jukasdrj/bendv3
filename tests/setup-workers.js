/**
 * Setup for Workers Pool Tests
 *
 * Minimal setup for tests running in real workerd runtime.
 * Does NOT include Node.js polyfills (not needed in Workers).
 *
 * @see vitest.workers.config.ts
 */

import { vi, beforeEach } from 'vitest'

// ============================================================================
// WORKERD RUNTIME SETUP
// ============================================================================

// In workerd, DurableObject is available globally via cloudflare:workers
// No mock needed - use real runtime classes

// ============================================================================
// TEST LIFECYCLE HOOKS
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// NOTES FOR TEST AUTHORS
// ============================================================================

/**
 * In Workers pool tests, use cloudflare:test for environment bindings:
 *
 * @example
 * import { env } from 'cloudflare:test'
 * const cache = env.CACHE
 */
