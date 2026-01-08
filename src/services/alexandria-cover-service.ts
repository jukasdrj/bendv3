/**
 * Alexandria Cover Service
 *
 * Integrates with Alexandria's cover processing endpoints for downloading,
 * compressing, and storing book cover images.
 *
 * API: https://alexandria.ooheynerds.com/api/covers/process
 * Auth: Cloudflare Access service token (CF-Access-Client-Id/Secret headers)
 */

import type { ExternalAPIEnv } from './external-apis'

// ============================================================================
// CONSTANTS
// ============================================================================

const ALEXANDRIA_BASE_URL = 'https://alexandria.ooheynerds.com'
const ALEXANDRIA_USER_AGENT = 'BooksTracker/1.0 (nerd@ooheynerds.com) AlexandriaClient/1.0.0'
const PLACEHOLDER_URL = 'https://placehold.co/300x450/e0e0e0/666666?text=No+Cover'
const REQUEST_TIMEOUT_MS = 5000
const DEFAULT_MAX_RETRIES = 2
const RETRY_BACKOFF_MS = [100, 200, 400] // Exponential backoff

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Cover processing request payload
 */
interface CoverProcessingRequest {
  work_key: string
  provider_url: string
  isbn?: string
}

/**
 * Cover processing response from Alexandria
 */
interface CoverProcessingResponse {
  success: boolean
  urls: {
    large: string
    medium: string
    small: string
  }
  metadata?: {
    processedAt: string
    originalSize: number
    r2Key: string
    sourceUrl: string
    workKey: string
  }
  error?: string
}

/**
 * Provider data for cover URL selection
 */
interface CoverProviders {
  isbndb?: any
  googleBooks?: any
  openLibrary?: any
  alexandria?: any
}

/**
 * Cover URL selection result
 */
interface CoverURLResult {
  url: string
  source: string
  quality: 'high' | 'medium' | 'low' | 'missing'
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Process book cover through Alexandria service
 *
 * Downloads cover from provider URL, compresses to multiple sizes,
 * and stores in R2. Returns placeholder URLs on any error.
 *
 * @param request - Cover processing request
 * @param env - Worker environment bindings
 * @returns Cover URLs or placeholder on error
 */
async function processBookCoverInternal(
  request: CoverProcessingRequest,
  env: ExternalAPIEnv,
): Promise<CoverProcessingResponse> {
  const startTime = Date.now()

  try {
    console.log(`[AlexandriaCover] Processing cover for work_key: ${request.work_key}`)

    const processUrl = `${ALEXANDRIA_BASE_URL}/api/covers/process`

    // Get service token credentials for Cloudflare Access bypass
    const clientId = env.ALEXANDRIA_CLIENT_ID
    const clientSecret = env.ALEXANDRIA_CLIENT_SECRET

    const headers: Record<string, string> = {
      'User-Agent': ALEXANDRIA_USER_AGENT,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    // Add Cloudflare Access service token headers if available
    if (clientId && clientSecret) {
      headers['CF-Access-Client-Id'] = clientId
      headers['CF-Access-Client-Secret'] = clientSecret
    } else {
      console.warn('[AlexandriaCover] Missing ALEXANDRIA_CLIENT_ID or CLIENT_SECRET')
    }

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(processUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          `[AlexandriaCover] API error: ${response.status} ${response.statusText}`,
          errorText,
        )

        // Return placeholder on any error
        return createPlaceholderResponse(request.work_key)
      }

      const data: CoverProcessingResponse = await response.json()

      const elapsedMs = Date.now() - startTime
      console.log(`[AlexandriaCover] Success for ${request.work_key} (${elapsedMs}ms)`)

      return data
    } catch (fetchError: any) {
      clearTimeout(timeoutId)

      if (fetchError.name === 'AbortError') {
        console.error(`[AlexandriaCover] Request timeout after ${REQUEST_TIMEOUT_MS}ms`)
      } else {
        console.error('[AlexandriaCover] Fetch error:', fetchError.message)
      }

      return createPlaceholderResponse(request.work_key)
    }
  } catch (error: any) {
    console.error('[AlexandriaCover] Unexpected error:', error.message)
    return createPlaceholderResponse(request.work_key)
  }
}

