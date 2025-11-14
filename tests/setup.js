/**
 * Global Test Setup
 *
 * Runs before all tests to configure:
 * - Global mocks for external APIs
 * - Test utilities
 * - Environment variables
 */

import { vi, beforeAll, afterEach } from "vitest";

// ============================================================================
// ENVIRONMENT SETUP
// ============================================================================

// Set test environment variables
process.env.ENABLE_UNIFIED_ENVELOPE = "true";
process.env.NODE_ENV = "test";

// ============================================================================
// POLYFILLS FOR NODE ENVIRONMENT
// ============================================================================

// localStorage polyfill for MSW compatibility in Node.js environment
// MSW requires localStorage to store cookie data
// CRITICAL: This must run BEFORE any MSW imports
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
  get length() {
    return storage.size
  },
  key: (index) => {
    const keys = Array.from(storage.keys())
    return keys[index] || null
  },
}

// Cloudflare Edge Cache API polyfill for Node.js environment
// Used by EdgeCacheService in UnifiedCacheService
const cacheStorage = new Map()
globalThis.caches = {
  default: {
    match: async (request) => {
      const url = typeof request === 'string' ? request : request.url
      return cacheStorage.get(url) || null
    },
    put: async (request, response) => {
      const url = typeof request === 'string' ? request : request.url
      cacheStorage.set(url, response)
    },
    delete: async (request) => {
      const url = typeof request === 'string' ? request : request.url
      return cacheStorage.delete(url)
    },
  },
  open: async (cacheName) => ({
    match: async (request) => {
      const url = typeof request === 'string' ? request : request.url
      const key = `${cacheName}:${url}`
      return cacheStorage.get(key) || null
    },
    put: async (request, response) => {
      const url = typeof request === 'string' ? request : request.url
      const key = `${cacheName}:${url}`
      cacheStorage.set(key, response)
    },
    delete: async (request) => {
      const url = typeof request === 'string' ? request : request.url
      const key = `${cacheName}:${url}`
      return cacheStorage.delete(key)
    },
  }),
}

// ============================================================================
// GLOBAL MOCKS
// ============================================================================

// Mock Cloudflare Modules (if needed)
// These should be mocked per test file as needed

// ============================================================================
// GLOBAL UTILITIES
// ============================================================================

/**
 * Mock KV Namespace
 * Used for testing KV cache operations
 */
export function createMockKV() {
  const store = new Map();

  return {
    get: vi.fn(async (key, type = "text") => {
      const value = store.get(key);
      if (type === "json" && value) {
        return JSON.parse(value);
      }
      return value;
    }),

    put: vi.fn(async (key, value, options = {}) => {
      let stringValue = value;
      if (typeof value === "object") {
        stringValue = JSON.stringify(value);
      }
      store.set(key, stringValue);

      // Handle expiration TTL
      if (options.expirationTtl) {
        setTimeout(() => {
          store.delete(key);
        }, options.expirationTtl * 1000);
      }
    }),

    delete: vi.fn(async (key) => {
      store.delete(key);
    }),

    list: vi.fn(async () => {
      return { keys: Array.from(store.keys()) };
    }),
  };
}

/**
 * Mock Durable Object Storage
 * Used for testing DO state persistence
 */
export function createMockDOStorage() {
  const store = new Map();
  const alarms = [];

  return {
    get: vi.fn(async (key) => {
      return store.get(key);
    }),

    put: vi.fn(async (key, value) => {
      if (typeof value === "object") {
        store.set(key, JSON.parse(JSON.stringify(value)));
      } else {
        store.set(key, value);
      }
    }),

    delete: vi.fn(async (key) => {
      store.delete(key);
    }),

    list: vi.fn(async () => {
      return { keys: Array.from(store.keys()) };
    }),

    setAlarm: vi.fn(async (alarmTime) => {
      alarms.push(alarmTime);
    }),

    getAlarm: vi.fn(async () => {
      return alarms.length > 0 ? alarms[0] : null;
    }),

    deleteAlarm: vi.fn(async () => {
      alarms.pop();
    }),

    // Test helper to get all stored data
    __getAll: () => Object.fromEntries(store),

    // Test helper to clear all data
    __clear: () => {
      store.clear();
      alarms.length = 0;
    },
  };
}

