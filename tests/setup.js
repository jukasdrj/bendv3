/**
 * Global Test Setup
 *
 * Runs before all tests to configure:
 * - Global mocks for Cloudflare bindings
 * - Environment variables
 * - Polyfills for the Node.js environment
 */

import { vi, beforeEach } from 'vitest';
import {
  mockKV,
  mockR2,
  mockDurableObjects,
  mockQueues,
  mockAnalyticsEngine,
  mockSecrets,
  mockAI,
} from './mocks/global-mocks.js';
import { mockFetch, clearMockResponses } from './mocks/api-mocks.js';

// ============================================================================
// ENVIRONMENT SETUP
// ============================================================================

// Set test environment variables
process.env.ENABLE_UNIFIED_ENVELOPE = 'true';
process.env.NODE_ENV = 'test';

// ============================================================================
// POLYFILLS FOR NODE ENVIRONMENT
// ============================================================================

// localStorage polyfill for MSW compatibility in Node.js environment
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
  get length() {
    return storage.size;
  },
  key: (index) => {
    const keys = Array.from(storage.keys());
    return keys[index] || null;
  },
};

// Cloudflare Edge Cache API polyfill for Node.js environment
const cacheStorage = new Map();
globalThis.caches = {
  default: {
    match: async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      return cacheStorage.get(url) || null;
    },
    put: async (request, response) => {
      const url = typeof request === 'string' ? request : request.url;
      cacheStorage.set(url, response);
    },
    delete: async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      return cacheStorage.delete(url);
    },
  },
  open: async (cacheName) => ({
    match: async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      const key = `${cacheName}:${url}`;
      return cacheStorage.get(key) || null;
    },
    put: async (request, response) => {
      const url = typeof request === 'string' ? request : request.url;
      const key = `${cacheName}:${url}`;
      cacheStorage.set(key, response);
    },
    delete: async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      const key = `${cacheName}:${url}`;
      return cacheStorage.delete(key);
    },
  }),
};

// ============================================================================
// GLOBAL MOCKS FOR CLOUDFLARE BINDINGS
// ============================================================================

const env = {
  // KV Namespaces
  CACHE: mockKV,
  KV_CACHE: mockKV,

  // R2 Buckets
  API_CACHE_COLD: mockR2,
  LIBRARY_DATA: mockR2,
  BOOKSHELF_IMAGES: mockR2,
  BOOK_COVERS: mockR2,

  // Durable Objects
  PROGRESS_WEBSOCKET_DO: mockDurableObjects,
  RATE_LIMITER_DO: mockDurableObjects,

  // Queues
  AUTHOR_WARMING_QUEUE: mockQueues.get('author-warming-queue'),

  // Analytics Engine
  PERFORMANCE_ANALYTICS: mockAnalyticsEngine.get('performance-analytics'),
  CACHE_ANALYTICS: mockAnalyticsEngine.get('cache-analytics'),
  PROVIDER_ANALYTICS: mockAnalyticsEngine.get('provider-analytics'),
  AI_ANALYTICS: mockAnalyticsEngine.get('ai-analytics'),

  // Secrets
  ...mockSecrets,

  // AI
  AI: mockAI,
};

vi.stubGlobal('env', env);
vi.stubGlobal('fetch', mockFetch);

// ============================================================================
// TEST LIFECYCLE HOOKS
// ============================================================================

/**
 * Reset all mocks before each test to ensure test isolation.
 */
beforeEach(() => {
  vi.clearAllMocks();
  mockKV.clear();
  mockR2.clear();
  mockDurableObjects.clear();
  mockQueues.clear();
  mockAnalyticsEngine.clear();
  clearMockResponses();
});

// ============================================================================
// BACKWARD COMPATIBILITY
// ============================================================================
// Re-exporting the old mock factory functions to avoid having to refactor
// every existing test file. These now return the global singleton mocks.

export function createMockKV() {
  return mockKV;
}

export function createMockR2Bucket() {
  const bucket = mockR2;
  // Add backward-compatible helpers for existing tests
  if (!bucket.head) {
    bucket.head = vi.fn(async (key) => {
      const data = r2Store.get(key);
      return data ? { key, size: data.length } : null;
    });
  }
  if (!bucket.__getAll) {
    bucket.__getAll = () => Object.fromEntries(r2Store);
  }
  return bucket;
}

export function createMockQueue() {
  // The old factory returned a queue object directly. The new mock is a
  // namespace. We'll return a default queue instance for tests that need it.
  const queueName = 'default-test-queue';
  const queue = mockQueues.get(queueName);

  // Add backward-compatible helpers for existing tests
  queue.__getMessages = () => mockQueues.getMessages(queueName);
  queue.__clear = () => mockQueues.clear(); // Note: this clears ALL queues

  return queue;
}

export function createMockAnalyticsDataset() {
  // Same pattern as queues.
  const datasetName = 'default-test-dataset';
  const dataset = mockAnalyticsEngine.get(datasetName);

  // Add backward-compatible helpers for existing tests
  dataset.__getData = () => mockAnalyticsEngine.getDataPoints(datasetName);
  dataset.__clear = () => mockAnalyticsEngine.clear(); // Note: this clears ALL engines

  return dataset;
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
      if (typeof value === 'object') {
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

    close: vi.fn((code = 1000, reason = '') => {
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

    close: vi.fn((code = 1000, reason = '') => {
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
