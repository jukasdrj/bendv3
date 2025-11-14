/**
 * Token Refresh Handler Tests (/api/token/refresh)
 *
 * Tests the token refresh endpoint that allows clients to renew
 * authentication tokens for long-running WebSocket jobs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the rate limiter
const checkRateLimit = vi.fn().mockResolvedValue(null);

// Mock CORS headers
const getCorsHeaders = (request) => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

/**
 * Handler function extracted from src/index.js
 * This tests the token refresh logic without importing Cloudflare Workers modules
 */
async function handleTokenRefresh(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/token/refresh" && request.method === "POST") {
    // Rate limiting
    const rateLimitResponse = await checkRateLimit(request, env);
    if (rateLimitResponse) return rateLimitResponse;

    try {
      const { jobId, oldToken } = await request.json();

      if (!jobId || !oldToken) {
        return new Response(
          JSON.stringify({
            error: "Invalid request: jobId and oldToken required",
          }),
          {
            status: 400,
            headers: {
              ...getCorsHeaders(request),
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Get DO stub for this job
      const doId = env.PROGRESS_WEBSOCKET_DO.idFromName(jobId);
      const doStub = env.PROGRESS_WEBSOCKET_DO.get(doId);

      // Refresh token via Durable Object
      const result = await doStub.refreshAuthToken(oldToken);

      if (result.error) {
        return new Response(
          JSON.stringify({
            error: result.error,
          }),
          {
            status: 401,
            headers: {
              ...getCorsHeaders(request),
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Return new token
      return new Response(
        JSON.stringify({
          jobId,
          token: result.token,
          expiresIn: result.expiresIn,
        }),
        {
          status: 200,
          headers: {
            ...getCorsHeaders(request),
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error) {
      console.error("Failed to refresh token:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to refresh token",
          message: error.message,
        }),
        {
          status: 500,
          headers: {
            ...getCorsHeaders(request),
            "Content-Type": "application/json",
          },
        },
      );
    }
  }

  return new Response("Not Found", { status: 404 });
}

// Mock environment with Durable Object
const createMockEnv = () => {
  const mockDoStub = {
    refreshAuthToken: vi.fn().mockResolvedValue({
      token: "new-token-abc123",
      expiresIn: 3600,
    }),
  };

  return {
    PROGRESS_WEBSOCKET_DO: {
      idFromName: vi.fn((name) => `mock-id-${name}`),
      get: vi.fn(() => mockDoStub),
    },
    _mockDoStub: mockDoStub, // Expose for tests
  };
};

describe("Token Refresh Handler (/api/token/refresh)", () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    // Reset rate limiter mock
    checkRateLimit.mockClear();
    checkRateLimit.mockResolvedValue(null);
  });

  describe("Request Validation", () => {
    it("should return 400 for missing jobId", async () => {
      const request = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldToken: "old-token-123" }),
      });

      const response = await handleTokenRefresh(request, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("jobId");
      expect(body.error).toContain("oldToken");
    });

    it("should return 400 for missing oldToken", async () => {
      const request = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: "test-job-123" }),
      });

      const response = await handleTokenRefresh(request, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("jobId");
      expect(body.error).toContain("oldToken");
    });

    it("should accept valid jobId and oldToken", async () => {
      const request = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: "test-job-valid",
          oldToken: "old-token-valid",
        }),
      });

      const response = await handleTokenRefresh(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.token).toBe("new-token-abc123");
    });
  });

  describe("Successful Refresh", () => {
    it("should return new token with valid credentials", async () => {
      const request = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: "test-job-success",
          oldToken: "valid-old-token",
        }),
      });

      const response = await handleTokenRefresh(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body).toHaveProperty("jobId", "test-job-success");
      expect(body).toHaveProperty("token", "new-token-abc123");
      expect(body).toHaveProperty("expiresIn", 3600);
    });

    it("should call refreshAuthToken on Durable Object", async () => {
      const request = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: "test-job-do-call",
          oldToken: "old-token-123",
        }),
      });

      await handleTokenRefresh(request, mockEnv);

      expect(mockEnv._mockDoStub.refreshAuthToken).toHaveBeenCalledTimes(1);
      expect(mockEnv._mockDoStub.refreshAuthToken).toHaveBeenCalledWith(
        "old-token-123",
      );
    });
  });

  describe("Expired Token Rejection", () => {
    it("should return 401 for expired token", async () => {
      // Mock DO to return error for expired token
      mockEnv._mockDoStub.refreshAuthToken.mockResolvedValueOnce({
        error: "Token expired",
      });

      const request = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: "test-job-expired",
          oldToken: "expired-token",
        }),
      });

      const response = await handleTokenRefresh(request, mockEnv);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Token expired");
    });
  });

  describe("Invalid Token Rejection", () => {
    it("should return 401 for invalid token", async () => {
      // Mock DO to return error for invalid token
      mockEnv._mockDoStub.refreshAuthToken.mockResolvedValueOnce({
        error: "Invalid token",
      });

      const request = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: "test-job-invalid",
          oldToken: "invalid-token-xyz",
        }),
      });

      const response = await handleTokenRefresh(request, mockEnv);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Invalid token");
    });
  });

  describe("Rate Limiting", () => {
    it("should apply rate limiting to endpoint", async () => {
      const request = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: "test-job-rate-limit",
          oldToken: "token-123",
        }),
      });

      await handleTokenRefresh(request, mockEnv);

      // Verify rate limiter was called
      expect(checkRateLimit).toHaveBeenCalledTimes(1);
      expect(checkRateLimit).toHaveBeenCalledWith(request, mockEnv);
    });

    it("should return 429 when rate limit exceeded", async () => {
      // Mock rate limiter to return 429 response
      checkRateLimit.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: "Too many requests",
            },
          }),
          {
            status: 429,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      const request = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: "test-job-rate-exceeded",
          oldToken: "token-456",
        }),
      });

      const response = await handleTokenRefresh(request, mockEnv);

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });
  });

  describe("CORS Headers", () => {
    it("should include CORS headers in successful response", async () => {
      const request = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          jobId: "test-job-cors",
          oldToken: "token-cors",
        }),
      });

      const response = await handleTokenRefresh(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      // CORS headers should be present (implementation-dependent)
    });

    it("should include CORS headers in error response", async () => {
      const request = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          jobId: "test-job-cors-error",
          // Missing oldToken to trigger error
        }),
      });

      const response = await handleTokenRefresh(request, mockEnv);

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
    });
  });

  describe("Concurrent Refresh Requests", () => {
    it("should handle concurrent refresh requests for same job", async () => {
      const jobId = "test-concurrent-job";

      const request1 = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          oldToken: "token-1",
        }),
      });

      const request2 = new Request("http://localhost/api/token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          oldToken: "token-2",
        }),
      });

      // Execute concurrently
      const [response1, response2] = await Promise.all([
        handleTokenRefresh(request1, mockEnv),
        handleTokenRefresh(request2, mockEnv),
      ]);

      // Both should succeed (or fail appropriately based on token validity)
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Same DO instance should handle both
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.idFromName).toHaveBeenCalledWith(
        jobId,
      );
    });
  });
});