/**
 * Mock WebSocket Pair
 * Used for testing WebSocket upgrade and messaging
 */
export function createMockWebSocketPair() {
  const serverListeners = {};
  const clientListeners = {};

  const server = {
    send: vi.fn((message) => {
      if (clientListeners.message) {
        clientListeners.message({ data: message });
      }
    }),

    close: vi.fn((code = 1000, reason = "") => {
      if (serverListeners.close) {
        serverListeners.close({ code, reason });
      }
    }),

    accept: vi.fn(() => {
      // Accept connection
    }),

    addEventListener: vi.fn((event, handler) => {
      serverListeners[event] = handler;
    }),

    removeEventListener: vi.fn((event) => {
      delete serverListeners[event];
    }),
  };

  const client = {
    send: vi.fn((message) => {
      if (serverListeners.message) {
        serverListeners.message({ data: message });
      }
    }),

    close: vi.fn((code = 1000, reason = "") => {
      if (clientListeners.close) {
        clientListeners.close({ code, reason });
      }
    }),

    addEventListener: vi.fn((event, handler) => {
      clientListeners[event] = handler;
    }),

    removeEventListener: vi.fn((event) => {
      delete clientListeners[event];
    }),
  };

  return { server, client, serverListeners, clientListeners };
}

/**
 * Mock Analytics Engine Dataset
 * Used for testing metrics and analytics
 */
export function createMockAnalyticsDataset() {
  const data = [];

  return {
    writeDataPoint: vi.fn((dataPoint) => {
      data.push(dataPoint);
    }),

    // Test helper to retrieve all data
    __getData: () => data,

    // Test helper to clear data
    __clear: () => {
      data.length = 0;
    },
  };
}

/**
 * Mock R2 Bucket
 * Used for testing file uploads/downloads
 */
export function createMockR2Bucket() {
  const store = new Map();

  return {
    head: vi.fn(async (key) => {
      if (store.has(key)) {
        return { key, size: store.get(key).length };
      }
      return null;
    }),

    get: vi.fn(async (key) => {
      const data = store.get(key);
      if (!data) return null;
      return { body: data, text: () => Promise.resolve(data.toString()) };
    }),

    put: vi.fn(async (key, value) => {
      store.set(key, value);
      return { key };
    }),

    delete: vi.fn(async (key) => {
      store.delete(key);
    }),

    list: vi.fn(async () => {
      return { objects: Array.from(store.keys()).map((k) => ({ key: k })) };
    }),

    // Test helper
    __getAll: () => Object.fromEntries(store),
  };
}

/**
 * Mock Queue
 * Used for testing queue producers
 */
export function createMockQueue() {
  const messages = [];

  return {
    send: vi.fn(async (message) => {
      messages.push(message);
      return { id: `msg-${Date.now()}` };
    }),

    sendBatch: vi.fn(async (messages) => {
      messages.forEach((msg) => messages.push(msg));
      return { id: `batch-${Date.now()}` };
    }),

    // Test helper
    __getMessages: () => messages,
    __clear: () => {
      messages.length = 0;
    },
  };
}

// ============================================================================
// TEST LIFECYCLE HOOKS
// ============================================================================

/**
 * Clear all mocks before each test
 */
afterEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// EXPORTS FOR TEST FILES
// ============================================================================

export const testUtils = {
  createMockKV,
  createMockDOStorage,
  createMockWebSocketPair,
  createMockAnalyticsDataset,
  createMockR2Bucket,
  createMockQueue,
};
