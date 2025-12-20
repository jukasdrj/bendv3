import { DurableObject } from 'cloudflare:workers'
import { processCSVImport } from '../services/csv-processor.js'
import { ProgressReporter } from '../utils/progress-reporter.js'

/**
 * Job State Manager Durable Object
 *
 * Responsibility: Job state persistence and queries ONLY
 * - Stores job progress/status in durable storage
 * - Provides state query methods
 * - Coordinates with WebSocketConnectionDO for broadcasts
 *
 * This DO is part of the refactored architecture that separates concerns:
 * - WebSocketConnectionDO: Connection management
 * - JobStateManagerDO: State persistence (this file)
 * - Services: Business logic (csv-processor, batch-enrichment)
 *
 * Related: Issue #68 - Refactor Monolithic ProgressWebSocketDO
 */

// Pipeline-specific throttling configuration
const THROTTLE_CONFIG = {
  batch_enrichment: { updateCount: 5, timeSeconds: 10 },
  csv_import: { updateCount: 20, timeSeconds: 30 },
  ai_scan: { updateCount: 1, timeSeconds: 60 },
}

export class JobStateManagerDO extends DurableObject {
  constructor(state, env) {
    super(state, env)
    this.storage = state.storage
    this.updatesSinceLastPersist = 0
    this.lastPersistTime = 0
    this.currentPipeline = null
    this.jobState = null // Fix Issue #107: Cache jobState to prevent state loss
    // Fix Issue #157: Batch SSE update storage writes
    this.pendingUpdates = []
    this.lastUpdatePersist = Date.now() // Initialize to now to prevent immediate flush
  }

  /**
   * RPC Method: Initialize job state with pipeline configuration
   *
   * @param {string} jobId - Job identifier
   * @param {string} pipeline - Pipeline type (batch_enrichment, csv_import, ai_scan)
   * @param {number} totalCount - Total items to process
   * @returns {Promise<{success: boolean}>}
   */
  async initializeJobState(jobId, pipeline, totalCount) {
    console.log(`[JobStateManager] Initializing job ${jobId} for pipeline ${pipeline}`)

    this.currentPipeline = pipeline

    const jobState = {
      jobId,
      pipeline,
      totalCount,
      processedCount: 0,
      progress: 0,
      status: 'initialized',
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      canceled: false,
    }

    await this.storage.put('jobState', jobState)
    console.log(`[JobStateManager] Job ${jobId} initialized`)

    // Initialize SSE client list and updates queue
    await this.storage.put(`sse-clients:${jobId}`, [])
    await this.storage.put(`updates:${jobId}`, [])

    return { success: true }
  }

  /**
   * RPC Method: Update job progress
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Progress update payload
   * @returns {Promise<{success: boolean}>}
   */
  async updateProgress(pipeline, payload) {
    // Fix Issue #107: Use cached state instead of reading from storage each time
    if (!this.jobState) {
      this.jobState = await this.storage.get('jobState')
    }

    if (!this.jobState) {
      console.warn('[JobStateManager] No job state found for progress update')
      return { success: false }
    }

    // Update cached state (not storage read)
    // FIX: Don't overwrite status enum with message string - use 'processing' during progress updates
    // The payload.status is a human-readable message, not the job status enum
    this.jobState = {
      ...this.jobState,
      progress: payload.progress ?? this.jobState.progress,
      status: 'processing', // Always 'processing' during progress updates
      statusMessage:
        payload.status || `Processing ${payload.processedCount || 0}/${this.jobState.totalCount}`, // Store message separately
      processedCount: payload.processedCount ?? this.jobState.processedCount,
      lastUpdateTime: Date.now(),
    }

    // Throttle storage writes to reduce costs
    const throttleConfig = THROTTLE_CONFIG[pipeline] || {
      updateCount: 10,
      timeSeconds: 20,
    }
    this.updatesSinceLastPersist++
    const timeSinceLastPersist = (Date.now() - this.lastPersistTime) / 1000

    const shouldPersist =
      this.updatesSinceLastPersist >= throttleConfig.updateCount ||
      timeSinceLastPersist >= throttleConfig.timeSeconds

    if (shouldPersist) {
      await this.storage.put('jobState', this.jobState)
      this.updatesSinceLastPersist = 0
      this.lastPersistTime = Date.now()
      console.log(`[JobStateManager] State persisted for job ${this.jobState.jobId}`)
    }

    // Get WebSocket DO and notify
    const wsDoId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(this.jobState.jobId)
    const wsDoStub = this.env.WEBSOCKET_CONNECTION_DO.get(wsDoId)

    // WebSocketMessage format (src/types/websocket-messages.ts)
    await wsDoStub.send({
      type: 'job_progress',
      jobId: this.jobState.jobId,
      pipeline: pipeline,
      timestamp: Date.now(),
      version: '2.0.0',
      payload: {
        type: 'job_progress',
        progress: payload.progress,
        status:
          payload.status || `Processing ${payload.processedCount || 0}/${this.jobState.totalCount}`,
        processedCount: payload.processedCount,
        totalCount: this.jobState.totalCount,
      },
    })

    // Broadcast to SSE clients
    // FIX: 'status' should be the enum value ('processing'), 'message' is the human-readable text
    await this.broadcastSSEUpdate('progress', {
      jobId: this.jobState.jobId,
      status: 'processing',
      message:
        payload.status || `Processing ${payload.processedCount || 0}/${this.jobState.totalCount}`,
      progress: payload.progress,
      processedCount: payload.processedCount,
      totalCount: this.jobState.totalCount,
      timestamp: new Date().toISOString(),
    })

    return { success: true }
  }

