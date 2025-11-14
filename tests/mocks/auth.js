/**
 * Authentication Mock Utilities
 *
 * Helpers for testing authentication flows, token management, and RBAC
 * Addresses EM feedback on auth flow coverage
 */

import { vi } from 'vitest'

/**
 * Valid JWT token structure (mock)
 * Use for testing authenticated requests
 */
export const mockValidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

/**
 * Expired JWT token (mock)
 * Use for testing token expiration scenarios
 */
export const mockExpiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjoxMDAwfQ.expired'

/**
 * Malformed token
 * Use for testing invalid token format
 */
export const mockMalformedToken = 'not-a-valid-jwt-token'

/**
 * Mock token payload
 */
export const mockTokenPayload = {
  sub: 'user123',
  email: 'test@example.com',
  role: 'user',
  permissions: ['read:books', 'write:books'],
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 7200 // 2 hours
}

/**
 * Mock admin token payload
 */
export const mockAdminTokenPayload = {
  sub: 'admin456',
  email: 'admin@example.com',
  role: 'admin',
  permissions: ['read:*', 'write:*', 'delete:*'],
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 7200
}

/**
 * Create mock authentication environment
 * Simulates Keycloak/JWT auth setup
 */
export function createMockAuthEnv() {
  return {
    JWT_SECRET: 'test-secret-key-do-not-use-in-production',
    KEYCLOAK_REALM: 'test-realm',
    KEYCLOAK_CLIENT_ID: 'test-client-id',
    KEYCLOAK_ISSUER: 'https://keycloak.test.com/auth/realms/test-realm'
  }
}

/**
 * Mock JWT verification function
 * Simulates token validation
 *
 * @param {string} token - JWT token to verify
 * @param {string} secret - Secret key
 * @returns {Object|null} Decoded payload or null if invalid
 */
export function mockVerifyToken(token, secret) {
  // Valid token
  if (token === mockValidToken) {
    return mockTokenPayload
  }

  // Expired token
  if (token === mockExpiredToken) {
    throw new Error('Token expired')
  }

  // Malformed token
  if (token === mockMalformedToken) {
    throw new Error('Invalid token format')
  }

  // Unknown token
  return null
}

/**
 * Mock token refresh response
 */
export const mockTokenRefreshResponse = {
  access_token: 'new-access-token-uuid',
  refresh_token: 'new-refresh-token-uuid',
  expires_in: 7200, // 2 hours
  token_type: 'Bearer',
  scope: 'openid profile email'
}

/**
 * Mock Keycloak token endpoint response
 */
export const mockKeycloakTokenResponse = {
  access_token: mockValidToken,
  expires_in: 7200,
  refresh_expires_in: 86400,
  refresh_token: 'mock-refresh-token',
  token_type: 'Bearer',
  session_state: 'mock-session-state',
  scope: 'openid profile email'
}

/**
 * Mock Keycloak user info response
 */
export const mockKeycloakUserInfo = {
  sub: 'user123',
  email_verified: true,
  name: 'Test User',
  preferred_username: 'testuser',
  given_name: 'Test',
  family_name: 'User',
  email: 'test@example.com'
}

/**
 * Mock authentication middleware
 * Use for testing protected routes
 */
export function createMockAuthMiddleware() {
  return {
    authenticate: vi.fn(async (request) => {
      const authHeader = request.headers.get('authorization')

      if (!authHeader) {
        return { authenticated: false, error: 'Missing authorization header' }
      }

      const token = authHeader.replace('Bearer ', '')

      try {
        const payload = mockVerifyToken(token, 'test-secret')
        return { authenticated: true, user: payload }
      } catch (error) {
        return { authenticated: false, error: error.message }
      }
    }),

    requireRole: vi.fn((role) => {
      return async (request, user) => {
        if (!user || user.role !== role) {
          return { authorized: false, error: 'Insufficient permissions' }
        }
        return { authorized: true }
      }
    }),

    requirePermission: vi.fn((permission) => {
      return async (request, user) => {
        if (!user || !user.permissions.includes(permission)) {
          return { authorized: false, error: 'Missing required permission' }
        }
        return { authorized: true }
      }
    })
  }
}

