import { defineConfig } from 'vitest/config'

/**
 * Vitest Configuration for Node.js/Forks Pool
 *
 * Runs legacy tests that haven't been migrated to Workers pool yet.
 * These tests may use vi.spyOn and Node.js-specific features.
 *
 * Migration target: Move tests to tests/workers/ and use vitest.workers.config.ts
 */
export default defineConfig({
  test: {
    name: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],

    // Include all tests EXCEPT smoke and workers (those run in Workers pool)
    include: [
      'tests/**/*.test.{js,ts}',
    ],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      'tests/archive/**',
      'tests/smoke/**',       // Runs in Workers pool
      'tests/workers/**',     // Runs in Workers pool
      'tests/normalizers/**', // Runs in Workers pool (pure tests)
      'tests/utils/**',       // Runs in Workers pool (pure tests)
    ],

    reporters: ['verbose'],
    testTimeout: 10000,

    // Use forks pool for better isolation (matches original config)
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
        minForks: 1,
      },
    },

    // Sequential execution in safe mode
    fileParallelism: process.env.TEST_SAFE_MODE === 'true' ? false : true,

    // Coverage configuration
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
