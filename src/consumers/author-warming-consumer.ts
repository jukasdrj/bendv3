import type { ExecutionContext } from '@cloudflare/workers-types'
import { searchByAuthor } from '../handlers/author-search'
import { searchByTitle } from '../handlers/book-search'
import { enrichBooksParallel } from '../services/parallel-enrichment'
import type { Env } from '../types/env'

/**
 * Queue message structure for author warming
 */
interface AuthorWarmingMessage {
  author: string
  depth: number
  source: string
  jobId: string
}

/**
 * Queue batch wrapper for messages
 */
interface MessageBatch<T> {
  messages: Array<{
    body: T
    ack: () => void
    retry: () => void
  }>
}

/**
 * Processed author tracking data
 */
interface ProcessedAuthorData {
  worksCount: number
  titlesWarmed: number
  lastWarmed: number
  depth: number
  jobId: string
}

/**
 * Work item structure from author search
 */
interface WorkItem {
  title: string
  [key: string]: unknown
}

/**
 * Warmed work item with flag
 */
interface WarmedWork extends WorkItem {
  warmed: boolean
}

/**
 * Author search result structure
 */
interface AuthorSearchResult {
  success: boolean
  works?: WorkItem[]
}

/**
 * Author Warming Consumer - Processes queued authors
 *
 * CRITICAL: This consumer calls searchByAuthor and searchByTitle handlers directly
 * which internally use CacheKeyFactory for consistent cache key generation.
 * This ensures warmed cache entries are actually used by search endpoints.
 *
 * Cache key patterns (via CacheKeyFactory in src/services/cache-key-factory.ts):
 * - Title search: search:title:maxresults={n}&title={normalizedTitle}
 * - Author search: auto-search:{queryB64}:{paramsB64}
 *
 * @param batch - Batch of queue messages
 * @param env - Worker environment bindings
 * @param ctx - Execution context
 */
export async function processAuthorBatch(
  batch: MessageBatch<AuthorWarmingMessage>,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const { author, depth, source, jobId } = message.body

      // 1. Check if already processed
      const processed = await env.CACHE.get(`warming:processed:author:${author.toLowerCase()}`)
      if (processed) {
        const data = JSON.parse(processed) as ProcessedAuthorData
        if (depth <= data.depth) {
          console.log(`Skipping ${author}: already processed at depth ${data.depth}`)
          message.ack()
          continue
        }
      }

      // 2. STEP 1: Warm author bibliography using searchByAuthor handler
      // This ensures we use the same cache key generation logic as the search endpoint
      const authorResult = (await searchByAuthor(
        author,
        {
          limit: 100,
          offset: 0,
          sortBy: 'publicationYear',
        },
        env,
        ctx,
      )) as AuthorSearchResult

      if (!authorResult.success || !authorResult.works || authorResult.works.length === 0) {
        console.warn(`No works found for ${author}, skipping`)
        message.ack()
        continue
      }

      console.log(`Cached author "${author}": ${authorResult.works.length} works`)

      // 3. STEP 2: Extract titles and warm each one in parallel using enrichBooksParallel
      // This ensures canonical DTO format, correct cache keys, and 5x faster warming
      console.log(`Warming ${authorResult.works.length} titles for author "${author}"...`)

      // Use configurable concurrency (default: 5) to prevent API throttling
      const concurrency = env.CACHE_WARMING_CONCURRENCY || 5

      const results = await enrichBooksParallel<WorkItem, WarmedWork>(
        authorResult.works,
        async (work: WorkItem): Promise<WarmedWork> => {
          // Use searchByTitle to get full orchestrated data (Google + OpenLibrary)
          // This will automatically cache with correct key: search:title:maxresults=20&title={normalized}
          await searchByTitle(work.title, { maxResults: 20 }, env, ctx)
          return { ...work, warmed: true }
        },
        async (
          completed: number,
          total: number,
          work: WorkItem | WarmedWork,
          isError: boolean,
        ): Promise<void> => {
          if (!isError) {
            console.log(`(${completed}/${total}) Warmed cache for "${work.title}"`)
          }
        },
        concurrency,
      )

      const titlesWarmed = results.filter((r) => r.warmed).length
      console.log(`Finished warming ${titlesWarmed} titles for author "${author}"`)

      // 4. Mark author as processed
      await env.CACHE.put(
        `warming:processed:author:${author.toLowerCase()}`,
        JSON.stringify({
          worksCount: authorResult.works.length,
          titlesWarmed: titlesWarmed,
          lastWarmed: Date.now(),
          depth: depth,
          jobId: jobId,
        } satisfies ProcessedAuthorData),
        { expirationTtl: 90 * 24 * 60 * 60 }, // 90 days
      )

      // 5. Analytics
      if (env.CACHE_ANALYTICS) {
        ctx.waitUntil(
          env.CACHE_ANALYTICS.writeDataPoint({
            blobs: ['warming', author, source],
            doubles: [authorResult.works.length, titlesWarmed],
            indexes: ['cache-warming'],
          }),
        )
      }

      message.ack()
    } catch (error) {
      console.error(`Failed to process author ${message.body.author}:`, error)
      message.retry() // Retry up to 3 times per queue config, then DLQ
    }
  }
}
