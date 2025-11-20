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

    // Load state and setup alarm
    this.state.blockConcurrencyWhile(async () => {
      await this.loadStats();
      await this.setupAlarm();
    });
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
   */
  async alarm() {
    const now = Date.now();
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

    // Prune old churn detection keys
    const churnKeys = Object.keys(this.stats.lastPutTimestamps);
    for (const key of churnKeys) {
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

    // Reschedule alarm
    await this.state.storage.setAlarm(now + ALARM_INTERVAL_MS);
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
   * Handle incoming requests
   */
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/event" && request.method === "POST") {
      // Handle cache event
      try {
        const event = await request.json();

        // Update all time windows
        this.updateStats(event, this.stats.currentMinute);
        this.updateStats(event, this.stats.currentHour);
        this.updateStats(event, this.stats.currentDay);
        this.updateStats(event, this.stats.total);

        this.stats.lastUpdated = event.timestamp;

        // Persist more frequently for events
        if (Date.now() - this.lastPersisted > STATE_PERSIST_INTERVAL_MS / 2) {
          await this.persistStats();
        }

        return new Response("Event received", { status: 200 });
      } catch (error) {
        console.error("Failed to process cache event:", error);
        return new Response("Bad Request", { status: 400 });
      }
    } else if (url.pathname === "/stats" && request.method === "GET") {
      // Return aggregated stats
      return new Response(JSON.stringify(this.stats), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  }
}
