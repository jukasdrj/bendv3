import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

/**
 * Vitest Configuration for Cloudflare Workers Pool
 *
 * Runs smoke tests and migrated tests in real workerd runtime.
 * Tests must NOT use vi.spyOn (use vi.mock factory pattern instead).
 *
 * @see https://developers.cloudflare.com/workers/testing/vitest-integration/
 */
export default defineWorkersConfig({
  test: {
    name: 'workers',
    globals: true,
    setupFiles: ['./tests/setup-workers.js'],

    // Smoke tests + pure unit tests (no vi.spyOn, no mocking)
    include: [
      'tests/smoke/**/*.test.{js,ts}',
      'tests/workers/**/*.test.{js,ts}',
      // Pure normalizer tests (no mocking, just data transformation)
      'tests/normalizers/**/*.test.{js,ts}',
      // Pure utility tests (no mocking)
      'tests/utils/**/*.test.{js,ts}',
    ],

    exclude: ['node_modules', 'dist', '.idea', '.git', 'tests/archive/**'],

    reporters: ['verbose'],
    testTimeout: 10000,

    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.test.jsonc',
        },
        miniflare: {
          bindings: {
            TEST_MODE: 'true',
          },
        },
        isolatedStorage: true,
      },
    },
  },
})