/**
 * Process book cover with automatic retries
 *
 * Wraps processBookCoverInternal with exponential backoff retry logic.
 * Skips retries for "Domain not allowed" errors.
 *
 * @param request - Cover processing request
 * @param env - Worker environment bindings
 * @param maxRetries - Maximum retry attempts (default: 2)
 * @returns Cover URLs or placeholder on error
 */
export async function processBookCover(
  request: CoverProcessingRequest,
  env: ExternalAPIEnv,
  maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<CoverProcessingResponse> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await processBookCoverInternal(request, env)

      // Don't retry on "Domain not allowed" errors
      if (!result.success && result.error?.includes('Domain not allowed')) {
        console.log('[AlexandriaCover] Domain not allowed - skipping retries')
        return result
      }

      // Return successful results immediately
      if (result.success) {
        if (attempt > 0) {
          console.log(`[AlexandriaCover] Success on attempt ${attempt + 1}`)
        }
        return result
      }

      // If not successful but no error (edge case), return as-is
      if (!result.error) {
        return result
      }

      // Last error: result.error
    } catch (error: any) {
      // Last error logged below
      console.error(`[AlexandriaCover] Attempt ${attempt + 1} failed:`, error.message)
    }

    // If we have more retries available, wait with exponential backoff
    if (attempt < maxRetries) {
      const backoffMs = RETRY_BACKOFF_MS[attempt] || RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]
      console.log(`[AlexandriaCover] Retrying in ${backoffMs}ms...`)
      await new Promise((resolve) => setTimeout(resolve, backoffMs))
    }
  }

  // All retries exhausted - return placeholder
  console.error(`[AlexandriaCover] All retries exhausted for ${request.work_key}`)
  return createPlaceholderResponse(request.work_key)
}

/**
 * Queue cover processing request to Alexandria (async)
 *
 * For non-blocking cover downloads - use when you don't need immediate results.
 * Sends messages directly to Alexandria's cover queue using Cloudflare Queues.
 *
 * @param request - Cover processing request
 * @param env - Worker environment with ALEXANDRIA_COVER_QUEUE binding
 * @param priority - Priority level ('high' | 'normal' | 'low')
 * @returns Queue send result
 */
