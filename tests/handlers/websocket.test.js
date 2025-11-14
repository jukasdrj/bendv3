/**
 * WebSocket Handler Tests (/ws/progress)
 *
 * Tests the WebSocket endpoint that routes connections to the
 * ProgressWebSocketDO for real-time progress updates.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Durable Object and environment
const createMockEnv = () => {
  // Note: Node.js Response only supports status 200-599,
  // so we mock with 200 and verify DO interaction instead
  const mockDoStub = {
    fetch: vi.fn().mockResolvedValue(
      new Response("WebSocket connection established", {
        status: 200,
        statusText: "OK",
      }),
    ),
  };

  return {
    PROGRESS_WEBSOCKET_DO: {
      idFromName: vi.fn((name) => `mock-id-${name}`),
      get: vi.fn(() => mockDoStub),
    },
    _mockDoStub: mockDoStub, // Expose for tests
  };
};

/**
 * Handler function extracted from src/index.js
 * This tests the routing logic without importing Cloudflare Workers modules
 */
async function handleWebSocketRoute(request, env) {
  const url = new URL(request.url);

  // Route WebSocket connections to the Durable Object
  if (url.pathname === "/ws/progress") {
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return new Response("Missing jobId parameter", { status: 400 });
    }

    // Get Durable Object instance for this specific jobId
    const doId = env.PROGRESS_WEBSOCKET_DO.idFromName(jobId);
    const doStub = env.PROGRESS_WEBSOCKET_DO.get(doId);

    // Forward the request to the Durable Object
    return doStub.fetch(request);
  }

  return new Response("Not Found", { status: 404 });
}