  /**
   * RPC Method: Complete job
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Completion payload
   * @returns {Promise<{success: boolean}>}
   */
  async complete(pipeline, payload) {
    const jobState = await this.storage.get('jobState')

    if (!jobState) {
      console.warn('[JobStateManager] No job state found for completion')
      return { success: false }
    }

    // FIX: DO storage has 128KB limit per value. Large payloads (e.g., 12+ enriched books)
    // can exceed this limit. Store only metadata in DO; full results are already in KV.
    // Extract summary stats without the full books array to stay under 128KB limit.
    const { books, ...resultSummary } = payload

    const completedState = {
      ...jobState,
      status: 'completed',
      progress: 1.0,
      completedTime: Date.now(),
      // Store only summary (totalDetected, totalUnique, approved, needsReview, resultsUrl)
      // Full books array is stored in KV at `scan-results:{jobId}` or `import-results:{jobId}`
      result: resultSummary,
      bookCount: books?.length || 0,
    }

    await this.storage.put('jobState', completedState)
    console.log(`[JobStateManager] Job ${jobState.jobId} completed`)

    // Calculate expiry timestamp (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // Notify WebSocket
    const wsDoId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(jobState.jobId)
    const wsDoStub = this.env.WEBSOCKET_CONNECTION_DO.get(wsDoId)

    // WebSocketMessage format (src/types/websocket-messages.ts)
    await wsDoStub.send({
      type: 'job_complete',
      jobId: jobState.jobId,
      pipeline: pipeline,
      timestamp: Date.now(),
      version: '2.0.0',
      payload: {
        type: 'job_complete',
        pipeline: pipeline,
        ...payload,
        expiresAt, // Add expiry timestamp to payload
      },
    })

    // Broadcast to SSE clients (Issue #003: Include books array for iOS persistence)
    // Note: `books` was destructured from payload earlier to avoid DO storage limit
    await this.broadcastSSEUpdate('completed', {
      jobId: jobState.jobId,
      status: 'completed',
      progress: 100,
      processedCount: jobState.processedCount || completedState.totalCount,
      totalCount: completedState.totalCount,
      completedAt: new Date(completedState.completedTime).toISOString(),
      // Include books array for iOS to persist without extra fetch
      books: books || [],
    })

    // Fix Issue #157: Flush pending updates before job completes
    await this.flushPendingUpdates(jobState.jobId)

    // Fix Issue #108: Delete existing alarm to prevent race condition
    await this.storage.deleteAlarm()
    // Schedule cleanup after 24 hours
    await this.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000)

    // Close WebSocket connection after brief delay to ensure message delivery
    // Fix: Properly await async operation in setTimeout to catch errors
    // Using `void` to explicitly mark this as a fire-and-forget operation
    void new Promise((resolve) => {
      setTimeout(async () => {
        try {
          await wsDoStub.closeConnection('Job completed')
          resolve()
        } catch (err) {
          console.error(
            `[JobStateManager] Failed to close connection for job ${jobState.jobId}:`,
            err,
          )
          resolve() // Resolve anyway to prevent hanging
        }
      }, 1000)
    })

