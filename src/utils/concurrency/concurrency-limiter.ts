/**
 * Concurrency Limiter Utility
 *
 * Provides controlled parallel execution without external dependencies.
 * Alternative to p-limit that works in Cloudflare Workers.
 */

interface Task<T> {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: any) => void
}

/**
 * Creates a concurrency limiter that controls the number of simultaneous async operations
 *
 * @param limit - Maximum number of concurrent operations
 * @returns Function that queues and executes tasks with concurrency control
 */
export function createConcurrencyLimiter(limit: number) {
  const queue: Task<any>[] = []
  let running = 0

  async function processNext() {
    if (queue.length === 0 || running >= limit) {
      return
    }

    const task = queue.shift()!
    running++

    try {
      const result = await task.fn()
      task.resolve(result)
    } catch (error) {
      task.reject(error)
    } finally {
      running--
      processNext() // Process next task in queue
    }
  }

  return function limitedExecution<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      processNext()
    })
  }
}

/**
 * Process array of tasks with controlled concurrency
 *
 * @param tasks - Array of functions that return promises
 * @param limit - Maximum concurrent executions
 * @returns Promise that resolves when all tasks complete
 */
export async function processWithLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const limiter = createConcurrencyLimiter(limit)
  const limitedTasks = tasks.map((task) => limiter(task))
  return Promise.allSettled(limitedTasks)
}

/**
 * Batch processor for large arrays with concurrency control and progress tracking
 */
export class BatchProcessor<TInput, TOutput> {
  private batchSize: number
  private concurrencyLimit: number
  private onProgress?: (completed: number, total: number) => void

  constructor(options: {
    batchSize: number
    concurrencyLimit: number
    onProgress?: (completed: number, total: number) => void
  }) {
    this.batchSize = options.batchSize
    this.concurrencyLimit = options.concurrencyLimit
    this.onProgress = options.onProgress
  }

  async process<T extends TOutput>(
    items: TInput[],
    processor: (item: TInput) => Promise<T>,
  ): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = []
    let completed = 0

    // Process in batches to control memory usage
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize)

      // Create limited processor tasks
      const tasks = batch.map((item) => () => processor(item))
      const batchResults = await processWithLimit(tasks, this.concurrencyLimit)

      results.push(...batchResults)
      completed += batch.length

      this.onProgress?.(completed, items.length)
    }

    return results
  }
}

/**
 * Optimized cover processing with controlled concurrency
 */
export interface CoverProcessingTask {
  isbn: string
  workKey: string
  providerCoverURL: string
}

export interface CoverProcessingResult {
  isbn: string
  success: boolean
  urls?: {
    small: string
    medium: string
    large: string
  }
  error?: string
}

/**
 * Process covers with optimal concurrency based on Alexandria capacity
 */
export function createCoverProcessor(env: any) {
  const processor = new BatchProcessor<CoverProcessingTask, CoverProcessingResult>({
    batchSize: 25, // Process 25 covers at a time to manage memory
    concurrencyLimit: 10, // 10 concurrent requests to Alexandria
    onProgress: (completed, total) => {
      console.log(`[CoverProcessor] Progress: ${completed}/${total} covers processed`)
    },
  })

  return {
    async processCovers(tasks: CoverProcessingTask[]): Promise<Map<string, CoverProcessingResult>> {
      const { processBookCover } = await import('../services/alexandria-cover-service')

      const results = await processor.process(tasks, async (task) => {
        try {
          const result = await processBookCover(
            {
              work_key: task.workKey,
              provider_url: task.providerCoverURL,
              isbn: task.isbn,
            },
            env,
            2, // 2 retries for cover processing
          )

          return {
            isbn: task.isbn,
            success: result.success,
            urls: result.success ? result.urls : undefined,
            error: result.success ? undefined : result.error,
          }
        } catch (error) {
          return {
            isbn: task.isbn,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      })

      // Convert to Map for easy lookup
      const resultMap = new Map<string, CoverProcessingResult>()
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          resultMap.set(result.value.isbn, result.value)
        }
      })

      return resultMap
    },
  }
}