export async function queueCoverProcessing(
  request: CoverProcessingRequest,
  env: ExternalAPIEnv,
  priority: 'high' | 'normal' | 'low' = 'normal',
): Promise<{ queued: boolean; error?: string }> {
  try {
    // Check if ALEXANDRIA_COVER_QUEUE binding exists (preferred - direct queue access)
    // @ts-expect-error - ALEXANDRIA_COVER_QUEUE binding from wrangler.toml
    if (env.ALEXANDRIA_COVER_QUEUE) {
      try {
        // @ts-expect-error
        await env.ALEXANDRIA_COVER_QUEUE.send({
          isbn: request.isbn,
          work_key: request.work_key,
          provider_url: request.provider_url,
          priority,
          queued_at: new Date().toISOString(),
        })

        console.log(
          `[CoverQueue] Queued ${request.isbn || request.work_key} via queue binding (priority: ${priority})`,
        )
        return { queued: true }
      } catch (queueError: any) {
        console.error(`[CoverQueue] Queue binding failed: ${queueError.message}`)
        // Fall through to HTTP fallback
      }
    }

    // Fallback: HTTP POST to Alexandria's queue endpoint (if queue binding not available)
    console.warn('[CoverQueue] ALEXANDRIA_COVER_QUEUE binding not found, using HTTP fallback')
    const queueUrl = `${ALEXANDRIA_BASE_URL}/api/covers/queue`
    const clientId = env.ALEXANDRIA_CLIENT_ID
    const clientSecret = env.ALEXANDRIA_CLIENT_SECRET

    const headers: Record<string, string> = {
      'User-Agent': ALEXANDRIA_USER_AGENT,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    // Add Cloudflare Access service token headers if available
    if (clientId && clientSecret) {
      headers['CF-Access-Client-Id'] = clientId
      headers['CF-Access-Client-Secret'] = clientSecret
    } else {
      console.warn('[CoverQueue] Missing ALEXANDRIA_CLIENT_ID or CLIENT_SECRET')
    }

    const response = await fetch(queueUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...request, priority }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    console.log(
      `[CoverQueue] Queued ${request.isbn || request.work_key} via HTTP (priority: ${priority})`,
    )
    return { queued: true }
  } catch (error: any) {
    console.error('[CoverQueue] Failed to queue:', error.message)
    return { queued: false, error: error.message }
  }
}

/**
 * Select best cover URL from available providers
 *
 * Priority order (highest to lowest quality):
 * 1. ISBNdb - Highest quality commercial images
 * 2. Google Books (zoom=3) - High quality thumbnails
 * 3. Alexandria - Medium quality OpenLibrary-sourced
 * 4. OpenLibrary cover_i - Medium quality
 * 5. Google Books (zoom=2) - Low quality thumbnails
 * 6. Placeholder - No cover available
 *
 * @param providers - Provider data objects
 * @returns Best available cover URL with source and quality rating
 */
export function selectBestCoverURL(providers: CoverProviders): CoverURLResult {
  // Priority 1: ISBNdb (highest quality)
  if (providers.isbndb?.image) {
    return {
      url: providers.isbndb.image,
      source: 'isbndb',
      quality: 'high',
    }
  }

  // Priority 2: Google Books large image (zoom=3)
  if (providers.googleBooks?.volumeInfo?.imageLinks?.thumbnail) {
    const thumbnailUrl = providers.googleBooks.volumeInfo.imageLinks.thumbnail
    // Convert to zoom=3 for higher quality
    const largeUrl = thumbnailUrl.replace(/zoom=\d+/, 'zoom=3')
    return {
      url: largeUrl,
      source: 'google-books',
      quality: 'high',
    }
  }

  // Priority 3: Alexandria via OpenLibrary edition OLID
  if (providers.alexandria?.urls?.large) {
    return {
      url: providers.alexandria.urls.large,
      source: 'alexandria',
      quality: 'medium',
    }
  }

  // Priority 4: OpenLibrary cover_i
  if (providers.openLibrary?.cover_i) {
    return {
      url: `https://covers.openlibrary.org/b/id/${providers.openLibrary.cover_i}-L.jpg`,
      source: 'openlibrary',
      quality: 'medium',
    }
  }

  // Priority 5: Google Books thumbnail (zoom=2, lower quality)
  if (providers.googleBooks?.volumeInfo?.imageLinks?.thumbnail) {
    return {
      url: providers.googleBooks.volumeInfo.imageLinks.thumbnail,
      source: 'google-books',
      quality: 'low',
    }
  }

  // Priority 6: Placeholder (no cover available)
  return {
    url: PLACEHOLDER_URL,
    source: 'placeholder',
    quality: 'missing',
  }
}

// ============================================================================
// INTERNAL HELPER FUNCTIONS
// ============================================================================

/**
 * Create placeholder response for failed cover processing
 *
 * @param workKey - OpenLibrary work key
 * @returns Response with placeholder URLs
 */
function createPlaceholderResponse(workKey: string): CoverProcessingResponse {
  return {
    success: false,
    urls: {
      large: PLACEHOLDER_URL,
      medium: PLACEHOLDER_URL,
      small: PLACEHOLDER_URL,
    },
    error: 'Cover processing failed - using placeholder',
    metadata: {
      processedAt: new Date().toISOString(),
      originalSize: 0,
      r2Key: `placeholder/${workKey}`,
      sourceUrl: PLACEHOLDER_URL,
      workKey,
    },
  }
}