/**
 * Create authenticated request with token
 * Convenience wrapper around request builder
 */
export function createAuthenticatedRequest(path, token = mockValidToken, options = {}) {
  return {
    url: `http://localhost:8787${path}`,
    method: options.method || 'GET',
    headers: new Headers({
      authorization: `Bearer ${token}`,
      ...options.headers
    }),
    ...options
  }
}

/**
 * Mock RBAC permissions check
 *
 * @param {Object} user - User object with role/permissions
 * @param {string} requiredPermission - Permission to check
 * @returns {boolean}
 */
export function mockCheckPermission(user, requiredPermission) {
  if (!user || !user.permissions) return false

  // Admin wildcard
  if (user.permissions.includes('*') || user.permissions.includes('admin:*')) {
    return true
  }

  // Exact match
  if (user.permissions.includes(requiredPermission)) {
    return true
  }

  // Wildcard match (e.g., 'read:*' matches 'read:books')
  const [action, resource] = requiredPermission.split(':')
  const wildcardPermission = `${action}:*`
  if (user.permissions.includes(wildcardPermission)) {
    return true
  }

  return false
}

/**
 * Mock rate limit by user
 * Simulates per-user rate limiting
 */
export function createMockUserRateLimiter() {
  const limits = new Map()

  return {
    check: vi.fn(async (userId, limit = 100) => {
      const current = limits.get(userId) || 0

      if (current >= limit) {
        return { allowed: false, remaining: 0, reset: Date.now() + 3600000 }
      }

      limits.set(userId, current + 1)
      return { allowed: true, remaining: limit - current - 1, reset: Date.now() + 3600000 }
    }),

    reset: vi.fn(async (userId) => {
      limits.delete(userId)
    }),

    // Test helper
    __getLimits: () => Object.fromEntries(limits)
  }
}

/**
 * Mock OAuth2 authorization flow
 */
export const mockOAuth2Flow = {
  // Step 1: Authorization URL
  getAuthorizationUrl: vi.fn((clientId, redirectUri, state) => {
    return `https://keycloak.test.com/auth?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&response_type=code`
  }),

  // Step 2: Exchange code for token
  exchangeCodeForToken: vi.fn(async (code, clientId, clientSecret, redirectUri) => {
    if (code === 'valid-auth-code') {
      return mockKeycloakTokenResponse
    }
    throw new Error('Invalid authorization code')
  }),

  // Step 3: Refresh token
  refreshAccessToken: vi.fn(async (refreshToken, clientId, clientSecret) => {
    if (refreshToken === 'mock-refresh-token') {
      return mockTokenRefreshResponse
    }
    throw new Error('Invalid refresh token')
  })
}

/**
 * Mock session store (for cookie-based auth)
 */
export function createMockSessionStore() {
  const sessions = new Map()

  return {
    create: vi.fn(async (userId, data = {}) => {
      const sessionId = `session-${Date.now()}-${Math.random()}`
      sessions.set(sessionId, {
        userId,
        data,
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000 // 24 hours
      })
      return sessionId
    }),

    get: vi.fn(async (sessionId) => {
      const session = sessions.get(sessionId)
      if (!session) return null

      // Check expiration
      if (session.expiresAt < Date.now()) {
        sessions.delete(sessionId)
        return null
      }

      return session
    }),

    update: vi.fn(async (sessionId, data) => {
      const session = sessions.get(sessionId)
      if (!session) return false

      sessions.set(sessionId, { ...session, data: { ...session.data, ...data } })
      return true
    }),

    destroy: vi.fn(async (sessionId) => {
      sessions.delete(sessionId)
    }),

    // Test helper
    __getAllSessions: () => Object.fromEntries(sessions)
  }
}
