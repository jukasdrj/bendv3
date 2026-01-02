import { DurableObject } from 'cloudflare:workers'
import { getCorsHeaders } from '../middleware/cors.ts'

/**
 * WebSocket Connection Durable Object
 *
 * Responsibility: WebSocket connection lifecycle management ONLY
 * - Manages WebSocket connections per job
 * - Handles authentication and token validation
 * - Routes messages to appropriate state manager
 * - Broadcasts messages to connected clients
 *
 * This DO is part of the refactored architecture that separates concerns:
 * - WebSocketConnectionDO: Connection management (this file)
 * - JobStateManagerDO: State persistence
 * - Services: Business logic (csv-processor, batch-enrichment)
 *
 * Related: Issue #68 - Refactor Monolithic ProgressWebSocketDO
 */
export class WebSocketConnectionDO extends DurableObject {
  constructor(state, env) {
    super(state, env)
    this.storage = state.storage
    this.webSocket = null
    this.jobId = null
    this.isReady = false
    this.readyPromise = null
    this.readyResolver = null
    // Add a correlation ID for improved logging per-connection instance
    this.correlationId = crypto.randomUUID().slice(0, 8)

    // Log level control (Issue #122)
    // Supported levels: 'error' (critical only), 'info' (default), 'debug' (verbose)
    this.logLevel = env.LOG_LEVEL || 'info'

    // WebSocket health metrics (Issue #36)
    this.metrics = {
      connectionEstablished: 0,
      disconnectReasons: {
        timeout: 0,
        error: 0,
        clientClose: 0,
        serverClose: 0,
      },
      messageSendFailures: 0,
      connectionStartTime: null,
      totalConnectionDuration: 0,
    }
  }

  /**
   * Handle WebSocket upgrade request
   *
   * @param {Request} request - Upgrade request with jobId and token
   * @returns {Promise<Response>} WebSocket upgrade response or error
   */
  async fetch(request) {
    const upgradeStartTime = Date.now()
    const url = new URL(request.url)
    const upgradeHeader = request.headers.get('Upgrade')

    if (this.logLevel === 'debug') {
      console.log(`[WebSocketConnectionDO] [cid: ${this.correlationId}] Incoming request`, {
        url: url.toString(),
        upgradeHeader,
        method: request.method,
        timestamp: upgradeStartTime,
      })
    }

    // Validate WebSocket upgrade
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      console.warn(`[WebSocketConnectionDO] [cid: ${this.correlationId}] Invalid upgrade header`, {
        upgradeHeader,
      })
      return new Response('Expected Upgrade: websocket', {
        status: 426,
        headers: {
          ...getCorsHeaders(request),
          'Content-Type': 'text/plain',
        },
      })
    }

    // Extract jobId from query params
    const jobId = url.searchParams.get('jobId')
    if (!jobId) {
      console.error(`[WebSocketConnectionDO] [cid: ${this.correlationId}] Missing jobId parameter`)
      return new Response('Missing jobId parameter', {
        status: 400,
        headers: getCorsHeaders(request),
      })
    }

    // SECURITY: Validate authentication token
    const providedToken = url.searchParams.get('token')
    const storageStartTime = Date.now()
    const [storedToken, expiration] = await Promise.all([
      this.storage.get('authToken'),
      this.storage.get('authTokenExpiration'),
    ])
    const storageDuration = Date.now() - storageStartTime

    if (this.logLevel === 'debug') {
      console.log(`[${jobId}] [cid: ${this.correlationId}] Storage reads took ${storageDuration}ms`)
    }

    // SECURITY FIX (#212): Check if token has already been consumed (one-time use)
    const tokenConsumed = await this.storage.get('authTokenConsumed')

    if (tokenConsumed) {
      console.warn(
        `[${jobId}] [cid: ${this.correlationId}] WebSocket authentication failed - token already used (prevents session hijacking)`,
      )
      return new Response('Token already consumed. Only one connection per token is allowed.', {
        status: 401,
        headers: {
          ...getCorsHeaders(request),
          'Content-Type': 'text/plain',
        },
      })
    }