describe("WebSocket Handler (/ws/progress)", () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  describe("JobId Validation", () => {
    it("should return 400 for missing jobId", async () => {
      const request = new Request("http://localhost/ws/progress", {
        headers: {
          Upgrade: "websocket",
        },
      });

      const response = await handleWebSocketRoute(request, mockEnv);

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain("Missing jobId parameter");
    });

    it("should accept valid jobId in query parameter", async () => {
      const jobId = "test-job-123";
      const request = new Request(
        `http://localhost/ws/progress?jobId=${jobId}`,
        {
          headers: {
            Upgrade: "websocket",
          },
        },
      );

      const response = await handleWebSocketRoute(request, mockEnv);

      // Verify request was forwarded to DO (status 200 is from our mock)
      expect(response.status).toBe(200);
      expect(mockEnv._mockDoStub.fetch).toHaveBeenCalled();
    });
  });

  describe("WebSocket Upgrade", () => {
    it("should successfully forward WebSocket upgrade request", async () => {
      const jobId = "test-job-websocket";
      const request = new Request(
        `http://localhost/ws/progress?jobId=${jobId}`,
        {
          headers: {
            Upgrade: "websocket",
            Connection: "Upgrade",
            "Sec-WebSocket-Version": "13",
            "Sec-WebSocket-Key": "test-key",
          },
        },
      );

      const response = await handleWebSocketRoute(request, mockEnv);

      // Verify DO stub handled the upgrade (our mock returns 200)
      expect(response.status).toBe(200);
      expect(mockEnv._mockDoStub.fetch).toHaveBeenCalled();
    });

    it("should forward request to Durable Object stub", async () => {
      const jobId = "test-job-forward";
      const request = new Request(
        `http://localhost/ws/progress?jobId=${jobId}`,
        {
          headers: {
            Upgrade: "websocket",
          },
        },
      );

      await handleWebSocketRoute(request, mockEnv);

      // Verify DO stub fetch was called with the request
      expect(mockEnv._mockDoStub.fetch).toHaveBeenCalledTimes(1);
      expect(mockEnv._mockDoStub.fetch).toHaveBeenCalledWith(request);
    });
  });

  describe("Durable Object Integration", () => {
    it("should create unique Durable Object instance per jobId", async () => {
      const jobId1 = "job-unique-1";
      const jobId2 = "job-unique-2";

      const request1 = new Request(
        `http://localhost/ws/progress?jobId=${jobId1}`,
        {
          headers: { Upgrade: "websocket" },
        },
      );
      const request2 = new Request(
        `http://localhost/ws/progress?jobId=${jobId2}`,
        {
          headers: { Upgrade: "websocket" },
        },
      );

      await handleWebSocketRoute(request1, mockEnv);
      await handleWebSocketRoute(request2, mockEnv);

      // Verify idFromName was called with different jobIds
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.idFromName).toHaveBeenCalledWith(
        jobId1,
      );
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.idFromName).toHaveBeenCalledWith(
        jobId2,
      );
    });

    it("should get Durable Object stub using jobId-derived ID", async () => {
      const jobId = "test-job-do-stub";
      const request = new Request(
        `http://localhost/ws/progress?jobId=${jobId}`,
        {
          headers: { Upgrade: "websocket" },
        },
      );

      await handleWebSocketRoute(request, mockEnv);

      // Verify DO stub was retrieved
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.get).toHaveBeenCalledTimes(1);
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.get).toHaveBeenCalledWith(
        `mock-id-${jobId}`,
      );
    });
  });

  describe("Request Forwarding", () => {
    it("should forward complete request object to DO", async () => {
      const jobId = "test-request-forwarding";
      const request = new Request(
        `http://localhost/ws/progress?jobId=${jobId}`,
        {
          headers: {
            Upgrade: "websocket",
            Connection: "Upgrade",
            Origin: "http://localhost:3000",
          },
        },
      );

      await handleWebSocketRoute(request, mockEnv);

      // Verify the exact request was forwarded
      const forwardedRequest = mockEnv._mockDoStub.fetch.mock.calls[0][0];
      expect(forwardedRequest.url).toBe(request.url);
      expect(forwardedRequest.headers.get("Upgrade")).toBe("websocket");
      expect(forwardedRequest.headers.get("Origin")).toBe(
        "http://localhost:3000",
      );
    });

    it("should preserve query parameters when forwarding", async () => {
      const jobId = "test-preserve-params";
      const request = new Request(
        `http://localhost/ws/progress?jobId=${jobId}&reconnect=true`,
        {
          headers: { Upgrade: "websocket" },
        },
      );

      await handleWebSocketRoute(request, mockEnv);

      const forwardedRequest = mockEnv._mockDoStub.fetch.mock.calls[0][0];
      const url = new URL(forwardedRequest.url);
      expect(url.searchParams.get("jobId")).toBe(jobId);
      expect(url.searchParams.get("reconnect")).toBe("true");
    });
  });

  describe("Error Handling", () => {
    it("should handle Durable Object unavailable error", async () => {
      // Mock DO fetch to throw an error
      mockEnv._mockDoStub.fetch.mockRejectedValueOnce(
        new Error("Durable Object unavailable"),
      );

      const jobId = "test-do-error";
      const request = new Request(
        `http://localhost/ws/progress?jobId=${jobId}`,
        {
          headers: { Upgrade: "websocket" },
        },
      );

      // Should throw or return error response
      // Note: Current implementation doesn't catch DO errors, they propagate
      await expect(handleWebSocketRoute(request, mockEnv)).rejects.toThrow(
        "Durable Object unavailable",
      );
    });
  });

  describe("Concurrent Connections", () => {
    it("should allow multiple connections to same jobId", async () => {
      const jobId = "test-concurrent-same-job";

      const request1 = new Request(
        `http://localhost/ws/progress?jobId=${jobId}`,
        {
          headers: { Upgrade: "websocket" },
        },
      );
      const request2 = new Request(
        `http://localhost/ws/progress?jobId=${jobId}`,
        {
          headers: { Upgrade: "websocket" },
        },
      );

      // Both connections should succeed
      const response1 = await handleWebSocketRoute(request1, mockEnv);
      const response2 = await handleWebSocketRoute(request2, mockEnv);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Same DO instance should be used
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.idFromName).toHaveBeenCalledTimes(2);
      expect(mockEnv._mockDoStub.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
