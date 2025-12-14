import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

/**
 * Vitest Configuration for Cloudflare Workers
 *
 * Uses @cloudflare/vitest-pool-workers for smoke tests (true Workers runtime).
 * Legacy tests continue running in Node environment until migrated.
 *
 * @see https://developers.cloudflare.com/workers/testing/vitest-integration/
 * @see https://hono.dev/examples/cloudflare-vitest
 */
export default defineWorkersConfig({
  test: {
    // Use globals for describe, it, expect without importing
    globals: true,

    // Global setup files - run BEFORE all tests
    setupFiles: ['./tests/setup.js'],

    // Include all test files (both JavaScript and TypeScript)
    include: ['tests/**/*.test.{js,ts}'],

    // Exclude node_modules, archive, and other non-test directories
    exclude: ['node_modules', 'dist', '.idea', '.git', 'tests/archive/**'],

    // Reporter configuration
    reporters: ['verbose'],

    // Test timeout (10 seconds default)
    testTimeout: 10000,

    // Cloudflare Workers pool configuration
    poolOptions: {
      workers: {
        // Use test-specific wrangler config (no migrations)
        wrangler: {
          configPath: './wrangler.test.jsonc',
        },
        // Miniflare options for additional test-specific bindings
        miniflare: {
          bindings: {
            TEST_MODE: 'true',
          },
        },
        // Only run smoke tests in Workers pool for now
        // Legacy tests need migration before they can run in Workers runtime
        isolatedStorage: true,
      },
    },

    // Sequential fallback for low-resource mode (use with npm run test:safe)
    fileParallelism: process.env.TEST_SAFE_MODE === 'true' ? false : true,

    // Coverage configuration (uses Istanbul for Workers compatibility)
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportOnFailure: true,
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.{js,ts}',
        '**/*.spec.{js,ts}',
        'dist/',
        '.wrangler/',
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
      },
    },
  },
})