    if (!storedToken || !providedToken || storedToken !== providedToken) {
      console.warn(
        `[${jobId}] [cid: ${this.correlationId}] WebSocket authentication failed - invalid token`,
      )
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          ...getCorsHeaders(request),
          'Content-Type': 'text/plain',
        },
      })
    }

    if (Date.now() > expiration) {
      console.warn(
        `[${jobId}] [cid: ${this.correlationId}] WebSocket authentication failed - token expired`,
      )
      return new Response('Token expired', {
        status: 401,
        headers: {
          ...getCorsHeaders(request),
          'Content-Type': 'text/plain',
        },
      })
    }

    // SECURITY FIX (#212): Mark token as consumed IMMEDIATELY after validation
    // This prevents race conditions where multiple clients try to connect simultaneously
    await this.storage.put('authTokenConsumed', true)

    if (this.logLevel === 'debug') {
      console.log(
        `[${jobId}] [cid: ${this.correlationId}] ✅ WebSocket authentication successful (token now invalidated for reuse)`,
      )
    }

    // Create WebSocket pair
    const pairStartTime = Date.now()
    const [client, server] = Object.values(new WebSocketPair())
    const pairDuration = Date.now() - pairStartTime

    // Store server-side WebSocket
    this.webSocket = server
    this.jobId = jobId

    // Accept connection
    const acceptStartTime = Date.now()
    this.webSocket.accept()
    const acceptDuration = Date.now() - acceptStartTime

    // Track connection establishment (Issue #36)
    this.metrics.connectionEstablished++
    this.metrics.connectionStartTime = Date.now()

    // Initialize ready promise
    this.readyPromise = new Promise((resolve) => {
      this.readyResolver = resolve
    })

    const totalUpgradeDuration = Date.now() - upgradeStartTime
    if (this.logLevel === 'info' || this.logLevel === 'debug') {
      console.log(
        `[${this.jobId}] [cid: ${this.correlationId}] WebSocket connection accepted, waiting for ready signal`,
      )
    }
    if (this.logLevel === 'debug') {
      console.log(`[${this.jobId}] [cid: ${this.correlationId}] 📊 WebSocket upgrade timing:`, {
        storageDuration: `${storageDuration}ms`,
        pairCreation: `${pairDuration}ms`,
        accept: `${acceptDuration}ms`,
        totalUpgrade: `${totalUpgradeDuration}ms`,
      })
    }

    // Setup event handlers
    this.webSocket.addEventListener('message', (event) => {
      this.handleMessage(event.data)
    })

    this.webSocket.addEventListener('close', (event) => {
      if (this.logLevel === 'info' || this.logLevel === 'debug') {
        console.log(
          `[${this.jobId}] [cid: ${this.correlationId}] WebSocket closed:`,
          event.code,
          event.reason,
        )
      }

      // Track disconnect reason (Issue #36)
      if (event.code === 1000) {
        this.metrics.disconnectReasons.clientClose++
      } else if (event.code === 1001) {
        // Specifically track "Going Away" (client switching protocols or navigating)
        this.metrics.disconnectReasons.clientClose++
      } else if (event.code === 1006) {
        this.metrics.disconnectReasons.timeout++
      } else {
        this.metrics.disconnectReasons.serverClose++
      }

      // Track connection duration
      if (this.metrics.connectionStartTime) {
        const duration = Date.now() - this.metrics.connectionStartTime
        this.metrics.totalConnectionDuration += duration
        if (this.logLevel === 'info' || this.logLevel === 'debug') {
          console.log(
            `[${this.jobId}] [cid: ${this.correlationId}] Connection duration: ${duration}ms`,
          )
        }
      }

      this.cleanup()
    })

    this.webSocket.addEventListener('error', (event) => {
      console.error(`[${this.jobId}] [cid: ${this.correlationId}] WebSocket error:`, event)

      // Track error disconnect (Issue #36)
      this.metrics.disconnectReasons.error++

      this.cleanup()
    })

    // Return client-side WebSocket to client
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: getCorsHeaders(request),
    })
  }

  /**
   * Handle incoming WebSocket messages
   *
   * @param {string} data - Message data from client
   */
  async handleMessage(data) {
    if (this.logLevel === 'debug') {
      console.log(`[${this.jobId}] [cid: ${this.correlationId}] Received message:`, data)
    }

    try {
      const msg = JSON.parse(data)

      // Validate message structure
      if (!msg || typeof msg !== 'object') {
        console.warn(
          `[${this.jobId}] [cid: ${this.correlationId}] Invalid message structure: not an object`,
        )
        return
      }

      if (!msg.type || typeof msg.type !== 'string') {
        console.warn(
          `[${this.jobId}] [cid: ${this.correlationId}] Invalid message structure: missing or invalid 'type' field`,
          msg,
        )
        return
      }

      // Handle ready signal
      if (msg.type === 'ready') {
        if (this.logLevel === 'info' || this.logLevel === 'debug') {
          console.log(
            `[${this.jobId}] [cid: ${this.correlationId}] ✅ Client ready signal received`,
          )
        }
        this.isReady = true

        // Resolve the ready promise to unblock processing
        if (this.readyResolver) {
          this.readyResolver()
          this.readyResolver = null
        }

        // Get pipeline from storage for ready_ack message
        const pipeline = (await this.storage.get('pipeline')) || 'unknown'
        const now = Date.now()

        // Send acknowledgment back to client (matches hibernation DO format)
        this.send({
          type: 'ready_ack',
          jobId: this.jobId,
          pipeline,
          timestamp: now,
          version: '2.0.0',
          payload: {
            type: 'ready_ack',
            timestamp: now,
          },
        })

        // ENHANCED LOGGING: Log immediately after sending ready_ack to establish a timing baseline
        if (this.logLevel === 'debug') {
          console.log(
            `[${this.jobId}] [cid: ${this.correlationId}] ✅ ready_ack sent. WebSocket readyState: ${this.webSocket?.readyState}`,
          )
        }
      } else {
        if (this.logLevel === 'debug') {
          console.log(
            `[${this.jobId}] [cid: ${this.correlationId}] Unknown message type: ${msg.type}`,
          )
        }
      }
    } catch (error) {
      console.error(`[${this.jobId}] [cid: ${this.correlationId}] Failed to parse message:`, error)
    }
  }

  /**
   * RPC Method: Set authentication token for WebSocket connection
   * Called by handlers before starting background processing
   *
   * SECURITY (#212): Tokens are one-time use to prevent session hijacking
   * - Each new token resets the consumed flag
   * - First WebSocket connection consumes the token
   * - Subsequent connections with same token are rejected
   *
   * @param {string} token - Authentication token (UUID)
   * @returns {Promise<{success: boolean}>}
   */
  async setAuthToken(token, pipeline = null) {
    await this.storage.put('authToken', token)
    // Tokens expire after 2 hours
    await this.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000)
    // Store pipeline for ready_ack message (if provided)
    if (pipeline) {
      await this.storage.put('pipeline', pipeline)
    }
    // SECURITY FIX (#212): Reset consumed flag when new token is issued
    // This allows legitimate reconnections with fresh tokens
    await this.storage.delete('authTokenConsumed')
    if (this.logLevel === 'debug') {
      console.log(`[${this.jobId || 'unknown'}] Auth token set (expires in 2 hours, one-time use)`)
    }
    return { success: true }
  }

  /**
   * RPC Method: Set pipeline type for this job
   * Called by handlers to set the pipeline type for ready_ack messages
   *
   * @param {string} pipeline - Pipeline type (batch_enrichment, csv_import, ai_scan)
   * @returns {Promise<{success: boolean}>}
   */
  async setPipeline(pipeline) {
    await this.storage.put('pipeline', pipeline)
    if (this.logLevel === 'debug') {
      console.log(`[${this.jobId || 'unknown'}] Pipeline set to: ${pipeline}`)
    }
    return { success: true }
  }

  /**
   * RPC Method: Get authentication token and expiration (for polling status endpoint)
   *
   * Used by /api/job-state/:jobId to validate Bearer token authentication
   * when clients poll for job status instead of using WebSocket
   *
   * @returns {Promise<{token: string, expiresAt: number} | null>}
   */
  async getAuthToken() {
    const token = await this.storage.get('authToken')
    const expiresAt = await this.storage.get('authTokenExpiration')

    if (!token || !expiresAt) {
      return null
    }

    return { token, expiresAt }
  }

  /**
   * RPC Method: Validate authentication token for SSE streams
   *
   * Used by V3 SSE stream handlers to validate Bearer tokens without
   * consuming them (SSE connections don't consume tokens like WebSocket).
   *
   * @param {string | undefined} providedToken - Token from Authorization header
   * @returns {Promise<{valid: boolean, expired?: boolean}>}
   */
  async validateAuthToken(providedToken) {
    if (!providedToken) {
      return { valid: false }
    }

    const storedToken = await this.storage.get('authToken')
    const expiration = await this.storage.get('authTokenExpiration')

    if (!storedToken) {
      return { valid: false }
    }

    if (storedToken !== providedToken) {
      return { valid: false }
    }

    if (Date.now() > expiration) {
      return { valid: false, expired: true }
    }

    return { valid: true }
  }

  /**
   * RPC Method: Refresh authentication token (for POST /api/refresh-token)
   *
   * Allows clients to extend token expiration before it expires.
   * Security measures:
   * - Validates old token before issuing new one
   * - Only allows refresh within 30-minute window before expiration
   * - Prevents concurrent refresh race conditions
   * - Extends expiration by 2 hours from refresh time
   *
   * @param {string} oldToken - Current token to validate
   * @returns {Promise<{token?: string, expiresIn?: number, error?: string}>}
   */
  async refreshAuthToken(oldToken) {
    // Prevent concurrent refresh race conditions
    if (this.refreshInProgress) {
      console.warn(`[${this.jobId || 'unknown'}] Token refresh already in progress`)
      return { error: 'Refresh in progress, please retry shortly' }
    }

    this.refreshInProgress = true
    try {
      const storedToken = await this.storage.get('authToken')
      const expiration = await this.storage.get('authTokenExpiration')

      // Validate old token
      if (!storedToken || !oldToken || storedToken !== oldToken) {
        console.warn(`[${this.jobId || 'unknown'}] Token refresh failed - invalid token`)
        return { error: 'Invalid token' }
      }

      // Check if token is expired
      if (Date.now() > expiration) {
        console.warn(`[${this.jobId || 'unknown'}] Token refresh failed - token expired`)
        return { error: 'Token expired' }
      }

      // Enforce 30-minute refresh window (prevents infinite extension)
      // Tokens can only be refreshed in the last 30 minutes before expiration
      const REFRESH_WINDOW_MS = 30 * 60 * 1000 // 30 minutes
      const timeUntilExpiration = expiration - Date.now()
      if (timeUntilExpiration > REFRESH_WINDOW_MS) {
        const minutesRemaining = Math.floor(timeUntilExpiration / 60000)
        console.warn(
          `[${this.jobId || 'unknown'}] Token refresh too early - ${minutesRemaining} minutes remaining`,
        )
        return {
          error: 'Refresh not allowed yet',
          details: `Token can be refreshed ${Math.floor((timeUntilExpiration - REFRESH_WINDOW_MS) / 60000)} minutes from now`,
        }
      }

      // Generate new token and extend expiration by 2 hours
      const TOKEN_EXPIRATION_MS = 2 * 60 * 60 * 1000 // 2 hours
      const newToken = crypto.randomUUID()
      const newExpiration = Date.now() + TOKEN_EXPIRATION_MS
      await this.storage.put('authToken', newToken)
      await this.storage.put('authTokenExpiration', newExpiration)

      // Reset consumed flag to allow new WebSocket connection with refreshed token
      await this.storage.delete('authTokenConsumed')

      if (this.logLevel === 'debug') {
        console.log(
          `[${this.jobId || 'unknown'}] ✅ Token refreshed successfully (expires in 2 hours)`,
        )
      }

      return {
        token: newToken,
        expiresIn: 7200, // 2 hours in seconds
      }
    } finally {
      this.refreshInProgress = false
    }
  }

  /**
   * RPC Method: Wait for client ready signal
   *
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<{timedOut: boolean, disconnected: boolean}>}
   */
  async waitForReady(timeoutMs = 5000) {
    if (this.isReady) {
      return { timedOut: false, disconnected: false }
    }

    // Fix: Check BOTH webSocket AND readyPromise to prevent race condition
    if (!this.webSocket || !this.readyPromise) {
      return { timedOut: false, disconnected: true }
    }

    try {
      await Promise.race([
        this.readyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
      ])
      return { timedOut: false, disconnected: false }
    } catch (error) {
      if (error.message === 'Timeout') {
        return { timedOut: true, disconnected: false }
      }
      throw error
    }
  }

  /**
   * RPC Method: Send message to connected client
   *
   * @param {Object} message - Message to send
   * @returns {Promise<{success: boolean}>}
   */
  async send(message) {
    // Atomic send with single readyState check to prevent race condition (Issue #117)
    // Leverages synchronous throw behavior of Cloudflare Workers WebSocket.send()
    try {
      if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
        throw new Error(`WebSocket not open: ${this.webSocket?.readyState || 'null'}`)
      }
      this.webSocket.send(JSON.stringify(message))
      return { success: true }
    } catch (error) {
      // Single catch handles both !OPEN throws and network errors
      console.warn(`[${this.jobId}] [cid: ${this.correlationId}] Send failed: ${error.message}`)
      // Track send failure (Issue #36)
      this.metrics.messageSendFailures++

      // Alert if we've had multiple failures (Issue #109)
      if (this.metrics.messageSendFailures >= 3) {
        console.warn(
          `[WebSocket ${this.jobId}] Message send failures: ${this.metrics.messageSendFailures}`,
        )
      }

      return { success: false }
    }
  }

  /**
   * RPC Method: Close WebSocket connection
   *
   * @param {string} reason - Reason for closing
   * @returns {Promise<{success: boolean}>}
   */
  async closeConnection(reason = 'Job completed') {
    if (this.webSocket) {
      if (this.logLevel === 'debug') {
        console.log(`[${this.jobId}] Closing WebSocket: ${reason}`)
      }
      try {
        this.webSocket.close(1000, reason)
      } catch (error) {
        console.error(`[${this.jobId}] Error closing WebSocket:`, error)
      }
    }
    this.cleanup()
    return { success: true }
  }

  /**
   * RPC Method: Clean up stored authentication data
   * Called by JobStateManagerDO during final cleanup to prevent storage leak
   *
   * @returns {Promise<{success: boolean}>}
   */
  async cleanupStorage() {
    await this.storage.delete('authToken')
    await this.storage.delete('authTokenExpiration')
    if (this.logLevel === 'debug') {
      console.log(`[${this.jobId || 'unknown'}] Auth token storage cleaned up`)
    }
    return { success: true }
  }

  /**
   * RPC Method: Get WebSocket health metrics (Issue #36)
   * Returns current metrics for observability and monitoring
   *
   * @returns {Promise<Object>} Metrics object with connection stats
   */
  async getMetrics() {
    const avgConnectionDuration =
      this.metrics.connectionEstablished > 0
        ? this.metrics.totalConnectionDuration / this.metrics.connectionEstablished
        : 0

    return {
      connectionEstablished: this.metrics.connectionEstablished,
      disconnectReasons: this.metrics.disconnectReasons,
      messageSendFailures: this.metrics.messageSendFailures,
      avgConnectionDurationMs: Math.round(avgConnectionDuration),
      currentlyConnected: this.webSocket ? 1 : 0,
    }
  }

  /**
   * Internal cleanup
   */
  cleanup() {
    this.webSocket = null
    this.jobId = null
    this.isReady = false
    this.readyPromise = null
    this.readyResolver = null
  }
}
