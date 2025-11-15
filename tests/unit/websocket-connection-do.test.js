/**
 * Unit Tests: WebSocketConnectionDO
 * 
 * Tests the refactored WebSocket connection management Durable Object.
 * This DO is focused solely on WebSocket lifecycle and authentication.
 * 
 * Related: Issue #68 - Refactor Monolithic ProgressWebSocketDO
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DurableObject base class for testing
class MockDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
}

// Mock the cloudflare:workers module
vi.mock('cloudflare:workers', () => ({
  DurableObject: MockDurableObject,
}));

// Import after mocking
const { WebSocketConnectionDO } = await import('../../src/durable-objects/websocket-connection.js');

describe('WebSocketConnectionDO', () => {
  let mockState;
  let mockEnv;
  let doInstance;

  beforeEach(() => {
    // Mock Durable Object state
    const internalStorage = new Map();
    
    mockState = {
      storage: new Map(),
      id: { toString: () => 'test-do-id' }
    };

    // Add storage methods that don't recurse
    mockState.storage.get = vi.fn(async (key) => {
      return internalStorage.get(key);
    });
    
    mockState.storage.put = vi.fn(async (key, value) => {
      internalStorage.set(key, value);
    });

    mockState.storage.delete = vi.fn(async (key) => {
      internalStorage.delete(key);
    });

    mockState.storage.has = vi.fn((key) => {
      return internalStorage.has(key);
    });

    // Mock environment
    mockEnv = {};

    // Create DO instance
    doInstance = new WebSocketConnectionDO(mockState, mockEnv);
  });

  describe('Authentication', () => {
    it('should set auth token with expiration', async () => {
      const token = 'test-token-123';
      const result = await doInstance.setAuthToken(token);

      expect(result.success).toBe(true);
      expect(mockState.storage.put).toHaveBeenCalledWith('authToken', token);
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'authTokenExpiration',
        expect.any(Number)
      );
    });

    it('should reject upgrade without upgrade header', async () => {
      const request = new Request('http://localhost?jobId=test-123&token=abc', {
        method: 'GET'
      });

      const response = await doInstance.fetch(request);

      expect(response.status).toBe(426);
      expect(await response.text()).toBe('Expected Upgrade: websocket');
    });

    it('should reject upgrade without jobId', async () => {
      const request = new Request('http://localhost?token=abc', {
        method: 'GET',
        headers: { 'Upgrade': 'websocket' }
      });

      const response = await doInstance.fetch(request);

      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Missing jobId parameter');
    });

    it('should reject upgrade with invalid token', async () => {
      // Set a stored token
      await mockState.storage.put('authToken', 'valid-token');
      await mockState.storage.put('authTokenExpiration', Date.now() + 10000);

      const request = new Request('http://localhost?jobId=test-123&token=invalid-token', {
        method: 'GET',
        headers: { 'Upgrade': 'websocket' }
      });

      const response = await doInstance.fetch(request);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Unauthorized');
    });

    it('should reject upgrade with expired token', async () => {
      const token = 'valid-token';
      await mockState.storage.put('authToken', token);
      await mockState.storage.put('authTokenExpiration', Date.now() - 1000); // Expired

      const request = new Request(`http://localhost?jobId=test-123&token=${token}`, {
        method: 'GET',
        headers: { 'Upgrade': 'websocket' }
      });

      const response = await doInstance.fetch(request);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Token expired');
    });
  });

  describe('WebSocket Lifecycle', () => {
    it('should initialize ready promise on construction', () => {
      expect(doInstance.isReady).toBe(false);
      expect(doInstance.readyPromise).toBeNull();
      expect(doInstance.readyResolver).toBeNull();
    });

    it('should handle ready message from client', () => {
      doInstance.jobId = 'test-123';
      doInstance.readyPromise = new Promise((resolve) => {
        doInstance.readyResolver = resolve;
      });
      doInstance.webSocket = {
        send: vi.fn()
      };

      doInstance.handleMessage(JSON.stringify({ type: 'ready' }));

      expect(doInstance.isReady).toBe(true);
      expect(doInstance.webSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ready_ack"')
      );
    });

    it('should ignore invalid message format', () => {
      doInstance.jobId = 'test-123';
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      doInstance.handleMessage('invalid json');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should ignore messages with missing type', () => {
      doInstance.jobId = 'test-123';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      doInstance.handleMessage(JSON.stringify({ data: 'test' }));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should cleanup on close', () => {
      doInstance.webSocket = { send: vi.fn() };
      doInstance.jobId = 'test-123';
      doInstance.isReady = true;

      doInstance.cleanup();

      expect(doInstance.webSocket).toBeNull();
      expect(doInstance.jobId).toBeNull();
      expect(doInstance.isReady).toBe(false);
    });
  });

  describe('RPC Methods', () => {
    it('should wait for ready signal successfully', async () => {
      doInstance.isReady = false;
      doInstance.webSocket = { send: vi.fn() };
      doInstance.readyPromise = Promise.resolve();

      const result = await doInstance.waitForReady(1000);

      expect(result.timedOut).toBe(false);
      expect(result.disconnected).toBe(false);
    });

    it('should return immediately if already ready', async () => {
      doInstance.isReady = true;

      const result = await doInstance.waitForReady(1000);

      expect(result.timedOut).toBe(false);
      expect(result.disconnected).toBe(false);
    });

    it('should detect disconnected socket', async () => {
      doInstance.isReady = false;
      doInstance.webSocket = null;

      const result = await doInstance.waitForReady(1000);

      expect(result.disconnected).toBe(true);
    });

    it('should timeout if ready signal not received', async () => {
      doInstance.isReady = false;
      doInstance.webSocket = { send: vi.fn() };
      doInstance.readyPromise = new Promise(() => {}); // Never resolves

      const result = await doInstance.waitForReady(100);

      expect(result.timedOut).toBe(true);
    });

    it('should send message successfully', async () => {
      doInstance.jobId = 'test-123';
      doInstance.webSocket = {
        send: vi.fn()
      };

      const message = { type: 'test', data: 'hello' };
      const result = await doInstance.send(message);

      expect(result.success).toBe(true);
      expect(doInstance.webSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should fail to send if no websocket', async () => {
      doInstance.jobId = 'test-123';
      doInstance.webSocket = null;

      const message = { type: 'test', data: 'hello' };
      const result = await doInstance.send(message);

      expect(result.success).toBe(false);
    });

    it('should close connection gracefully', async () => {
      doInstance.jobId = 'test-123';
      const closeMock = vi.fn();
      doInstance.webSocket = {
        close: closeMock
      };

      const result = await doInstance.closeConnection('Test reason');

      expect(result.success).toBe(true);
      expect(closeMock).toHaveBeenCalledWith(1000, 'Test reason');
      expect(doInstance.webSocket).toBeNull();
    });

    it('should handle close error gracefully', async () => {
      doInstance.jobId = 'test-123';
      doInstance.webSocket = {
        close: vi.fn(() => { throw new Error('Close failed'); })
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await doInstance.closeConnection('Test reason');

      expect(result.success).toBe(true);
      expect(doInstance.webSocket).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('Message Handling', () => {
    beforeEach(() => {
      doInstance.jobId = 'test-123';
      doInstance.webSocket = {
        send: vi.fn()
      };
    });

    it('should handle ready message and send acknowledgment', () => {
      doInstance.readyPromise = new Promise((resolve) => {
        doInstance.readyResolver = resolve;
      });

      doInstance.handleMessage(JSON.stringify({ type: 'ready' }));

      expect(doInstance.isReady).toBe(true);
      expect(doInstance.webSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ready_ack"')
      );
      expect(doInstance.readyResolver).toBeNull(); // Cleared after resolve
    });

    it('should log unknown message types', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      doInstance.handleMessage(JSON.stringify({ type: 'unknown' }));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown message type: unknown')
      );
      consoleSpy.mockRestore();
    });
  });
});
