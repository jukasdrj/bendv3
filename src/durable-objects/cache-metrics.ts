import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types/env.js'

/**
 * CacheMetricsDO - Durable Object for aggregating cache performance metrics
 *
 * Tracks:
 * - Cache hits/misses
 * - Read/write operations
 * - Cache churn (frequent rewrites)
 * - TTL effectiveness (hot vs cold TTL hits)
 * - Per-prefix breakdowns (book:, author:, cover:)
 *
 * Time windows: current minute, hour, day, total
 */

const CHURN_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const ALARM_INTERVAL_MS = 60 * 1000 // 1 minute
const STATE_PERSIST_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Cache stats for a single metric
 */
interface CacheStats {
  hits: number
  misses: number
  reads: number
  writes: number
  churns: number
  ttl_effective_hits: number
}

/**
 * Time window with per-prefix breakdowns
 */
interface TimeWindow {
  prefixes: Record<string, CacheStats>
  total: CacheStats
}

/**
 * Disconnect reason types
 */
type DisconnectReason = 'clientClose' | 'timeout' | 'error' | 'serverClose'

/**
 * Disconnect reasons tracking
 */
interface DisconnectReasons {
  clientClose: number
  timeout: number
  error: number
  serverClose: number
}

/**
 * WebSocket metrics window
 */
interface WebSocketStats {
  connectionsEstablished: number
  disconnectReasons: DisconnectReasons
  messageSendFailures: number
  totalConnectionDuration: number
}

/**
 * D1 latency buckets
 */
interface LatencyBuckets {
  fast: number // < 10ms
  normal: number // 10-50ms
  slow: number // 50-200ms
  verySlow: number // > 200ms
}

/**
 * D1 query metrics window
 */
interface D1Stats {
  queryCount: number
  readQueries: number
  writeQueries: number
  totalLatencyMs: number
  errorCount: number
  latencyBuckets: LatencyBuckets
}

/**
 * API contract validation metrics window
 */
interface ApiContractStats {
  totalValidations: number
  validationFailures: number
  failuresByEndpoint: Record<string, number>
  failuresByField: Record<string, number>
}

/**
 * External API provider metrics
 */
interface ProviderStats {
  requestCount: number
  errorCount: number
  quotaRemaining?: number
  tokensUsed?: number
}

/**
 * External API metrics window
 */
interface ExternalApiStats {
  googleBooks: ProviderStats & { quotaRemaining: number }
  isbndb: ProviderStats & { quotaRemaining: number }
  gemini: ProviderStats & { tokensUsed: number }
}

/**
 * Complete metrics state
 */
interface MetricsState {
  lastUpdated: number
  currentMinute: TimeWindow
  currentHour: TimeWindow
  currentDay: TimeWindow
  total: TimeWindow
  lastPutTimestamps: Record<string, number>
  websocket: {
    currentMinute: WebSocketStats
    currentHour: WebSocketStats
    currentDay: WebSocketStats
    total: WebSocketStats
  }
  d1: {
    currentMinute: D1Stats
    currentHour: D1Stats
    currentDay: D1Stats
    total: D1Stats
  }
  apiContract: {
    currentMinute: ApiContractStats
    currentHour: ApiContractStats
    currentDay: ApiContractStats
    total: ApiContractStats
  }
  externalApi: {
    currentMinute: ExternalApiStats
    currentHour: ExternalApiStats
    currentDay: ExternalApiStats
    total: ExternalApiStats
  }
}

/**
 * Cache event data
 */
interface CacheEventData {
  type: 'hit' | 'miss' | 'write'
  prefix: string
  key: string
  timestamp: number
  hotTtlExpiry?: number
}

/**
 * WebSocket metrics recording data
 */
interface WebSocketMetricsData {
  connectionsEstablished?: boolean
  disconnectReason?: DisconnectReason
  messageSendFailure?: boolean
  connectionDuration?: number
}

/**
 * D1 metrics recording data
 */
interface D1MetricsData {
  queryType?: 'read' | 'write'
  latencyMs?: number
  error?: boolean
  readCount?: number
  writeCount?: number
  queryCount?: number
}

/**
 * API contract metrics recording data
 */
interface ApiContractMetricsData {
  endpoint?: string
  success: boolean
  failedField?: string
}

