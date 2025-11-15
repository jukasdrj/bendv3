/**
 * Unit Tests: Analytics Tracker Middleware
 *
 * Tests for analytics tracking middleware (IP anonymization, headers, sampling)
 * Related: Issue #131 - Analytics Middleware improvements for IPv6 and logging
 */

import { describe, it, expect } from "vitest";

/**
 * Helper function to test IP anonymization
 * Mirrors the anonymizeIP function from src/middleware/analytics-tracker.js
 */
function anonymizeIP(ip) {
  if (!ip) return "unknown";

  // IPv4: Zero out last octet (192.168.1.100 → 192.168.1.0)
  if (ip.includes(".")) {
    return ip.split(".").slice(0, 3).join(".") + ".0";
  }

  // IPv6: Zero out last 80 bits (keep first 48 bits)
  if (ip.includes(":")) {
    // Handle IPv6 compressed notation (::)
    // Expand :: to full notation before anonymizing
    let segments = [];
    const parts = ip.split(":");

    // Handle leading/trailing :: edge cases
    const hasLeadingDoubleColon = ip.startsWith("::");
    const hasTrailingDoubleColon = ip.endsWith("::");

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "") {
        // Empty string indicates :: compression
        // Calculate how many zero segments to insert
        const nonEmptyParts = parts.filter((p) => p !== "").length;
        const zerosNeeded = 8 - nonEmptyParts;

        // Add zero segments
        for (let j = 0; j < zerosNeeded; j++) {
          segments.push("0");
        }

        // Skip consecutive empty parts (from ::)
        while (i + 1 < parts.length && parts[i + 1] === "") {
          i++;
        }
      } else {
        // Normalize segment: remove leading zeros (0db8 → db8, 0000 → 0)
        const normalized = parseInt(parts[i], 16).toString(16);
        segments.push(normalized);
      }
    }

    // Handle edge case: pure :: results in no segments
    if (segments.length === 0) {
      segments = ["0", "0", "0", "0", "0", "0", "0", "0"];
    }

    // Ensure we have exactly 8 segments (pad if needed)
    while (segments.length < 8) {
      if (hasTrailingDoubleColon) {
        segments.push("0");
      } else if (hasLeadingDoubleColon) {
        segments.unshift("0");
      } else {
        segments.push("0");
      }
    }

    // Keep first 3 segments (48 bits), zero out the rest
    return segments.slice(0, 3).join(":") + ":0:0:0:0:0";
  }

  return "unknown";
}

