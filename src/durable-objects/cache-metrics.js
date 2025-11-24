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

const CHURN_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const ALARM_INTERVAL_MS = 60 * 1000; // 1 minute
const STATE_PERSIST_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class CacheMetricsDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.stats = this.initializeStats();
    this.lastPersisted = Date.now();

    // FIX: Split operations to avoid race condition with multiple alarms
    // Load state immediately, then setup alarm separately
    this.state.blockConcurrencyWhile(async () => {
      await this.loadStats();
    });

    // Setup alarm after state is loaded (separate operation prevents race)
    this.setupAlarm();
  }

  /**
   * Initialize empty stats structure
   */
  initializeStats() {
    const emptyStats = () => ({
      hits: 0,
      misses: 0,
      reads: 0,
      writes: 0,
      churns: 0,
      ttl_effective_hits: 0,
    });

    const emptyTimeWindow = () => ({
      prefixes: {},
      total: emptyStats(),
    });

    return {
      lastUpdated: Date.now(),
      currentMinute: emptyTimeWindow(),
      currentHour: emptyTimeWindow(),
      currentDay: emptyTimeWindow(),
      total: emptyTimeWindow(),
      lastPutTimestamps: {}, // Plain object for storage compatibility
    };
  }

  /**
   * Load stats from durable storage
   */
  async loadStats() {
    const storedStats = await this.state.storage.get("cacheStats");
    if (storedStats) {
      this.stats = storedStats;
      // Ensure all windows exist
      if (!this.stats.currentMinute)
        this.stats.currentMinute = this.initializeStats().currentMinute;
      if (!this.stats.currentHour)
        this.stats.currentHour = this.initializeStats().currentHour;
      if (!this.stats.currentDay)
        this.stats.currentDay = this.initializeStats().currentDay;
      if (!this.stats.total) this.stats.total = this.initializeStats().total;
      if (!this.stats.lastPutTimestamps) this.stats.lastPutTimestamps = {};
    }
  }

  /**
   * Persist stats to durable storage
   */
  async persistStats() {
    await this.state.storage.put("cacheStats", this.stats);
    this.lastPersisted = Date.now();
  }

  /**
   * Setup periodic alarm
   */
  async setupAlarm() {
    const currentAlarm = await this.state.storage.getAlarm();
    if (currentAlarm === null || currentAlarm < Date.now()) {
      await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }

  /**
   * Alarm handler - runs every minute for rollovers
   * FIX: Added error handling and always reschedule alarm to prevent metric rollover failures
   */
  async alarm() {
    const now = Date.now();

    try {
      const lastUpdated = this.stats.lastUpdated;

      const lastUpdatedDate = new Date(lastUpdated);
      const nowMinute = new Date(now).getMinutes();
      const lastMinute = lastUpdatedDate.getMinutes();
      const nowHour = new Date(now).getHours();
      const lastHour = lastUpdatedDate.getHours();
      const nowDay = new Date(now).getDate();
      const lastDay = lastUpdatedDate.getDate();

      // Roll over minute stats
      if (nowMinute !== lastMinute) {
        this.aggregateWindow(this.stats.currentMinute, this.stats.currentHour);
        this.stats.currentMinute = this.initializeStats().currentMinute;
      }

      // Roll over hour stats
      if (nowHour !== lastHour) {
        this.aggregateWindow(this.stats.currentHour, this.stats.currentDay);
        this.stats.currentHour = this.initializeStats().currentHour;
      }

      // Roll over day stats
      if (nowDay !== lastDay) {
        // Reset day stats (could push to KV for historical in Phase 2)
        this.stats.currentDay = this.initializeStats().currentDay;
      }

      // FIX: Optimize churn detection - sample max 1000 keys to prevent O(n) performance issues
      const churnKeys = Object.keys(this.stats.lastPutTimestamps);
      const sampleSize = Math.min(churnKeys.length, 1000);
      const keysToCheck = churnKeys.slice(0, sampleSize);

      for (const key of keysToCheck) {
        const timestamp = this.stats.lastPutTimestamps[key];
        if (now - timestamp > CHURN_WINDOW_MS) {
          delete this.stats.lastPutTimestamps[key];
        }
      }

      this.stats.lastUpdated = now;

      // Persist state periodically
      if (now - this.lastPersisted > STATE_PERSIST_INTERVAL_MS) {
        await this.persistStats();
      }
    } catch (error) {
      console.error("[CacheMetricsDO] Alarm failed:", error);
      // Don't throw - we still want to reschedule the alarm
    } finally {
      // FIX: Always reschedule alarm, even on error, to prevent metric collection from stopping
      try {
        await this.state.storage.setAlarm(now + ALARM_INTERVAL_MS);
      } catch (alarmError) {
        console.error("[CacheMetricsDO] Failed to reschedule alarm:", alarmError);
      }
    }
  }

  /**
   * Aggregate source window into destination window
   */
  aggregateWindow(source, destination) {
    // Aggregate total stats
    this.addStats(destination.total, source.total);

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
        };
      }
      this.addStats(destination.prefixes[prefix], source.prefixes[prefix]);
    }
  }

  /**
   * Add source stats to target stats
   */
  addStats(target, source) {
    target.hits += source.hits;
    target.misses += source.misses;
    target.reads += source.reads;
    target.writes += source.writes;
    target.churns += source.churns;
    target.ttl_effective_hits += source.ttl_effective_hits;
  }

  /**
   * Update stats for a cache event
   */
  updateStats(event, windowStats) {
    // Initialize prefix stats if needed
    if (!windowStats.prefixes[event.prefix]) {
      windowStats.prefixes[event.prefix] = {
        hits: 0,
        misses: 0,
        reads: 0,
        writes: 0,
        churns: 0,
        ttl_effective_hits: 0,
      };
    }

    const prefixStats = windowStats.prefixes[event.prefix];

    const update = (stats) => {
      if (event.type === "hit") {
        stats.hits++;
        stats.reads++;
        // Check TTL effectiveness: hit after hot TTL expiry
        if (event.hotTtlExpiry && event.timestamp > event.hotTtlExpiry) {
          stats.ttl_effective_hits++;
        }
      } else if (event.type === "miss") {
        stats.misses++;
        stats.reads++;
      } else if (event.type === "write") {
        stats.writes++;
        // Churn detection
        const lastPut = this.stats.lastPutTimestamps[event.key];
        if (lastPut && event.timestamp - lastPut < CHURN_WINDOW_MS) {
          stats.churns++;
        }
        this.stats.lastPutTimestamps[event.key] = event.timestamp;
      }
    };

    update(prefixStats);
    update(windowStats.total);
  }

  /**
   * RPC Method: Get cache statistics
   * Native DO stub call pattern - returns plain object, not HTTP Response
   *
   * @returns {Promise<Object>} Stats object with metrics
   */
  async getStats() {
    return this.stats;
  }

  /**
   * RPC Method: Record cache event
   * Native DO stub call pattern - returns plain object, not HTTP Response
   *
   * @param {Object} eventData - Event data {type, prefix, key, timestamp, hotTtlExpiry}
   * @returns {Promise<{success: boolean}>}
   */
  async recordEvent(eventData) {
    try {
      // FIX: Validate event data schema to prevent corrupted stats
      if (!eventData || typeof eventData !== 'object') {
        throw new Error('Invalid event data: must be an object');
      }

      const requiredFields = ['type', 'prefix', 'key', 'timestamp'];
      for (const field of requiredFields) {
        if (!(field in eventData)) {
          throw new Error(`Invalid event data: missing required field '${field}'`);
        }
      }

      // Validate type
      const validTypes = ['hit', 'miss', 'write'];
      if (!validTypes.includes(eventData.type)) {
        throw new Error(`Invalid event type: must be one of ${validTypes.join(', ')}`);
      }

      // Validate timestamp
      if (typeof eventData.timestamp !== 'number' || eventData.timestamp <= 0) {
        throw new Error('Invalid timestamp: must be a positive number');
      }

      // Update all time windows
      this.updateStats(eventData, this.stats.currentMinute);
      this.updateStats(eventData, this.stats.currentHour);
      this.updateStats(eventData, this.stats.currentDay);
      this.updateStats(eventData, this.stats.total);

      this.stats.lastUpdated = eventData.timestamp;

      // FIX: Reduce write frequency from 2.5min to 10min to prevent write amplification
      const PERSIST_FREQUENCY_MS = 10 * 60 * 1000; // 10 minutes
      if (Date.now() - this.lastPersisted > PERSIST_FREQUENCY_MS) {
        await this.persistStats();
      }

      return { success: true };
    } catch (error) {
      console.error("[CacheMetricsDO] Failed to process cache event:", error);
      throw error; // Let caller handle the error
    }
  }

  /**
   * Handle incoming requests (DEPRECATED - use RPC methods instead)
   * Kept for backward compatibility during migration
   */
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/event" && request.method === "POST") {
      // Handle cache event - delegate to RPC method
      try {
        const event = await request.json();
        const result = await this.recordEvent(event);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Failed to process cache event:", error);
        return new Response("Bad Request", { status: 400 });
      }
    } else if (url.pathname === "/stats" && request.method === "GET") {
      // Return aggregated stats - delegate to RPC method
      const stats = await this.getStats();
      return new Response(JSON.stringify(stats), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Use RPC methods: getStats() or recordEvent()", {
      status: 400,
    });
  }
}