/**
 * External API metrics recording data
 */
interface ExternalApiMetricsData {
  provider: 'googleBooks' | 'isbndb' | 'gemini'
  error?: boolean
  tokensUsed?: number
  quotaRemaining?: number
}

export class CacheMetricsDO extends DurableObject<Env> {
  private stats: MetricsState
  private lastPersisted: number

  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    this.stats = this.initializeStats()
    this.lastPersisted = Date.now()

    // FIX: Split operations to avoid race condition with multiple alarms
    // Load state immediately, then setup alarm separately
    this.ctx.blockConcurrencyWhile(async () => {
      await this.loadStats()
      // Setup alarm within the block to ensure it's sequenced after state load
      // and prevents race conditions with incoming requests or concurrent setup
      await this.setupAlarm()
    })
  }

  /**
   * Initialize empty stats structure
   * Extended to include WebSocket, D1, API contract, and external API metrics (Issue #36)
   */
  private initializeStats(): MetricsState {
    const emptyStats = (): CacheStats => ({
      hits: 0,
      misses: 0,
      reads: 0,
      writes: 0,
      churns: 0,
      ttl_effective_hits: 0,
    })

    const emptyTimeWindow = (): TimeWindow => ({
      prefixes: {},
      total: emptyStats(),
    })

    // WebSocket metrics (Issue #36)
    const emptyWebSocketStats = (): WebSocketStats => ({
      connectionsEstablished: 0,
      disconnectReasons: {
        clientClose: 0,
        timeout: 0,
        error: 0,
        serverClose: 0,
      },
      messageSendFailures: 0,
      totalConnectionDuration: 0,
    })

    // D1 query latency metrics (Issue #36)
    const emptyD1Stats = (): D1Stats => ({
      queryCount: 0,
      readQueries: 0,
      writeQueries: 0,
      totalLatencyMs: 0,
      errorCount: 0,
      latencyBuckets: {
        fast: 0, // < 10ms
        normal: 0, // 10-50ms
        slow: 0, // 50-200ms
        verySlow: 0, // > 200ms
      },
    })

    // API contract validation metrics (Issue #36)
    const emptyApiContractStats = (): ApiContractStats => ({
      totalValidations: 0,
      validationFailures: 0,
      failuresByEndpoint: {},
      failuresByField: {},
    })

    // External API quota metrics (Issue #36)
    const emptyExternalApiStats = (): ExternalApiStats => ({
      googleBooks: {
        requestCount: 0,
        errorCount: 0,
        quotaRemaining: 1000, // Daily limit
      },
      isbndb: {
        requestCount: 0,
        errorCount: 0,
        quotaRemaining: 5000, // Daily limit
      },
      gemini: {
        requestCount: 0,
        errorCount: 0,
        tokensUsed: 0,
      },
    })

    return {
      lastUpdated: Date.now(),
      // Cache metrics (existing)
      currentMinute: emptyTimeWindow(),
      currentHour: emptyTimeWindow(),
      currentDay: emptyTimeWindow(),
      total: emptyTimeWindow(),
      lastPutTimestamps: {}, // Plain object for storage compatibility
      // WebSocket metrics (Issue #36)
      websocket: {
        currentMinute: emptyWebSocketStats(),
        currentHour: emptyWebSocketStats(),
        currentDay: emptyWebSocketStats(),
        total: emptyWebSocketStats(),
      },
      // D1 metrics (Issue #36)
      d1: {
        currentMinute: emptyD1Stats(),
        currentHour: emptyD1Stats(),
        currentDay: emptyD1Stats(),
        total: emptyD1Stats(),
      },
      // API contract metrics (Issue #36)
      apiContract: {
        currentMinute: emptyApiContractStats(),
        currentHour: emptyApiContractStats(),
        currentDay: emptyApiContractStats(),
        total: emptyApiContractStats(),
      },
      // External API metrics (Issue #36)
      externalApi: {
        currentMinute: emptyExternalApiStats(),
        currentHour: emptyExternalApiStats(),
        currentDay: emptyExternalApiStats(),
        total: emptyExternalApiStats(),
      },
    }
  }

  /**
   * Load stats from durable storage
   * Updated to ensure new metric types exist (Issue #36)
   */
  private async loadStats(): Promise<void> {
    const storedStats = await this.ctx.storage.get<MetricsState>('cacheStats')
    if (storedStats) {
      this.stats = storedStats
      const initialized = this.initializeStats()

      // Ensure all cache windows exist
      if (!this.stats.currentMinute) this.stats.currentMinute = initialized.currentMinute
      if (!this.stats.currentHour) this.stats.currentHour = initialized.currentHour
      if (!this.stats.currentDay) this.stats.currentDay = initialized.currentDay
      if (!this.stats.total) this.stats.total = initialized.total
      if (!this.stats.lastPutTimestamps) this.stats.lastPutTimestamps = {}

      // Ensure new metric types exist (Issue #36)
      if (!this.stats.websocket) this.stats.websocket = initialized.websocket
      if (!this.stats.d1) this.stats.d1 = initialized.d1
      if (!this.stats.apiContract) this.stats.apiContract = initialized.apiContract
      if (!this.stats.externalApi) this.stats.externalApi = initialized.externalApi
    }
  }

  /**
   * Persist stats to durable storage
   */
  private async persistStats(): Promise<void> {
    await this.ctx.storage.put('cacheStats', this.stats)
    this.lastPersisted = Date.now()
  }

  /**
   * Setup periodic alarm
   */
  private async setupAlarm(): Promise<void> {
    const currentAlarm = await this.ctx.storage.getAlarm()
    if (currentAlarm === null || currentAlarm < Date.now()) {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS)
    }
  }

  /**
   * Alarm handler - runs every minute for rollovers
   * FIX: Added error handling and always reschedule alarm to prevent metric rollover failures
   */
  override async alarm(): Promise<void> {
    const now = Date.now()

    try {
      const lastUpdated = this.stats.lastUpdated

      const lastUpdatedDate = new Date(lastUpdated)
      const nowMinute = new Date(now).getMinutes()
      const lastMinute = lastUpdatedDate.getMinutes()
      const nowHour = new Date(now).getHours()
      const lastHour = lastUpdatedDate.getHours()
      const nowDay = new Date(now).getDate()
      const lastDay = lastUpdatedDate.getDate()

      // Roll over minute stats (cache + new metrics)
      if (nowMinute !== lastMinute) {
        const initialized = this.initializeStats()
        // Cache metrics
        this.aggregateWindow(this.stats.currentMinute, this.stats.currentHour)
        this.stats.currentMinute = initialized.currentMinute
        // WebSocket metrics (Issue #36)
        this.aggregateWebSocketWindow(
          this.stats.websocket.currentMinute,
          this.stats.websocket.currentHour,
        )
        this.stats.websocket.currentMinute = initialized.websocket.currentMinute
        // D1 metrics (Issue #36)
        this.aggregateD1Window(this.stats.d1.currentMinute, this.stats.d1.currentHour)
        this.stats.d1.currentMinute = initialized.d1.currentMinute
        // API contract metrics (Issue #36)
        this.aggregateApiContractWindow(
          this.stats.apiContract.currentMinute,
          this.stats.apiContract.currentHour,
        )
        this.stats.apiContract.currentMinute = initialized.apiContract.currentMinute
        // External API metrics (Issue #36)
        this.aggregateExternalApiWindow(
          this.stats.externalApi.currentMinute,
          this.stats.externalApi.currentHour,
        )
        this.stats.externalApi.currentMinute = initialized.externalApi.currentMinute
      }

      // Roll over hour stats
      if (nowHour !== lastHour) {
        const initialized = this.initializeStats()
        // Cache metrics
        this.aggregateWindow(this.stats.currentHour, this.stats.currentDay)
        this.stats.currentHour = initialized.currentHour
        // WebSocket metrics (Issue #36)
        this.aggregateWebSocketWindow(
          this.stats.websocket.currentHour,
          this.stats.websocket.currentDay,
        )
        this.stats.websocket.currentHour = initialized.websocket.currentHour
        // D1 metrics (Issue #36)
        this.aggregateD1Window(this.stats.d1.currentHour, this.stats.d1.currentDay)
        this.stats.d1.currentHour = initialized.d1.currentHour
        // API contract metrics (Issue #36)
        this.aggregateApiContractWindow(
          this.stats.apiContract.currentHour,
          this.stats.apiContract.currentDay,
        )
        this.stats.apiContract.currentHour = initialized.apiContract.currentHour
        // External API metrics (Issue #36)
        this.aggregateExternalApiWindow(
          this.stats.externalApi.currentHour,
          this.stats.externalApi.currentDay,
        )
        this.stats.externalApi.currentHour = initialized.externalApi.currentHour
      }

      // Roll over day stats
      if (nowDay !== lastDay) {
        const initialized = this.initializeStats()
        // Reset day stats (could push to KV for historical in Phase 2)
        this.stats.currentDay = initialized.currentDay
        this.stats.websocket.currentDay = initialized.websocket.currentDay
        this.stats.d1.currentDay = initialized.d1.currentDay
        this.stats.apiContract.currentDay = initialized.apiContract.currentDay
        this.stats.externalApi.currentDay = initialized.externalApi.currentDay
      }

      // FIX: Optimize churn detection - sample max 1000 keys to prevent O(n) performance issues
      const churnKeys = Object.keys(this.stats.lastPutTimestamps)
      const sampleSize = Math.min(churnKeys.length, 1000)
      const keysToCheck = churnKeys.slice(0, sampleSize)

      for (const key of keysToCheck) {
        const timestamp = this.stats.lastPutTimestamps[key]
        if (timestamp && now - timestamp > CHURN_WINDOW_MS) {
          delete this.stats.lastPutTimestamps[key]
        }
      }

      this.stats.lastUpdated = now

      // Persist state periodically
      if (now - this.lastPersisted > STATE_PERSIST_INTERVAL_MS) {
        await this.persistStats()
      }
    } catch (error) {
      console.error('[CacheMetricsDO] Alarm failed:', error)
      // Don't throw - we still want to reschedule the alarm
    } finally {
      // FIX: Always reschedule alarm, even on error, to prevent metric collection from stopping
      try {
        await this.ctx.storage.setAlarm(now + ALARM_INTERVAL_MS)
      } catch (alarmError) {
        console.error('[CacheMetricsDO] Failed to reschedule alarm:', alarmError)
      }
    }
  }

  /**
   * Aggregate source window into destination window
   */
  private aggregateWindow(source: TimeWindow, destination: TimeWindow): void {
    // Aggregate total stats
    this.addStats(destination.total, source.total)

    // Aggregate prefix stats
    for (const prefix in source.prefixes) {
      if (!destination.prefixes[prefix]) {
        destination.prefixes[prefix] = {
          hits: 0,
          misses: 0,
          reads: 0,
          writes: 0,
          churns: 0,
          ttl_effective_hits: 0,
        }
      }
      this.addStats(destination.prefixes[prefix], source.prefixes[prefix])
    }
  }

  /**
   * Add source stats to target stats
   */
  private addStats(target: CacheStats, source: CacheStats): void {
    target.hits += source.hits
    target.misses += source.misses
    target.reads += source.reads
    target.writes += source.writes
    target.churns += source.churns
    target.ttl_effective_hits += source.ttl_effective_hits
  }

  /**
   * Aggregate WebSocket metrics from source to destination window (Issue #36)
   */
  private aggregateWebSocketWindow(source: WebSocketStats, destination: WebSocketStats): void {
    destination.connectionsEstablished += source.connectionsEstablished
    destination.disconnectReasons.clientClose += source.disconnectReasons.clientClose
    destination.disconnectReasons.timeout += source.disconnectReasons.timeout
    destination.disconnectReasons.error += source.disconnectReasons.error
    destination.disconnectReasons.serverClose += source.disconnectReasons.serverClose
    destination.messageSendFailures += source.messageSendFailures
    destination.totalConnectionDuration += source.totalConnectionDuration
  }

  /**
   * Aggregate D1 metrics from source to destination window (Issue #36)
   */
  private aggregateD1Window(source: D1Stats, destination: D1Stats): void {
    destination.queryCount += source.queryCount
    destination.readQueries += source.readQueries
    destination.writeQueries += source.writeQueries
    destination.totalLatencyMs += source.totalLatencyMs
    destination.errorCount += source.errorCount
    destination.latencyBuckets.fast += source.latencyBuckets.fast
    destination.latencyBuckets.normal += source.latencyBuckets.normal
    destination.latencyBuckets.slow += source.latencyBuckets.slow
    destination.latencyBuckets.verySlow += source.latencyBuckets.verySlow
  }

  /**
   * Aggregate API contract metrics from source to destination window (Issue #36)
   */
  private aggregateApiContractWindow(
    source: ApiContractStats,
    destination: ApiContractStats,
  ): void {
    destination.totalValidations += source.totalValidations
    destination.validationFailures += source.validationFailures

    // Merge failuresByEndpoint
    for (const endpoint in source.failuresByEndpoint) {
      if (!destination.failuresByEndpoint[endpoint]) {
        destination.failuresByEndpoint[endpoint] = 0
      }
      const sourceValue = source.failuresByEndpoint[endpoint]
      if (sourceValue !== undefined) {
        destination.failuresByEndpoint[endpoint]! += sourceValue
      }
    }

    // Merge failuresByField
    for (const field in source.failuresByField) {
      if (!destination.failuresByField[field]) {
        destination.failuresByField[field] = 0
      }
      const sourceValue = source.failuresByField[field]
      if (sourceValue !== undefined) {
        destination.failuresByField[field]! += sourceValue
      }
    }
  }

  /**
   * Aggregate external API metrics from source to destination window (Issue #36)
   */
  private aggregateExternalApiWindow(
    source: ExternalApiStats,
    destination: ExternalApiStats,
  ): void {
    // Google Books
    destination.googleBooks.requestCount += source.googleBooks.requestCount
    destination.googleBooks.errorCount += source.googleBooks.errorCount
    // Quota remaining is current value, not cumulative
    destination.googleBooks.quotaRemaining = source.googleBooks.quotaRemaining

    // ISBNdb
    destination.isbndb.requestCount += source.isbndb.requestCount
    destination.isbndb.errorCount += source.isbndb.errorCount
    destination.isbndb.quotaRemaining = source.isbndb.quotaRemaining

    // Gemini
    destination.gemini.requestCount += source.gemini.requestCount
    destination.gemini.errorCount += source.gemini.errorCount
    destination.gemini.tokensUsed += source.gemini.tokensUsed
  }

  /**
   * Update stats for a cache event
   */
  private updateStats(event: CacheEventData, windowStats: TimeWindow): void {
    // Initialize prefix stats if needed
    if (!windowStats.prefixes[event.prefix]) {
      windowStats.prefixes[event.prefix] = {
        hits: 0,
        misses: 0,
        reads: 0,
        writes: 0,
        churns: 0,
        ttl_effective_hits: 0,
      }
    }

    const prefixStats = windowStats.prefixes[event.prefix]

    const update = (stats: CacheStats): void => {
      if (event.type === 'hit') {
        stats.hits++
        stats.reads++
        // Check TTL effectiveness: hit after hot TTL expiry
        if (event.hotTtlExpiry && event.timestamp > event.hotTtlExpiry) {
          stats.ttl_effective_hits++
        }
      } else if (event.type === 'miss') {
        stats.misses++
        stats.reads++
      } else if (event.type === 'write') {
        stats.writes++
        // Churn detection
        const lastPut = this.stats.lastPutTimestamps[event.key]
        if (lastPut && event.timestamp - lastPut < CHURN_WINDOW_MS) {
          stats.churns++
        }
        this.stats.lastPutTimestamps[event.key] = event.timestamp
      }
    }

    update(prefixStats)
    update(windowStats.total)
  }

  /**
   * RPC Method: Get cache statistics
   * Native DO stub call pattern - returns plain object, not HTTP Response
   *
   * @returns Promise resolving to stats object with metrics
   */
  async getStats(): Promise<MetricsState> {
    return this.stats
  }

  /**
   * RPC Method: Record cache event
   * Native DO stub call pattern - returns plain object, not HTTP Response
   *
   * @param eventData - Event data {type, prefix, key, timestamp, hotTtlExpiry}
   * @returns Promise resolving to success status
   */
  async recordEvent(eventData: CacheEventData): Promise<{ success: boolean }> {
    try {
      // FIX: Validate event data schema to prevent corrupted stats
      if (!eventData || typeof eventData !== 'object') {
        throw new Error('Invalid event data: must be an object')
      }

      const requiredFields: (keyof CacheEventData)[] = ['type', 'prefix', 'key', 'timestamp']
      for (const field of requiredFields) {
        if (!(field in eventData)) {
          throw new Error(`Invalid event data: missing required field '${field}'`)
        }
      }

      // Validate type
      const validTypes: Array<'hit' | 'miss' | 'write'> = ['hit', 'miss', 'write']
      if (!validTypes.includes(eventData.type)) {
        throw new Error(`Invalid event type: must be one of ${validTypes.join(', ')}`)
      }

      // Validate timestamp
      if (typeof eventData.timestamp !== 'number' || eventData.timestamp <= 0) {
        throw new Error('Invalid timestamp: must be a positive number')
      }

      // Update all time windows
      this.updateStats(eventData, this.stats.currentMinute)
      this.updateStats(eventData, this.stats.currentHour)
      this.updateStats(eventData, this.stats.currentDay)
      this.updateStats(eventData, this.stats.total)

      this.stats.lastUpdated = eventData.timestamp

      // FIX: Reduce write frequency from 5min to 10min to prevent write amplification
      if (Date.now() - this.lastPersisted > STATE_PERSIST_INTERVAL_MS) {
        await this.persistStats()
      }

      return { success: true }
    } catch (error) {
      console.error('[CacheMetricsDO] Failed to process cache event:', error)
      throw error // Let caller handle the error
    }
  }

  /**
   * RPC Method: Record WebSocket metrics (Issue #36)
   * @param data - {connectionsEstablished, disconnectReason, messageSendFailure, connectionDuration}
   * @returns Promise resolving to success status
   */
  async recordWebSocketMetrics(data: WebSocketMetricsData): Promise<{ success: boolean }> {
    try {
      const now = Date.now()
      const windows = [
        this.stats.websocket.currentMinute,
        this.stats.websocket.currentHour,
        this.stats.websocket.currentDay,
        this.stats.websocket.total,
      ]

      for (const window of windows) {
        if (data.connectionsEstablished) window.connectionsEstablished++
        if (data.disconnectReason) window.disconnectReasons[data.disconnectReason]++
        if (data.messageSendFailure) window.messageSendFailures++
        if (data.connectionDuration) window.totalConnectionDuration += data.connectionDuration
      }

      this.stats.lastUpdated = now
      return { success: true }
    } catch (error) {
      console.error('[CacheMetricsDO] Failed to record WebSocket metrics:', error)
      throw error
    }
  }

  /**
   * RPC Method: Record D1 query metrics (Issue #36)
   * @param data - {queryType ('read'|'write'), latencyMs, error}
   * @returns Promise resolving to success status
   */
  async recordD1Metrics(data: D1MetricsData): Promise<{ success: boolean }> {
    try {
      // Validate batch-specific fields
      if (
        typeof data.readCount !== 'undefined' &&
        (typeof data.readCount !== 'number' || data.readCount < 0)
      ) {
        throw new Error(`Invalid readCount: must be non-negative number, got ${data.readCount}`)
      }

      if (
        typeof data.writeCount !== 'undefined' &&
        (typeof data.writeCount !== 'number' || data.writeCount < 0)
      ) {
        throw new Error(`Invalid writeCount: must be non-negative number, got ${data.writeCount}`)
      }

      if (
        typeof data.queryCount !== 'undefined' &&
        (typeof data.queryCount !== 'number' || data.queryCount < 0)
      ) {
        throw new Error(`Invalid queryCount: must be non-negative number, got ${data.queryCount}`)
      }

      const now = Date.now()
      const windows = [
        this.stats.d1.currentMinute,
        this.stats.d1.currentHour,
        this.stats.d1.currentDay,
        this.stats.d1.total,
      ]

      for (const window of windows) {
        // Handle batch counts if provided, otherwise default to single query
        const readCount = data.readCount || (data.queryType === 'read' ? 1 : 0)
        const writeCount = data.writeCount || (data.queryType === 'write' ? 1 : 0)
        const queryCount = data.queryCount || readCount + writeCount || 1

        // Validate consistency between counts
        if (data.queryCount && data.readCount !== undefined && data.writeCount !== undefined) {
          const totalFromCounts = data.readCount + data.writeCount
          if (Math.abs(data.queryCount - totalFromCounts) > 0.001) {
            console.warn(
              `[CacheMetricsDO] Query count inconsistency: queryCount=${data.queryCount} but readCount+writeCount=${totalFromCounts}`,
            )
          }
        }

        window.queryCount += queryCount
        window.readQueries += readCount
        window.writeQueries += writeCount

        if (data.latencyMs) {
          window.totalLatencyMs += data.latencyMs
          // Categorize latency
          if (data.latencyMs < 10) window.latencyBuckets.fast++
          else if (data.latencyMs < 50) window.latencyBuckets.normal++
          else if (data.latencyMs < 200) window.latencyBuckets.slow++
          else window.latencyBuckets.verySlow++
        }
        if (data.error) window.errorCount++
      }

      this.stats.lastUpdated = now
      return { success: true }
    } catch (error) {
      console.error('[CacheMetricsDO] Failed to record D1 metrics:', error)
      throw error
    }
  }

  /**
   * RPC Method: Record API contract validation metrics (Issue #36)
   * @param data - {endpoint, success, failedField}
   * @returns Promise resolving to success status
   */
  async recordApiContractMetrics(data: ApiContractMetricsData): Promise<{ success: boolean }> {
    try {
      const now = Date.now()
      const windows = [
        this.stats.apiContract.currentMinute,
        this.stats.apiContract.currentHour,
        this.stats.apiContract.currentDay,
        this.stats.apiContract.total,
      ]

      for (const window of windows) {
        window.totalValidations++
        if (!data.success) {
          window.validationFailures++
          if (data.endpoint) {
            if (!window.failuresByEndpoint[data.endpoint]) {
              window.failuresByEndpoint[data.endpoint] = 0
            }
            window.failuresByEndpoint[data.endpoint]!++
          }
          if (data.failedField) {
            if (!window.failuresByField[data.failedField]) {
              window.failuresByField[data.failedField] = 0
            }
            window.failuresByField[data.failedField]!++
          }
        }
      }

      this.stats.lastUpdated = now
      return { success: true }
    } catch (error) {
      console.error('[CacheMetricsDO] Failed to record API contract metrics:', error)
      throw error
    }
  }

  /**
   * RPC Method: Record external API metrics (Issue #36)
   * @param data - {provider ('googleBooks'|'isbndb'|'gemini'), error, tokensUsed, quotaRemaining}
   * @returns Promise resolving to success status
   */
  async recordExternalApiMetrics(data: ExternalApiMetricsData): Promise<{ success: boolean }> {
    try {
      const now = Date.now()
      const windows = [
        this.stats.externalApi.currentMinute,
        this.stats.externalApi.currentHour,
        this.stats.externalApi.currentDay,
        this.stats.externalApi.total,
      ]

      for (const window of windows) {
        const providerStats = window[data.provider]
        if (providerStats) {
          providerStats.requestCount++
          if (data.error) providerStats.errorCount++
          if (data.tokensUsed && 'tokensUsed' in providerStats && providerStats.tokensUsed !== undefined) {
            providerStats.tokensUsed += data.tokensUsed
          }
          if (typeof data.quotaRemaining === 'number' && 'quotaRemaining' in providerStats) {
            providerStats.quotaRemaining = data.quotaRemaining
          }
        }
      }

      this.stats.lastUpdated = now
      return { success: true }
    } catch (error) {
      console.error('[CacheMetricsDO] Failed to record external API metrics:', error)
      throw error
    }
  }

  /**
   * Handle incoming requests (DEPRECATED - use RPC methods instead)
   * Kept for backward compatibility during migration
   */
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/event' && request.method === 'POST') {
      // Handle cache event - delegate to RPC method
      try {
        const event = (await request.json()) as CacheEventData
        const result = await this.recordEvent(event)
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Failed to process cache event:', error)
        return new Response('Bad Request', { status: 400 })
      }
    }
    if (url.pathname === '/stats' && request.method === 'GET') {
      // Return aggregated stats - delegate to RPC method
      const stats = await this.getStats()
      return new Response(JSON.stringify(stats), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('Use RPC methods: getStats() or recordEvent()', {
      status: 400,
    })
  }
}
