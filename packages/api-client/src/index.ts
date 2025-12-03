import createClient from 'openapi-fetch'
import type { paths } from './schema'

export type { paths, components } from './schema'

// Export streaming utilities
export {
  createSSEStream,
  createWebSocketStream,
  useSSEStream_Example,
  useWebSocketStream_Example,
  type SSEProgressEvent,
  type WebSocketProgressMessage,
  type SSEStreamOptions,
  type WebSocketStreamOptions,
} from './streaming'

/**
 * Create a type-safe BooksTrack API client
 *
 * @param baseUrl - API base URL (default: https://api.oooefam.net)
 * @param options - Additional fetch options (headers, credentials, etc.)
 *
 * @example
 * ```typescript
 * import { createBooksTrackClient } from '@bookstrack/api-client'
 *
 * const client = createBooksTrackClient({
 *   baseUrl: 'https://api.oooefam.net'
 * })
 *
 * // Type-safe API calls
 * const { data, error } = await client.GET('/v1/search/isbn', {
 *   params: { query: { isbn: '9780439708180' } }
 * })
 *
 * if (error) {
 *   console.error('API Error:', error)
 * } else {
 *   console.log('Book:', data.data)
 * }
 * ```
 */
export function createBooksTrackClient(options?: {
  baseUrl?: string
  headers?: HeadersInit
  credentials?: RequestCredentials
}) {
  const baseUrl = options?.baseUrl || 'https://api.oooefam.net'

  return createClient<paths>({
    baseUrl,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    credentials: options?.credentials
  })
}

/**
 * Default client instance for convenience
 *
 * @example
 * ```typescript
 * import { client } from '@bookstrack/api-client'
 *
 * const { data } = await client.GET('/health')
 * ```
 */
export const client = createBooksTrackClient()