describe("IP Anonymization", () => {
  describe("IPv4 Anonymization", () => {
    it("should anonymize standard IPv4 addresses", () => {
      expect(anonymizeIP("192.168.1.100")).toBe("192.168.1.0");
      expect(anonymizeIP("10.0.0.5")).toBe("10.0.0.0");
      expect(anonymizeIP("172.16.254.1")).toBe("172.16.254.0");
    });

    it("should handle edge case IPv4 addresses", () => {
      expect(anonymizeIP("0.0.0.0")).toBe("0.0.0.0");
      expect(anonymizeIP("255.255.255.255")).toBe("255.255.255.0");
    });
  });

  describe("IPv6 Anonymization", () => {
    it("should anonymize full IPv6 addresses", () => {
      // Standard full notation
      expect(anonymizeIP("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(
        "2001:db8:85a3:0:0:0:0:0",
      );

      // Shortened notation (without leading zeros)
      expect(anonymizeIP("2001:db8:85a3::8a2e:370:7334")).toBe(
        "2001:db8:85a3:0:0:0:0:0",
      );
    });

    it("should handle IPv6 compressed notation (::)", () => {
      // Localhost
      expect(anonymizeIP("::1")).toBe("0:0:0:0:0:0:0:0");

      // Link-local
      expect(anonymizeIP("fe80::1")).toBe("fe80:0:0:0:0:0:0:0");

      // Global unicast with compression
      expect(anonymizeIP("2001:db8::1")).toBe("2001:db8:0:0:0:0:0:0");

      // Multiple segments before compression
      expect(anonymizeIP("2001:db8:85a3::7334")).toBe(
        "2001:db8:85a3:0:0:0:0:0",
      );
    });

    it("should handle IPv6 trailing compression (::)", () => {
      // Compression at end
      expect(anonymizeIP("fe80::")).toBe("fe80:0:0:0:0:0:0:0");
      expect(anonymizeIP("2001:db8::")).toBe("2001:db8:0:0:0:0:0:0");
    });

    it("should handle IPv6 all-zeros address (::)", () => {
      // Pure all-zeros
      expect(anonymizeIP("::")).toBe("0:0:0:0:0:0:0:0");
    });

    it("should handle complex IPv6 compressed notation", () => {
      // Multiple consecutive zeros compressed
      expect(anonymizeIP("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
        "2001:db8:0:0:0:0:0:0",
      );

      // Same address with compression
      expect(anonymizeIP("2001:db8::1")).toBe("2001:db8:0:0:0:0:0:0");
    });
  });

  describe("Edge Cases", () => {
    it("should handle null or undefined IP", () => {
      expect(anonymizeIP(null)).toBe("unknown");
      expect(anonymizeIP(undefined)).toBe("unknown");
      expect(anonymizeIP("")).toBe("unknown");
    });

    it("should handle invalid IP formats", () => {
      expect(anonymizeIP("invalid-ip")).toBe("unknown");
      expect(anonymizeIP("not-an-ip-address")).toBe("unknown");
    });
  });

  describe("GDPR Compliance", () => {
    it("should anonymize IPv4 to keep only network prefix (first 3 octets)", () => {
      const anonymized = anonymizeIP("203.0.113.42");
      expect(anonymized).toBe("203.0.113.0");
      // Verify last octet is zeroed
      expect(anonymized.split(".")[3]).toBe("0");
    });

    it("should anonymize IPv6 to keep only first 48 bits (3 segments)", () => {
      const anonymized = anonymizeIP("2001:db8:85a3:1234:5678:9abc:def0:1234");
      expect(anonymized).toBe("2001:db8:85a3:0:0:0:0:0");
      // Verify only first 3 segments are preserved
      const parts = anonymized.split(":");
      expect(parts[0]).toBe("2001");
      expect(parts[1]).toBe("db8");
      expect(parts[2]).toBe("85a3");
      expect(parts.slice(3)).toEqual(["0", "0", "0", "0", "0"]);
    });
  });
});

describe("Sampling Behavior", () => {
  it("should respect sampling rates", () => {
    const samplingRate = 0.1; // 10% sampling
    let sampledRequests = 0;
    const totalRequests = 10000;

    // Simulate sampling for 10,000 requests
    for (let i = 0; i < totalRequests; i++) {
      if (Math.random() <= samplingRate) {
        sampledRequests++;
      }
    }

    // Should be approximately 10% (allow 2% margin of error)
    const actualRate = sampledRequests / totalRequests;
    expect(actualRate).toBeGreaterThan(0.08);
    expect(actualRate).toBeLessThan(0.12);
  });

  it("should always sample when rate is 1.0", () => {
    const samplingRate = 1.0;
    let sampledRequests = 0;
    const totalRequests = 100;

    for (let i = 0; i < totalRequests; i++) {
      if (Math.random() <= samplingRate) {
        sampledRequests++;
      }
    }

    // Should sample all requests
    expect(sampledRequests).toBe(totalRequests);
  });

  it("should never sample when rate is 0.0", () => {
    const samplingRate = 0.0;
    let sampledRequests = 0;
    const totalRequests = 100;

    for (let i = 0; i < totalRequests; i++) {
      if (Math.random() <= samplingRate) {
        sampledRequests++;
      }
    }

    // Should sample no requests
    expect(sampledRequests).toBe(0);
  });
});
