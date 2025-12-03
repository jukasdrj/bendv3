/**
 * Alexandria RPC Client
 *
 * Provides a strictly typed Hono RPC client for communicating with the Alexandria
 * worker via Cloudflare Service Bindings.
 *
 * Benefits:
 * - Sub-millisecond latency (no public internet round-trip)
 * - Full type safety (TypeScript knows all available routes and parameters)
 * - Automatic request/response validation via Zod schemas
 * - No manual fetch() calls or URL construction
 *
 * Architecture:
 * - Uses Cloudflare Service Bindings (configured in wrangler.jsonc)
 * - Hono RPC client proxies calls through the service binding's fetch() method
 * - Type inference from Alexandria's exported AppType ensures compile-time safety
 *
 * @see wrangler.jsonc - Service binding configuration
 * @see https://hono.dev/docs/guides/rpc - Hono RPC documentation
 * @see docs/ALEXANDRIA_RPC_MIGRATION.md - Full migration guide
 */

import { hc } from 'hono/client'
import type { AlexandriaAppType } from '../types/alexandria-types'
import type { Env } from '../types/env'

/**
 * Alexandria RPC client instance
 *
 * This type represents the fully-typed client that can make RPC calls to Alexandria.
 * All routes, query parameters, and response types are inferred from AlexandriaAppType.
 */
export type AlexandriaClient = ReturnType<typeof hc<AlexandriaAppType>>

/**
 * Creates a strictly typed RPC client for Alexandria
 *
 * Uses Service Binding (internal) for direct worker-to-worker communication.
 * Falls back to external fetch if Service Binding is not available (local dev).
 *
 * Usage:
 * ```typescript
 * const client = createAlexandriaClient(env)
 *
 * // TypeScript knows this route exists and what parameters it accepts
 * const response = await client.api.search.$get({
 *   query: { isbn: '9780439708180' }
 * })
 *
 * if (response.ok) {
 *   const data = await response.json() // Typed response
 * }
 * ```
 *
 * @param env - Worker environment bindings (must include ALEXANDRIA service binding)
 * @returns Strictly typed Hono RPC client
 *
 * @throws Never throws - falls back to external URL if service binding unavailable
 */
export function createAlexandriaClient(env: Env): AlexandriaClient {
  // Check if Service Binding is available (production/staging)
  if (env.ALEXANDRIA) {
    console.log('🔗 Using Alexandria Service Binding (internal RPC)')

    // Use service binding's fetch for sub-millisecond RPC
    // The 'https://alexandria.internal' URL is never actually used (service binding intercepts)
    // but Hono requires a base URL for the client initialization
    return hc<AlexandriaAppType>('https://alexandria.internal', {
      fetch: env.ALEXANDRIA.fetch.bind(env.ALEXANDRIA),
    })
  }

  // Fallback to external URL (local development without service bindings)
  console.warn('⚠️ Alexandria Service Binding not available, using external URL')
  console.warn('   This will be slower and requires Alexandria to be deployed')

  const externalUrl = env.ALEXANDRIA_BASE_URL || 'https://alexandria.ooheynerds.com'
  console.log(`🌐 Using Alexandria external URL: ${externalUrl}`)

  // Build headers with conditional Cloudflare Access authentication
  const headers: Record<string, string> = {
    'User-Agent': 'BooksTracker/1.0 (nerd@ooheynerds.com) AlexandriaRPCClient/1.0.0',
    Accept: 'application/json',
  }

  // Add Cloudflare Access service token headers if available
  // (Required when Alexandria is behind Cloudflare Access)
  if (env.ALEXANDRIA_CLIENT_ID && env.ALEXANDRIA_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = env.ALEXANDRIA_CLIENT_ID
    headers['CF-Access-Client-Secret'] = env.ALEXANDRIA_CLIENT_SECRET
  }

  return hc<AlexandriaAppType>(externalUrl, {
    // Use standard fetch for external calls
    fetch: globalThis.fetch.bind(globalThis),
    headers,
  })
}

/**
 * Type guard to check if Alexandria service binding is available
 *
 * Useful for conditional logic that needs to know if we're using
 * internal RPC or external HTTP calls.
 *
 * @param env - Worker environment bindings
 * @returns True if ALEXANDRIA service binding is configured
 */
export function hasAlexandriaServiceBinding(env: Env): boolean {
  return !!env.ALEXANDRIA
}

/**
 * Get the effective Alexandria URL for logging/debugging
 *
 * Returns "internal" for service bindings or the external URL otherwise.
 *
 * @param env - Worker environment bindings
 * @returns URL string for logging purposes
 */
export function getAlexandriaEffectiveUrl(env: Env): string {
  if (hasAlexandriaServiceBinding(env)) {
    return 'internal (service binding)'
  }
  return env.ALEXANDRIA_BASE_URL || 'https://alexandria.ooheynerds.com'
}
