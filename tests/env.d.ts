/**
 * Test Environment Types for Cloudflare Workers
 *
 * Extends the main Env interface with test-specific bindings.
 * Used by @cloudflare/vitest-pool-workers to provide typed env in tests.
 *
 * @see https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/
 */

import type { Env } from '../src/types/env'

declare module 'cloudflare:test' {
  /**
   * ProvidedEnv is the type of the `env` object passed to tests.
   * It extends the main Env interface with any test-specific bindings.
   */
  interface ProvidedEnv extends Env {
    // Test-specific bindings
    TEST_MODE: string
  }
}
