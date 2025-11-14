/**
 * MSW Server Helper
 *
 * Provides an opt-in MSW server for tests that need to mock external APIs
 * Usage in test files:
 *
 * ```js
 * import { setupMSW } from '../helpers/msw-server.js'
 *
 * setupMSW() // Uses default handlers
 * // or
 * setupMSW([customHandler1, customHandler2]) // Custom handlers
 * ```
 */

// MSW requires localStorage - polyfill for Node.js environment
if (typeof globalThis.localStorage === "undefined") {
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
}

import { setupServer } from "msw/node";
import { beforeAll, afterEach, afterAll } from "vitest";
import { handlers as defaultHandlers } from "../mocks/handlers/index.js";

/**
 * Set up MSW server for a test file
 * @param {Array} customHandlers - Optional array of custom MSW handlers
 * @returns {Object} The MSW server instance
 */
export function setupMSW(customHandlers = null) {
  const handlersToUse = customHandlers || defaultHandlers;
  const server = setupServer(...handlersToUse);

  beforeAll(() => {
    server.listen({
      onUnhandledRequest: "bypass", // Allow test-specific mocks
    });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  return server;
}

/**
 * Export handlers for easy access in tests
 */
export { handlers } from "../mocks/handlers/index.js";
export {
  googleBooksHandlers,
  isbndbHandlers,
  geminiHandlers,
  createGoogleBooksResponse,
  createGoogleBooksHandler,
  createIsbndbResponse,
  createIsbndbHandler,
  createGeminiResponse,
  createGeminiHandler,
} from "../mocks/handlers/index.js";
