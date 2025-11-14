import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Use globals for describe, it, expect without importing
    globals: true,

    // Node environment for Cloudflare Workers testing
    environment: 'node',

    // Global setup files - run BEFORE all tests
    setupFiles: ['./tests/setup.js'],

    // Include all test files
    include: ['tests/**/*.test.js'],

    // Exclude node_modules and other non-test directories
    exclude: ['node_modules', 'dist', '.idea', '.git'],

    // Reporter configuration
    reporters: ['verbose'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportOnFailure: true,
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.js',
        '**/*.spec.js',
        'dist/',
        '.wrangler/'
      ],
      // Coverage thresholds for critical paths
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75
      }
    },

    // Test timeout (10 seconds default)
    testTimeout: 10000,

    // Bail after first failure (optional, remove if you want all results)
    // bail: 1,

    // Parallel test execution
    threads: true,
    maxThreads: 4,
    minThreads: 1
  }
})
