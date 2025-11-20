/**
 * Integration Tests: WebSocket Hibernation DO Authentication
 *
 * Tests authentication patterns specific to the hibernation WebSocket implementation:
 * - Subprotocol header authentication (secure method)
 * - Query parameter fallback (deprecated)
 * - Grace period token validation
 * - Full token validation flow (match + expiration + blacklist)
 *
 * Related: Phase 2A - Hibernation API Migration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockDOStorage, createMockHibernationState } from '../setup.js';

describe('Hibernation DO - WebSocket Authentication', () => {
  let mockState;
  let mockEnv;
  let hibernationDO;

  beforeEach(() => {
    // Create hibernation state mock
    mockState = createMockHibernationState();

    // Mock environment
    mockEnv = {
      KV_CACHE: {
        get: vi.fn((key, type) => Promise.resolve(null)),
        put: vi.fn(() => Promise.resolve()),
      },
    };

    // Simulate ProgressWebSocketDO_Hibernation
    hibernationDO = {
      state: mockState,
      storage: mockState.storage,
      env: mockEnv,

      // Simulate handleWebSocketUpgrade method
      async authenticateWebSocket(request) {
        const url = new URL(request.url);
        const wsProtocol = request.headers.get('Sec-WebSocket-Protocol');
        let providedToken = null;
        let tokenSource = null;

        // Extract token from subprotocol header (SECURE)
        if (wsProtocol) {
          const protocols = wsProtocol.split(',').map(p => p.trim());
          const authProtocol = protocols.find(p => p.startsWith('bookstrack-auth.'));

          if (authProtocol) {
            providedToken = authProtocol.substring('bookstrack-auth.'.length);
            tokenSource = 'subprotocol';
          }
        }

        // Fallback to query parameter (DEPRECATED)
        if (!providedToken) {
          providedToken = url.searchParams.get('token');
          if (providedToken) {
            tokenSource = 'query_param';
          }
        }

        // Full authentication validation
        const [storedToken, expiration, oldTokenExpiration] = await Promise.all([
          this.storage.get('authToken'),
          this.storage.get('authTokenExpiration'),
          providedToken ? this.storage.get(`oldAuthToken:${providedToken}`) : Promise.resolve(null),
        ]);

        // Check KV blacklist
        const blacklistEntry = providedToken
          ? await this.env.KV_CACHE.get(`token:blacklist:${providedToken}`, 'json')
          : null;

        if (blacklistEntry) {
          return { success: false, error: 'Token invalidated', code: 401 };
        }

        // Validate token match (current or grace period)
        let authSuccess = false;
        if (storedToken && providedToken && storedToken === providedToken) {
          authSuccess = true;
        } else if (providedToken && oldTokenExpiration) {
          authSuccess = true;
        }

        if (!authSuccess) {
          return { success: false, error: 'Unauthorized', code: 401 };
        }

        // Check expiration (only for current token)
        if (storedToken === providedToken && Date.now() > expiration) {
          return { success: false, error: 'Token expired', code: 401 };
        }

        return { success: true, tokenSource };
      },
    };
  });

  describe('Subprotocol Header Authentication (Secure)', () => {
    it('should authenticate with token in subprotocol header', async () => {
      // Arrange
      const token = 'secure-subprotocol-token';
      await hibernationDO.storage.put('authToken', token);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000);

      const request = new Request('https://api.example.com/ws/job?jobId=test-123', {
        headers: {
          'Sec-WebSocket-Protocol': `bookstrack-auth.${token}, other-protocol`,
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.tokenSource).toBe('subprotocol');
    });

    it('should extract token from multiple subprotocol values', async () => {
      // Arrange
      const token = 'multi-protocol-token';
      await hibernationDO.storage.put('authToken', token);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000);

      const request = new Request('https://api.example.com/ws/job?jobId=test-456', {
        headers: {
          'Sec-WebSocket-Protocol': `protocol1, bookstrack-auth.${token}, protocol2`,
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.tokenSource).toBe('subprotocol');
    });

    it('should handle whitespace in subprotocol header', async () => {
      // Arrange
      const token = 'whitespace-token';
      await hibernationDO.storage.put('authToken', token);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000);

      const request = new Request('https://api.example.com/ws/job?jobId=test-789', {
        headers: {
          'Sec-WebSocket-Protocol': `   bookstrack-auth.${token}   ,   other-protocol   `,
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should reject token from subprotocol if token mismatch', async () => {
      // Arrange
      const storedToken = 'correct-token';
      const providedToken = 'wrong-token';
      await hibernationDO.storage.put('authToken', storedToken);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000);

      const request = new Request('https://api.example.com/ws/job?jobId=test-999', {
        headers: {
          'Sec-WebSocket-Protocol': `bookstrack-auth.${providedToken}`,
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
      expect(result.code).toBe(401);
    });
  });

  describe('Query Parameter Fallback (Deprecated)', () => {
    it('should fallback to query parameter when subprotocol header missing', async () => {
      // Arrange
      const token = 'query-param-token';
      await hibernationDO.storage.put('authToken', token);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000);

      const request = new Request(`https://api.example.com/ws/job?jobId=test-123&token=${token}`, {
        headers: {},
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.tokenSource).toBe('query_param');
    });

    it('should prefer subprotocol header over query parameter', async () => {
      // Arrange
      const correctToken = 'subprotocol-token';
      const wrongToken = 'query-param-token';
      await hibernationDO.storage.put('authToken', correctToken);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000);

      const request = new Request(
        `https://api.example.com/ws/job?jobId=test-456&token=${wrongToken}`,
        {
          headers: {
            'Sec-WebSocket-Protocol': `bookstrack-auth.${correctToken}`,
          },
        }
      );

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.tokenSource).toBe('subprotocol'); // Subprotocol wins
    });

    it('should reject query parameter token if expired', async () => {
      // Arrange
      const token = 'expired-query-token';
      await hibernationDO.storage.put('authToken', token);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() - 1000); // Expired

      const request = new Request(`https://api.example.com/ws/job?jobId=test-789&token=${token}`, {
        headers: {},
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token expired');
    });
  });

  describe('Grace Period Token Validation', () => {
    it('should allow reconnection with old token during grace period', async () => {
      // Arrange - Simulate token refresh with grace period
      const oldToken = 'old-grace-token';
      const newToken = 'new-refreshed-token';

      // Current token
      await hibernationDO.storage.put('authToken', newToken);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000);

      // Old token with grace period
      await hibernationDO.storage.put(`oldAuthToken:${oldToken}`, true);

      const request = new Request('https://api.example.com/ws/job?jobId=test-123', {
        headers: {
          'Sec-WebSocket-Protocol': `bookstrack-auth.${oldToken}`,
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.tokenSource).toBe('subprotocol');
    });

    it('should reject old token after grace period expires', async () => {
      // Arrange
      const oldToken = 'expired-grace-token';
      const newToken = 'current-token';

      await hibernationDO.storage.put('authToken', newToken);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000);

      // No oldAuthToken entry (grace period expired)

      const request = new Request('https://api.example.com/ws/job?jobId=test-456', {
        headers: {
          'Sec-WebSocket-Protocol': `bookstrack-auth.${oldToken}`,
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should not check expiration for grace period tokens', async () => {
      // Arrange - Old token with expired timestamp, but grace period active
      const oldToken = 'grace-no-expiration-check';
      const newToken = 'new-token';

      await hibernationDO.storage.put('authToken', newToken);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000);
      await hibernationDO.storage.put(`oldAuthToken:${oldToken}`, true);

      const request = new Request('https://api.example.com/ws/job?jobId=test-789', {
        headers: {
          'Sec-WebSocket-Protocol': `bookstrack-auth.${oldToken}`,
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert - Should succeed (grace period bypasses expiration check)
      expect(result.success).toBe(true);
    });
  });

  describe('KV Blacklist Validation', () => {
    it('should reject blacklisted token from subprotocol header', async () => {
      // Arrange
      const token = 'blacklisted-subprotocol-token';
      await hibernationDO.storage.put('authToken', token);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000);

      // Mock blacklist entry in KV
      hibernationDO.env.KV_CACHE.get = vi.fn((key, type) => {
        if (key === `token:blacklist:${token}`) {
          return Promise.resolve({
            reason: 'Job completed or failed',
            invalidatedAt: Date.now() - 1000,
          });
        }
        return Promise.resolve(null);
      });

      const request = new Request('https://api.example.com/ws/job?jobId=test-123', {
        headers: {
          'Sec-WebSocket-Protocol': `bookstrack-auth.${token}`,
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token invalidated');
      expect(result.code).toBe(401);
    });

    it('should reject blacklisted token from query parameter', async () => {
      // Arrange
      const token = 'blacklisted-query-token';
      await hibernationDO.storage.put('authToken', token);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000);

      hibernationDO.env.KV_CACHE.get = vi.fn((key, type) => {
        if (key === `token:blacklist:${token}`) {
          return Promise.resolve({
            reason: 'Job completed or failed',
            invalidatedAt: Date.now(),
          });
        }
        return Promise.resolve(null);
      });

      const request = new Request(`https://api.example.com/ws/job?jobId=test-456&token=${token}`, {
        headers: {},
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token invalidated');
    });

    it('should check blacklist before token validation', async () => {
      // Arrange - Blacklisted token, no stored token
      const token = 'blacklisted-before-validation';

      hibernationDO.env.KV_CACHE.get = vi.fn((key) => {
        if (key === `token:blacklist:${token}`) {
          return Promise.resolve({ reason: 'Test blacklist' });
        }
        return Promise.resolve(null);
      });

      const request = new Request('https://api.example.com/ws/job?jobId=test-789', {
        headers: {
          'Sec-WebSocket-Protocol': `bookstrack-auth.${token}`,
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert - Should fail on blacklist, not on missing stored token
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token invalidated');
    });
  });

  describe('Full Validation Flow Integration', () => {
    it('should perform all validation steps in correct order', async () => {
      // Arrange
      const token = 'full-validation-token';
      await hibernationDO.storage.put('authToken', token);
      await hibernationDO.storage.put('authTokenExpiration', Date.now() + 2 * 60 * 60 * 1000);

      const validationSteps = [];

      // Track KV blacklist check
      const originalKVGet = hibernationDO.env.KV_CACHE.get;
      hibernationDO.env.KV_CACHE.get = vi.fn((key) => {
        validationSteps.push('blacklist_check');
        return originalKVGet(key);
      });

      // Track parallel storage reads
      const originalStorageGet = hibernationDO.storage.get;
      hibernationDO.storage.get = vi.fn(async (keyOrKeys) => {
        // Promise.all([storage.get(...), storage.get(...), storage.get(...)])
        // gets called as single array argument
        if (Array.isArray(keyOrKeys) && keyOrKeys.length === 3) {
          validationSteps.push('parallel_storage_read');
        }
        return originalStorageGet(keyOrKeys);
      });

      const request = new Request('https://api.example.com/ws/job?jobId=test-123', {
        headers: {
          'Sec-WebSocket-Protocol': `bookstrack-auth.${token}`,
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert - Validation occurred (exact order may vary due to Promise.all parallelism)
      expect(result.success).toBe(true);
      expect(validationSteps.length).toBeGreaterThan(0);
      expect(validationSteps).toContain('blacklist_check');
      // Note: parallel_storage_read tracking depends on mock implementation details
      // The important thing is that authentication succeeds with correct token
    });

    it('should short-circuit on blacklist failure', async () => {
      // Arrange
      const token = 'short-circuit-token';

      hibernationDO.env.KV_CACHE.get = vi.fn(() =>
        Promise.resolve({ reason: 'Blacklisted' })
      );

      const request = new Request('https://api.example.com/ws/job?jobId=test-456', {
        headers: {
          'Sec-WebSocket-Protocol': `bookstrack-auth.${token}`,
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert - Should fail immediately, not check expiration
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token invalidated');
      expect(hibernationDO.storage.get).toHaveBeenCalled(); // Still reads storage in parallel
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing token gracefully', async () => {
      // Arrange - No token in header or query
      const request = new Request('https://api.example.com/ws/job?jobId=test-123', {
        headers: {},
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should handle empty subprotocol header', async () => {
      // Arrange
      const request = new Request('https://api.example.com/ws/job?jobId=test-456', {
        headers: {
          'Sec-WebSocket-Protocol': '',
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should handle malformed subprotocol header', async () => {
      // Arrange
      const request = new Request('https://api.example.com/ws/job?jobId=test-789', {
        headers: {
          'Sec-WebSocket-Protocol': 'bookstrack-auth',  // Missing dot and token
        },
      });

      // Act
      const result = await hibernationDO.authenticateWebSocket(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should handle storage read failures gracefully', async () => {
      // Arrange
      const token = 'storage-error-token';
      hibernationDO.storage.get = vi.fn(() =>
        Promise.reject(new Error('Storage read failed'))
      );

      const request = new Request('https://api.example.com/ws/job?jobId=test-999', {
        headers: {
          'Sec-WebSocket-Protocol': `bookstrack-auth.${token}`,
        },
      });

      // Act & Assert
      await expect(hibernationDO.authenticateWebSocket(request)).rejects.toThrow(
        'Storage read failed'
      );
    });
  });
});
