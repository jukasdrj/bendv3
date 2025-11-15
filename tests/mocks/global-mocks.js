/**
 * Global Mocks for Cloudflare Bindings
 *
 * This file contains mock implementations for all the Cloudflare bindings
 * defined in wrangler.toml. These mocks are designed to be used in Vitest
 * tests to simulate the behavior of the Cloudflare environment.
 *
 * All mocks are automatically applied via the `tests/setup.js` file.
 */

// =============================================================================
// KV Namespaces
// =============================================================================

// In-memory store for KV namespaces
const kvStore = new Map();

export const mockKV = {
  get: vi.fn((key) => kvStore.get(key)),
  put: vi.fn((key, value) => kvStore.set(key, value)),
  delete: vi.fn((key) => kvStore.delete(key)),
  list: vi.fn(() => ({
    keys: Array.from(kvStore.keys()).map((name) => ({ name })),
    list_complete: true,
    cursor: undefined,
  })),
  // Helper to clear the store before each test
  clear: () => kvStore.clear(),
};

// =============================================================================
// R2 Buckets
// =============================================================================

// In-memory store for R2 buckets
const r2Store = new Map();

export const mockR2 = {
  get: vi.fn(async (key) => {
    const value = r2Store.get(key);
    if (!value) return null;
    return {
      arrayBuffer: async () => value,
      json: async () => JSON.parse(new TextDecoder().decode(value)),
      text: async () => new TextDecoder().decode(value),
    };
  }),
  put: vi.fn(async (key, value) => {
    r2Store.set(key, value);
    return { key };
  }),
  delete: vi.fn(async (key) => {
    r2Store.delete(key);
  }),
  list: vi.fn(async () => ({
    objects: Array.from(r2Store.keys()).map((key) => ({ key })),
    truncated: false,
    cursor: undefined,
  })),
  // Helper to clear the store before each test
  clear: () => r2Store.clear(),
};

// =============================================================================
// Durable Objects
// =============================================================================

// In-memory store for Durable Object states
const doStore = new Map();

class MockDurableObject {
  constructor(state) {
    this.state = state;
  }

  fetch(request) {
    // Simulate a simple fetch handler
    return new Response(`Hello from ${this.state.id.toString()}`);
  }
}

export const mockDurableObjects = {
  get: vi.fn((name) => {
    if (!doStore.has(name)) {
      doStore.set(name, new MockDurableObject({ id: name }));
    }
    return doStore.get(name);
  }),
  // Helper to clear the store before each test
  clear: () => doStore.clear(),
};

// =============================================================================
// Queues
// =============================================================================

// In-memory store for Queues
const queueStore = new Map();

export const mockQueues = {
  get: vi.fn((name) => {
    if (!queueStore.has(name)) {
      queueStore.set(name, []);
    }
    return {
      send: vi.fn((message) => queueStore.get(name).push(message)),
      sendBatch: vi.fn((messages) =>
        queueStore.get(name).push(...messages.map((m) => m.body))
      ),
    };
  }),
  // Helper to get all messages from a queue
  getMessages: (name) => queueStore.get(name) || [],
  // Helper to clear all queues
  clear: () => queueStore.clear(),
};

// =============================================================================
// Analytics Engine
// =============================================================================

// In-memory store for Analytics Engine
const analyticsStore = new Map();

export const mockAnalyticsEngine = {
  get: vi.fn((name) => {
    if (!analyticsStore.has(name)) {
      analyticsStore.set(name, []);
    }
    return {
      writeDataPoint: vi.fn((data) => analyticsStore.get(name).push(data)),
    };
  }),
  // Helper to get all data points from an engine
  getDataPoints: (name) => analyticsStore.get(name) || [],
  // Helper to clear all engines
  clear: () => analyticsStore.clear(),
};

// =============================================================================
// Secrets
// =============================================================================

export const mockSecrets = {
  GOOGLE_BOOKS_API_KEY: "mock-google-books-api-key",
  ISBNDB_API_KEY: "mock-isbndb-api-key",
  GEMINI_API_KEY: "mock-gemini-api-key",
};

// =============================================================================
// AI
// =_===========================================================================

export const mockAI = {
  run: vi.fn(async () => ({
    response: "This is a mock AI response.",
  })),
};