    return { success: true }
  }

  /**
   * RPC Method: Fail job with error
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Error payload
   * @returns {Promise<{success: boolean}>}
   */
  async sendError(pipeline, payload) {
    const jobState = await this.storage.get('jobState')

    if (!jobState) {
      console.warn('[JobStateManager] No job state found for error')
      return { success: false }
    }

    const failedState = {
      ...jobState,
      status: 'failed',
      failedTime: Date.now(),
      error: payload,
    }

    await this.storage.put('jobState', failedState)
    console.log(`[JobStateManager] Job ${jobState.jobId} failed`)

    // Notify WebSocket
    const wsDoId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(jobState.jobId)
    const wsDoStub = this.env.WEBSOCKET_CONNECTION_DO.get(wsDoId)

    // BREAKING CHANGE (Issue #167): Align WebSocket errors with HTTP canonical format
    await wsDoStub.send({
      type: 'error',
      jobId: jobState.jobId,
      pipeline,
      timestamp: Date.now(),
      version: '2.0.0',
      payload: {
        type: 'error',
        data: null, // Always null for errors (matches HTTP ResponseEnvelope)
        metadata: {
          timestamp: new Date().toISOString(),
        },
        error: {
          message: payload.message,
          code: payload.code,
          details: payload.details,
        },
        retryable: payload.retryable,
      },
    })

    // Broadcast to SSE clients
    await this.broadcastSSEUpdate('failed', {
      jobId: jobState.jobId,
      status: 'failed',
      error: {
        code: payload.code,
        message: payload.message,
      },
    })

    // Fix Issue #157: Flush pending updates before job fails
    await this.flushPendingUpdates(jobState.jobId)

    // Fix Issue #108: Delete existing alarm to prevent race condition
    await this.storage.deleteAlarm()
    // Schedule cleanup after 24 hours
    await this.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000)

    // Close WebSocket connection after brief delay to ensure message delivery
    // Fix: Properly await async operation in setTimeout to catch errors
    // Using `void` to explicitly mark this as a fire-and-forget operation
    void new Promise((resolve) => {
      setTimeout(async () => {
        try {
          await wsDoStub.closeConnection('Job failed')
          resolve()
        } catch (err) {
          console.error(
            `[JobStateManager] Failed to close connection for job ${jobState.jobId}:`,
            err,
          )
          resolve() // Resolve anyway to prevent hanging
        }
      }, 1000)
    })

    return { success: true }
  }

  /**
   * RPC Method: Get current job state
   *
   * @returns {Promise<Object|null>} Current job state or null
   */
  async getJobState() {
    return await this.storage.get('jobState')
  }

  /**
   * RPC Method: Cancel job
   *
   * @param {string} reason - Cancellation reason
   * @returns {Promise<{success: boolean}>}
   */
  async cancelJob(reason = 'Job canceled by user') {
    const jobState = await this.storage.get('jobState')

    if (!jobState) {
      console.warn('[JobStateManager] No job state found for cancellation')
      return { success: false }
    }

    const canceledState = {
      ...jobState,
      canceled: true,
      cancelReason: reason,
      canceledTime: Date.now(),
    }

    await this.storage.put('jobState', canceledState)
    console.log(`[JobStateManager] Job ${jobState.jobId} canceled: ${reason}`)

    return { success: true }
  }

  /**
   * RPC Method: Check if job is canceled
   *
   * @returns {Promise<boolean>}
   */
  async isCanceled() {
    const jobState = await this.storage.get('jobState')
    return jobState?.canceled || false
  }

  /**
   * RPC Method: Schedule CSV processing via alarm
   *
   * @param {string} csvText - Raw CSV content
   * @param {string} jobId - Job identifier
   * @returns {Promise<{success: boolean}>}
   */
  async scheduleCSVProcessing(csvText, jobId) {
    await this.storage.put('csvText', csvText)
    await this.storage.put('processingType', 'csv_import')
    await this.storage.setAlarm(Date.now()) // Trigger immediately
    console.log(`[JobStateManager] Scheduled CSV processing for job ${jobId}`)
    return { success: true }
  }

  /**
   * RPC Method: Schedule bookshelf scan processing via alarm
   *
   * Avoids Worker CPU time limits for long-running Gemini AI calls (20-60s)
   * Similar to CSV import, this delegates work to Durable Object alarm context
   *
   * V3 API: Now supports multiple images (1-5 photos per scan job)
   *
   * FIX: Images are now stored in R2 (not DO storage) to avoid 128KB limit.
   * This method receives R2 keys instead of raw image buffers.
   *
   * @param {string[]} r2Keys - Array of R2 object keys where images are stored
   * @param {string} jobId - Job identifier
   * @returns {Promise<{success: boolean}>}
   */
  async scheduleBookshelfScan(r2Keys, jobId) {
    // Store R2 keys (small strings, well under 128KB limit)
    await this.storage.put('scanImageR2Keys', r2Keys)
    await this.storage.put('processingType', 'bookshelf_scan')
    await this.storage.setAlarm(Date.now()) // Trigger immediately
    console.log(
      `[JobStateManager] Scheduled bookshelf scan for job ${jobId} (${r2Keys.length} photos in R2)`,
    )
    return { success: true }
  }

  /**
   * RPC Method: Schedule batch enrichment processing via alarm
   *
   * Avoids Worker CPU time limits for large batches (up to 500 ISBNs)
   * Delegates work to Durable Object alarm context for async processing
   *
   * @param {string[]} isbns - Array of ISBNs to enrich
   * @param {boolean} includeEmbedding - Whether to generate embeddings
   * @param {string} jobId - Job identifier
   * @returns {Promise<{success: boolean}>}
   */
  async scheduleEnrichment(isbns, includeEmbedding, jobId) {
    await this.storage.put('enrichmentISBNs', isbns)
    await this.storage.put('includeEmbedding', includeEmbedding)
    await this.storage.put('processingType', 'enrichment')
    await this.storage.setAlarm(Date.now()) // Trigger immediately
    console.log(
      `[JobStateManager] Scheduled enrichment for job ${jobId} (${isbns.length} ISBNs, embeddings: ${includeEmbedding})`,
    )
    return { success: true }
  }

  /**
   * RPC Method: Register SSE client for updates
   *
   * @param {string} clientId - Unique client identifier
   * @returns {Promise<{success: boolean}>}
   */
  async registerSSEClient(clientId) {
    const jobState = await this.storage.get('jobState')
    if (!jobState) return { success: false }

    const clients = (await this.storage.get(`sse-clients:${jobState.jobId}`)) || []
    if (!clients.includes(clientId)) {
      clients.push(clientId)
      await this.storage.put(`sse-clients:${jobState.jobId}`, clients)
      console.log(`[JobStateManager] Registered SSE client ${clientId} for job ${jobState.jobId}`)
    }
    return { success: true }
  }

  /**
   * RPC Method: Unregister SSE client
   *
   * @param {string} clientId - Unique client identifier
   * @returns {Promise<{success: boolean}>}
   */
  async unregisterSSEClient(clientId) {
    const jobState = await this.storage.get('jobState')
    if (!jobState) return { success: false }

    const clients = (await this.storage.get(`sse-clients:${jobState.jobId}`)) || []
    const filtered = clients.filter((id) => id !== clientId)
    await this.storage.put(`sse-clients:${jobState.jobId}`, filtered)
    console.log(`[JobStateManager] Unregistered SSE client ${clientId} for job ${jobState.jobId}`)
    return { success: true }
  }

  /**
   * RPC Method: Get SSE updates after a given timestamp
   *
   * Uses timestamp-based filtering to prevent event loss when queue is capped.
   * See Issue #156: Index-based retrieval loses events when queue shifts.
   *
   * @param {number} afterTimestamp - Return events after this timestamp (0 for all)
   * @returns {Promise<Array>} Array of updates
   */
  async getUpdates(afterTimestamp = 0) {
    const jobState = await this.storage.get('jobState')
    if (!jobState) return []

    const persistedUpdates = (await this.storage.get(`updates:${jobState.jobId}`)) || []
    // Fix Issue #157: Include pending updates that haven't been persisted yet
    const allUpdates = [...persistedUpdates, ...this.pendingUpdates]
    return allUpdates.filter((u) => u.timestamp > afterTimestamp)
  }

  /**
   * Internal: Broadcast update to SSE update queue
   *
   * Fix Issue #157: Batch storage writes using in-memory buffering.
   * Persists every 5 updates OR every 1 second (whichever comes first).
   *
   * @param {string} eventType - Type of event (progress, completed, failed)
   * @param {Object} data - Event data
   * @returns {Promise<void>}
   */
  async broadcastSSEUpdate(eventType, data) {
    const jobState = this.jobState || (await this.storage.get('jobState'))
    if (!jobState) return

    // Add update to in-memory buffer
    this.pendingUpdates.push({
      timestamp: Date.now(),
      eventType,
      data,
    })

    // Determine if we should persist now
    const timeSinceLastPersist = (Date.now() - this.lastUpdatePersist) / 1000
    const shouldPersist = this.pendingUpdates.length >= 5 || timeSinceLastPersist >= 1

    if (shouldPersist) {
      await this.flushPendingUpdates(jobState.jobId)
    }

    const clients = (await this.storage.get(`sse-clients:${jobState.jobId}`)) || []
    console.log(
      `[JobStateManager] Broadcast ${eventType} to queue (${clients.length} SSE clients, ${this.pendingUpdates.length} pending) for job ${jobState.jobId}`,
    )
  }

  /**
   * Internal: Flush pending updates to storage
   *
   * Fix Issue #157: Combine pending updates with persisted updates,
   * then keep only the last 100 events.
   *
   * @param {string} jobId - Job identifier
   * @returns {Promise<void>}
   */
  async flushPendingUpdates(jobId) {
    if (this.pendingUpdates.length === 0) return

    // Read existing updates from storage
    const persistedUpdates = (await this.storage.get(`updates:${jobId}`)) || []

    // Combine with pending updates
    const allUpdates = [...persistedUpdates, ...this.pendingUpdates]

    // Keep only last 100 updates
    const trimmedUpdates = allUpdates.slice(-100)

    // Write back to storage
    await this.storage.put(`updates:${jobId}`, trimmedUpdates)

    // Clear in-memory buffer
    this.pendingUpdates = []
    this.lastUpdatePersist = Date.now()

    console.log(
      `[JobStateManager] Flushed ${allUpdates.length - persistedUpdates.length} pending updates for job ${jobId}`,
    )
  }

  /**
   * Process enrichment job in chunks
   *
   * Processes ISBNs in batches with progress updates every 25 books
   *
   * @param {string[]} isbns - Array of ISBNs to enrich
   * @param {boolean} includeEmbedding - Whether to generate embeddings
   * @param {ProgressReporter} reporter - Progress reporter instance
   * @param {string} jobId - Job identifier
   */
  async processEnrichmentJob(isbns, includeEmbedding, reporter, jobId) {
    const CONCURRENCY = 10 // Process 10 ISBNs at a time
    const PROGRESS_INTERVAL = 25 // Update every 25 books

    console.log(
      `[JobStateManager] Processing ${isbns.length} ISBNs (embeddings: ${includeEmbedding})`,
    )

    const enrichedBooks = []
    const notFound = []

    // Import enrichment service
    const { enrichMultipleBooks } = await import('../services/enrichment.js')
    const { generateBookEmbedding, storeEmbedding } = await import(
      '../services/embedding-service.js'
    )

    // Process in chunks
    for (let i = 0; i < isbns.length; i += CONCURRENCY) {
      const batch = isbns.slice(i, Math.min(i + CONCURRENCY, isbns.length))

      const results = await Promise.allSettled(
        batch.map(async (isbn) => {
          try {
            // Check cache first
            const cacheKey = `book:isbn:${isbn}`
            const cached = await this.env.CACHE.get(cacheKey, 'json')

            if (cached && (!includeEmbedding || cached.vectorized)) {
              return { success: true, book: cached }
            }

            // Fetch from Alexandria
            const result = await enrichMultipleBooks(
              { isbn },
              this.env,
              { maxResults: 1 },
              null, // No executionCtx in DO alarm context
            )

            if (!result || !result.works || result.works.length === 0) {
              return { success: false, isbn }
            }

            // Convert to enriched book format
            const work = result.works[0]
            const edition = result.editions?.[0]
            const authors = result.authors || []

            const book = {
              isbn: edition?.isbn || isbn,
              title: work.title,
              authors: authors.map((a) => a.name),
              publisher: edition?.publisher,
              publishedDate: edition?.publicationDate,
              description: work.description,
              pageCount: edition?.pageCount,
              categories: work.subjects,
              language: edition?.language || 'en',
              coverUrl: work.coverImageURL || edition?.coverImageURL,
              thumbnailUrl: work.coverImageURL || edition?.coverImageURL,
              workKey: work.openLibraryWorkID || work.openLibraryID,
              editionKey: edition?.openLibraryEditionID,
              provider: 'alexandria',
              quality: 95,
              vectorized: false,
            }

            // Generate embedding if requested
            if (includeEmbedding && this.env.AI) {
              try {
                const embedding = await generateBookEmbedding(
                  {
                    isbn: book.isbn,
                    title: book.title,
                    author: book.authors.join(', '),
                    description: book.description,
                    categories: book.categories,
                  },
                  this.env,
                )

                if (embedding) {
                  const stored = await storeEmbedding(
                    embedding,
                    {
                      isbn: book.isbn,
                      title: book.title,
                      author: book.authors.join(', '),
                      categories: book.categories?.join(', '),
                    },
                    this.env,
                  )
                  book.vectorized = stored
                }
              } catch (embError) {
                console.warn(`[Enrichment] Embedding generation failed for ${isbn}:`, embError)
              }
            }

            // Cache the result
            await this.env.CACHE.put(cacheKey, JSON.stringify(book), {
              expirationTtl: 86400, // 24 hours
            })

            return { success: true, book }
          } catch (error) {
            console.error(`[Enrichment] Error processing ${isbn}:`, error)
            return { success: false, isbn }
          }
        }),
      )

      // Collect results
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success) {
          enrichedBooks.push(result.value.book)
        } else if (result.status === 'fulfilled' && !result.value.success) {
          notFound.push(result.value.isbn)
        }
      })

      // Progress update every 25 books or at completion
      const processedCount = i + batch.length
      if (processedCount % PROGRESS_INTERVAL === 0 || processedCount === isbns.length) {
        await reporter.updateProgress('enrichment', {
          processedCount,
          totalCount: isbns.length,
          progress: processedCount / isbns.length,
        })
        console.log(`[Enrichment] Progress: ${processedCount}/${isbns.length} books`)
      }
    }

    // Store results in KV (2 hour TTL)
    const resultsKey = `enrichment-results:${jobId}`
    await this.env.CACHE.put(
      resultsKey,
      JSON.stringify({ enrichedBooks, notFound }),
      { expirationTtl: 7200 }, // 2 hours
    )

    // Complete the job
    await reporter.complete('enrichment', {
      booksFound: enrichedBooks.length,
      notFound: notFound.length,
    })

    console.log(
      `[Enrichment] Job ${jobId} complete: ${enrichedBooks.length} found, ${notFound.length} not found`,
    )
  }

  /**
   * Alarm handler: Process CSV, bookshelf scan, enrichment, or cleanup old job state
   *
   * Handles four scenarios:
   * 1. CSV processing (triggered immediately after scheduling)
   * 2. Bookshelf scan processing (triggered immediately after scheduling)
   * 3. Batch enrichment processing (triggered immediately after scheduling)
   * 4. Cleanup after 24 hours (triggered after job completion/failure)
   */
  async alarm() {
    const processingType = await this.storage.get('processingType')

    if (processingType === 'csv_import') {
      // CSV processing path
      console.log('[JobStateManager] Alarm triggered for CSV processing')

      const csvText = await this.storage.get('csvText')
      const jobState = await this.storage.get('jobState')

      if (!csvText || !jobState) {
        console.error('[JobStateManager] Missing CSV text or job state in alarm handler')
        return
      }

      // CSV processor and progress reporter (top-level imports for performance)
      const reporter = new ProgressReporter(jobState.jobId, this.env)

      try {
        await processCSVImport(csvText, reporter, this.env, jobState.jobId)
      } catch (error) {
        console.error('[JobStateManager] CSV processing failed in alarm:', error)

        // CRITICAL: Update job state to 'failed' so client is notified
        // Without this, the job would be stuck and user left hanging
        await reporter.sendError('csv_import', {
          code: 'E_ALARM_PROCESSING_FAILED',
          message: error.message || 'CSV processing failed',
          retryable: true,
          details: {
            fallbackAvailable: true,
            suggestion: 'Try manual CSV import or contact support if issue persists',
          },
        })
      }

      // Clean up temporary storage
      await this.storage.delete('csvText')
      await this.storage.delete('processingType')
    } else if (processingType === 'bookshelf_scan') {
      // Bookshelf scan processing path (V3: supports multiple photos)
      console.log('[JobStateManager] Alarm triggered for bookshelf scan processing')

      const scanImageR2Keys = await this.storage.get('scanImageR2Keys')
      const jobState = await this.storage.get('jobState')

      if (!scanImageR2Keys || !jobState) {
        console.error('[JobStateManager] Missing scan image R2 keys or job state in alarm handler')
        return
      }

      // AI scanner service and progress reporter (top-level imports for performance)
      const reporter = new ProgressReporter(jobState.jobId, this.env)

      try {
        // V3: Load images from R2 storage (fixes 128KB DO storage limit)
        const scanImages = []
        for (let i = 0; i < scanImageR2Keys.length; i++) {
          const r2Key = scanImageR2Keys[i]
          console.log(`[JobStateManager] Loading image from R2: ${r2Key}`)
          const r2Object = await this.env.BOOKSHELF_IMAGES.get(r2Key)
          if (r2Object) {
            const buffer = await r2Object.arrayBuffer()
            scanImages.push({
              index: i,
              buffer,
              type: r2Object.httpMetadata?.contentType || 'image/jpeg',
            })
            console.log(
              `[JobStateManager] Loaded image ${i}: ${(buffer.byteLength / 1_000_000).toFixed(2)}MB`,
            )
          } else {
            console.warn(`[JobStateManager] R2 object not found: ${r2Key}`)
          }
        }

        if (scanImages.length === 0) {
          throw new Error('No images found in R2 storage')
        }

        // Process each photo through AI scanner service
        // For batch scans, we process photos sequentially and aggregate results
        const allDetectedBooks = []
        const photoCount = scanImages.length

        console.log(`[JobStateManager] Processing ${photoCount} photos for job ${jobState.jobId}`)

        // Update progress: starting scan
        await reporter.updateProgress('ai_scan', {
          progress: 0.1,
          status: `Starting scan of ${photoCount} photo${photoCount > 1 ? 's' : ''}...`,
          processedCount: 0,
        })

        for (let i = 0; i < scanImages.length; i++) {
          const image = scanImages[i]
          const photoProgress = (i + 1) / photoCount

          // Update progress for each photo
          await reporter.updateProgress('ai_scan', {
            progress: 0.1 + photoProgress * 0.4, // 10% - 50% for AI processing
            status: `Processing photo ${i + 1} of ${photoCount}...`,
            processedCount: i,
          })

          try {
            // Use Gemini Vision to detect books in this photo
            const { scanImageWithGemini } = await import('../providers/gemini-provider.js')
            const scanResult = await scanImageWithGemini(image.buffer, this.env)

            console.log(
              `[JobStateManager] Photo ${i + 1}: detected ${scanResult.books?.length || 0} books`,
            )

            if (scanResult.books && scanResult.books.length > 0) {
              // Tag each book with photo index for deduplication
              scanResult.books.forEach((book) => {
                book.photoIndex = i
                allDetectedBooks.push(book)
              })
            }
          } catch (photoError) {
            console.error(`[JobStateManager] Photo ${i + 1} processing failed:`, photoError)
            // Continue with other photos even if one fails
          }
        }

        console.log(
          `[JobStateManager] Total books detected across all photos: ${allDetectedBooks.length}`,
        )

        // Deduplicate by ISBN (if available) or title+author
        const deduplicatedBooks = []
        const seenKeys = new Set()

        for (const book of allDetectedBooks) {
          const key = book.isbn || `${book.title?.toLowerCase()}-${book.author?.toLowerCase()}`
          if (key && !seenKeys.has(key)) {
            seenKeys.add(key)
            deduplicatedBooks.push(book)
          }
        }

        console.log(
          `[JobStateManager] After deduplication: ${deduplicatedBooks.length} unique books`,
        )

        // Update progress: starting enrichment
        await reporter.updateProgress('ai_scan', {
          progress: 0.5,
          status: `Enriching ${deduplicatedBooks.length} detected books...`,
          processedCount: photoCount,
        })

        // Enrich books with metadata
        const { enrichBooksParallel } = await import('../services/parallel-enrichment.js')
        const { enrichMultipleBooks } = await import('../services/enrichment.ts')
        const { categorizeBooks } = await import('../utils/confidence.js')
        const { getCacheTTL } = await import('../config/cache-ttl.js')

        const enrichedBooks = await enrichBooksParallel(
          deduplicatedBooks,
          async (book) => {
            const enrichmentResult = await enrichMultipleBooks(
              { title: book.title || '', author: book.author || '' },
              this.env,
              { maxResults: 20 },
              null, // No executionCtx in DO alarm context
            )

            const work = enrichmentResult.works?.[0] || null
            const editions = enrichmentResult.editions || []
            const authors = enrichmentResult.authors || []

            return {
              ...book,
              enrichment: {
                status: work ? 'success' : 'not_found',
                work,
                editions,
                authors,
                provider: 'alexandria',
                cachedResult: false,
              },
            }
          },
          async (completed) => {
            // Progress callback for enrichment
            // Note: `completed` is already 1-indexed from enrichBooksParallel (1, 2, 3...N)
            const enrichmentProgress = 0.5 + (completed / deduplicatedBooks.length) * 0.45
            await reporter.updateProgress('ai_scan', {
              progress: enrichmentProgress,
              status: `Enriching book ${completed} of ${deduplicatedBooks.length}...`,
              processedCount: photoCount,
            })
          },
          10, // maxConcurrency
        )

        // Categorize books by confidence
        const categorized = categorizeBooks(enrichedBooks)

        // Build results
        const books = enrichedBooks.map((b) => ({
          title: b.title,
          author: b.author,
          isbn: b.isbn || null,
          confidence: b.confidence,
          boundingBox: b.boundingBox,
          enrichmentStatus: b.enrichment?.status || 'pending',
          coverUrl: b.enrichment?.work?.coverImageURL || null,
          publisher: b.enrichment?.editions?.[0]?.publisher || null,
          publicationYear: b.enrichment?.editions?.[0]?.publicationYear || null,
        }))

        // Store results in KV
        const resultsKey = `scan-results:${jobState.jobId}`
        const fullResults = {
          totalDetected: allDetectedBooks.length,
          totalUnique: deduplicatedBooks.length,
          approved: categorized.high.length,
          needsReview: categorized.medium.length + categorized.low.length,
          books,
          metadata: {
            modelUsed: 'gemini-2.0-flash',
            photoCount,
            timestamp: Date.now(),
          },
        }

        await this.env.CACHE.put(resultsKey, JSON.stringify(fullResults), {
          expirationTtl: getCacheTTL('hot', this.env),
        })

        console.log(`[JobStateManager] Stored results in KV: ${resultsKey}`)

        // Complete the job
        await reporter.complete('ai_scan', {
          totalDetected: allDetectedBooks.length,
          totalUnique: deduplicatedBooks.length,
          approved: categorized.high.length,
          needsReview: categorized.medium.length + categorized.low.length,
          resultsUrl: `/v3/jobs/scans/${jobState.jobId}/results`,
          books, // Include books for SSE completion event
        })

        console.log(`[JobStateManager] Bookshelf scan complete for job ${jobState.jobId}`)
      } catch (error) {
        console.error('[JobStateManager] Bookshelf scan processing failed in alarm:', error)

        await reporter.sendError('ai_scan', {
          code: 'E_ALARM_PROCESSING_FAILED',
          message: error.message || 'Bookshelf scan processing failed',
          retryable: true,
          details: {
            fallbackAvailable: false,
            suggestion: 'Try uploading clearer photos or contact support if issue persists',
          },
        })
      }

      // Clean up temporary storage (R2 keys, not images - R2 cleanup handled by cancel endpoint)
      await this.storage.delete('scanImageR2Keys')
      await this.storage.delete('processingType')
    } else if (processingType === 'enrichment') {
      // Batch enrichment processing path
      console.log('[JobStateManager] Alarm triggered for batch enrichment processing')

      const isbns = await this.storage.get('enrichmentISBNs')
      const includeEmbedding = await this.storage.get('includeEmbedding')
      const jobState = await this.storage.get('jobState')

      if (!isbns || !jobState) {
        console.error('[JobStateManager] Missing ISBNs or job state in alarm handler')
        return
      }

      const reporter = new ProgressReporter(jobState.jobId, this.env)

      try {
        // Process enrichment in chunks
        await this.processEnrichmentJob(isbns, includeEmbedding, reporter, jobState.jobId)
      } catch (error) {
        console.error('[JobStateManager] Enrichment processing failed in alarm:', error)

        await reporter.sendError('enrichment', {
          code: 'E_ALARM_PROCESSING_FAILED',
          message: error.message || 'Batch enrichment processing failed',
          retryable: true,
          details: {
            fallbackAvailable: true,
            suggestion: 'Try reducing batch size or contact support if issue persists',
          },
        })
      }

      // Clean up temporary storage
      await this.storage.delete('enrichmentISBNs')
      await this.storage.delete('includeEmbedding')
      await this.storage.delete('processingType')
    } else {
      // Cleanup path (24 hour cleanup after job completion/failure)
      console.log('[JobStateManager] Cleanup alarm triggered - removing old state')

      const jobState = await this.storage.get('jobState')

      // Also cleanup WebSocket DO storage
      if (jobState?.jobId) {
        try {
          const wsDoId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(jobState.jobId)
          const wsDoStub = this.env.WEBSOCKET_CONNECTION_DO.get(wsDoId)
          await wsDoStub.cleanupStorage()
        } catch (error) {
          console.warn('[JobStateManager] Failed to cleanup WebSocket DO storage:', error)
        }
      }

      await this.storage.delete('jobState')
    }
  }
}
