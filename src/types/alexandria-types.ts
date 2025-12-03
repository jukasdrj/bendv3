/**
 * Alexandria API Type Definitions (Placeholder)
 *
 * TODO: Replace with @ooheynerds/alexandria-types package when published
 *
 * These types mirror the Alexandria worker's exported AppType for Hono RPC.
 * Once Alexandria publishes its type package, this file will be replaced with
 * an import from that package.
 */

import type { Hono } from 'hono'

/**
 * TEMPORARY PLACEHOLDER: Alexandria's exported AppType
 *
 * This interface represents the routes exposed by the Alexandria worker.
 * It should match the `export type AlexandriaAppType = typeof routes` from
 * the Alexandria worker's index.ts file.
 *
 * **REPLACEMENT STEPS (Once Alexandria Publishes Types):**
 * 1. Install: `npm install @ooheynerds/alexandria-types`
 * 2. Replace this file with: `export type { AlexandriaAppType } from '@ooheynerds/alexandria-types'`
 * 3. Delete all placeholder interfaces below
 *
 * @see https://github.com/your-org/alexandria/worker/index.ts
 * @see docs/ALEXANDRIA_RPC_MIGRATION.md for full migration checklist
 */
export interface AlexandriaAppType extends Hono {
  // Placeholder - routes will be auto-inferred from Alexandria's AppType export
  // This empty interface prevents type errors until the real types are available
}

/**
 * Alexandria search query parameters (inferred from current implementation)
 */
export interface AlexandriaSearchQuery {
  isbn?: string
  title?: string
  author?: string
  limit?: string
}

/**
 * Alexandria API response structure for ISBN lookup
 */
export interface AlexandriaISBNResponse {
  results: AlexandriaResult[]
}

/**
 * Single result from Alexandria API
 *
 * **DEPRECATED: Duplicated from src/services/normalizers/alexandria.ts**
 *
 * This type is temporarily duplicated here for the RPC client placeholder.
 * Once Alexandria publishes @ooheynerds/alexandria-types, this interface
 * will be removed in favor of the official type export.
 *
 * @deprecated Remove when @ooheynerds/alexandria-types is available
 */
export interface AlexandriaResult {
  isbn?: string
  title?: string
  author?: string
  publisher?: string
  publish_date?: string
  pages?: number
  cover_url?: string
  work_id?: string
  work_title?: string
  work_description?: string
  author_key?: string
  author_name?: string
  author_bio?: string
}
