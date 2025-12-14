/**
 * Vitest Configuration - IDE Entry Point
 *
 * Dual-pool architecture for Cloudflare Workers testing:
 *
 * Workers Pool (vitest.workers.config.ts) - 196 tests:
 *   - tests/smoke/**     - Quick validation tests
 *   - tests/normalizers/** - Pure data transformation tests
 *   - tests/utils/**     - Pure utility function tests
 *   - tests/workers/**   - Future migrated tests
 *
 * Node Pool (vitest.node.config.ts) - 1280 tests:
 *   - All other tests (vi.spyOn compatible)
 *
 * Commands:
 *   npm run test:workers  - Workers pool only (2.5s)
 *   npm run test:node     - Node pool only (19s)
 *   npm run test          - Both pools sequentially
 *   npm run test:smoke    - Quick validation (same as test:workers)
 *   TEST_SAFE_MODE=true npm test  - Sequential execution for debugging
 *
 * @see https://developers.cloudflare.com/workers/testing/vitest-integration/
 * @see GitHub Issue #216 - Test Migration to @cloudflare/vitest-pool-workers
 */
export { default } from './vitest.workers.config'
