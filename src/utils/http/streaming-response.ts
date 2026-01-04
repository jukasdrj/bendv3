/**
 * Streaming Response Utilities
 *
 * Utilities for streaming large responses using NDJSON (Newline Delimited JSON)
 * to prevent memory exhaustion and improve user experience for batch operations.
 */

export interface StreamingOptions {
  batchSize: number
  flushThreshold: number
  contentType?: string
  headers?: Record<string, string>
}

/**
 * Create a streaming response using TransformStream for large datasets
 *
 * @param generator - Async generator function that yields data items
 * @param options - Streaming configuration options
 * @returns Response with streaming body
 */
export function createStreamingResponse<T>(
  generator: () => AsyncGenerator<T>,
  options: StreamingOptions = {
    batchSize: 25,
    flushThreshold: 50,
    contentType: 'application/x-ndjson',
  },
): Response {
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  // Start streaming in the background
  const streamPromise = (async () => {
    try {
      let count = 0
      for await (const item of generator()) {
        const json = JSON.stringify(item)
        await writer.write(encoder.encode(`${json}\n`))

        count++
        // Note: TransformStream automatically handles backpressure and flushing
        // No explicit flush needed - the stream will flush when the internal buffer fills
      }
    } catch (error) {
      console.error('[StreamingResponse] Error:', error)
      // Write error as final JSON line
      const errorJson = JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      })
      await writer.write(encoder.encode(`${errorJson}\n`))
    } finally {
      await writer.close()
    }
  })()

  // Don't wait for completion - let it stream
  streamPromise.catch((err) => console.error('[StreamingResponse] Background error:', err))

  return new Response(readable, {
    headers: {
      'Content-Type': options.contentType || 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...options.headers,
    },
  })
}

/**
 * Batch processor that yields results as they become available
 *
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param concurrency - Number of items to process in parallel
 */
export async function* streamBatchProcessor<TInput, TOutput>(
  items: TInput[],
  processor: (item: TInput) => Promise<TOutput>,
  concurrency: number = 10,
): AsyncGenerator<TOutput> {
  const batchSize = Math.min(concurrency, items.length)

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)

    // Process batch in parallel
    const results = await Promise.allSettled(batch.map((item) => processor(item)))

    // Yield results as they complete
    for (const result of results) {
      if (result.status === 'fulfilled') {
        yield result.value
      }
      // Skip rejected results (could add error handling)
    }
  }
}

/**
 * Book enrichment streaming result types
 */
export interface StreamingEnrichmentResult {
  type: 'book' | 'progress' | 'summary' | 'error'
  data: any
  timestamp: string
}

export interface StreamingBookResult extends StreamingEnrichmentResult {
  type: 'book'
  data: {
    isbn: string
    success: boolean
    book?: any
    error?: string
  }
}

export interface StreamingProgressResult extends StreamingEnrichmentResult {
  type: 'progress'
  data: {
    processed: number
    total: number
    percentage: number
  }
}

export interface StreamingSummaryResult extends StreamingEnrichmentResult {
  type: 'summary'
  data: {
    requested: number
    found: number
    notFound: string[]
    processingTime: number
  }
}

/**
 * Create a book enrichment streaming generator
 *
 * @param isbns - Array of ISBNs to enrich
 * @param enrichFunction - Function to enrich a single ISBN
 * @param concurrency - Parallel processing limit
 */
export async function* createBookEnrichmentStream(
  isbns: string[],
  enrichFunction: (
    isbn: string,
  ) => Promise<{ success: boolean; book?: any; isbn: string; error?: string }>,
  concurrency: number = 25,
): AsyncGenerator<StreamingEnrichmentResult> {
  const startTime = Date.now()
  let processed = 0
  const notFound: string[] = []
  let found = 0

  // Yield initial progress
  yield {
    type: 'progress',
    data: { processed: 0, total: isbns.length, percentage: 0 },
    timestamp: new Date().toISOString(),
  } as StreamingProgressResult

  // Process books in batches
  const processor = streamBatchProcessor(isbns, enrichFunction, concurrency)

  for await (const result of processor) {
    processed++

    // Yield book result
    if (result.success) {
      found++
      yield {
        type: 'book',
        data: result,
        timestamp: new Date().toISOString(),
      } as StreamingBookResult
    } else {
      notFound.push(result.isbn)
      yield {
        type: 'book',
        data: result,
        timestamp: new Date().toISOString(),
      } as StreamingBookResult
    }

    // Yield progress update every 10 items
    if (processed % 10 === 0 || processed === isbns.length) {
      yield {
        type: 'progress',
        data: {
          processed,
          total: isbns.length,
          percentage: Math.round((processed / isbns.length) * 100),
        },
        timestamp: new Date().toISOString(),
      } as StreamingProgressResult
    }
  }

  // Yield final summary
  yield {
    type: 'summary',
    data: {
      requested: isbns.length,
      found,
      notFound,
      processingTime: Date.now() - startTime,
    },
    timestamp: new Date().toISOString(),
  } as StreamingSummaryResult
}
