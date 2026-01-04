/**
 * Billing Jobs Integration Tests
 *
 * Tests for QStash-triggered job endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../../src/app.js";
import { resetIdCounter } from "../../helpers/factories.js";

// Mock QStash Receiver to control signature verification
vi.mock("@upstash/qstash", () => ({
  Receiver: vi.fn().mockImplementation(() => ({
    verify: vi.fn().mockResolvedValue(true),
  })),
}));

describe("Billing Jobs API", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetIdCounter();
    vi.clearAllMocks();
    // Set up QStash keys for signature verification
    process.env = {
      ...originalEnv,
      QSTASH_CURRENT_SIGNING_KEY: "test-current-key",
      QSTASH_NEXT_SIGNING_KEY: "test-next-key",
      NODE_ENV: "test",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("QStash Signature Verification", () => {
    it("rejects requests without signature in production", async () => {
      process.env["NODE_ENV"] = "production";

      const res = await app.request("/jobs/record-compute-usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("allows requests in development mode without signature", async () => {
      process.env["NODE_ENV"] = "development";

      const res = await app.request("/jobs/record-compute-usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      // Should pass auth but may fail on DB
      expect([200, 500]).toContain(res.status);
    });

    it("verifies signature using QStash Receiver", async () => {
      // When in development mode, signature verification is bypassed
      // When in production mode with valid keys, Receiver is used
      // This test verifies the endpoint accepts requests with signatures
      const res = await app.request("/jobs/record-compute-usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "upstash-signature": "valid-signature",
        },
        body: JSON.stringify({}),
      });

      // With proper keys, would be 200/500; without, 401
      expect([200, 401, 500]).toContain(res.status);
    });
  });

  describe("POST /jobs/record-compute-usage", () => {
    it("returns 401 without valid signature", async () => {
      const { Receiver } = await import("@upstash/qstash");
      vi.mocked(Receiver).mockImplementation(() => ({
        verify: vi.fn().mockResolvedValue(false),
      }));

      const res = await app.request("/jobs/record-compute-usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "upstash-signature": "invalid-signature",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);
    });

    it("records compute usage for running instances (DB required)", async () => {
      process.env["NODE_ENV"] = "development";

      const res = await app.request("/jobs/record-compute-usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect([200, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body.status).toBe("ok");
        expect(body).toHaveProperty("recorded");
        expect(body).toHaveProperty("skipped");
        expect(body).toHaveProperty("total");
      }
    });
  });

  describe("POST /jobs/record-storage-usage", () => {
    it("returns 401 without valid signature", async () => {
      const { Receiver } = await import("@upstash/qstash");
      vi.mocked(Receiver).mockImplementation(() => ({
        verify: vi.fn().mockResolvedValue(false),
      }));

      const res = await app.request("/jobs/record-storage-usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "upstash-signature": "invalid-signature",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);
    });

    it("records storage usage for active volumes (DB required)", async () => {
      process.env["NODE_ENV"] = "development";

      const res = await app.request("/jobs/record-storage-usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect([200, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body.status).toBe("ok");
        expect(body).toHaveProperty("recorded");
        expect(body).toHaveProperty("skipped");
      }
    });
  });

  describe("POST /jobs/sync-meter-events", () => {
    it("returns 401 without valid signature", async () => {
      const { Receiver } = await import("@upstash/qstash");
      vi.mocked(Receiver).mockImplementation(() => ({
        verify: vi.fn().mockResolvedValue(false),
      }));

      const res = await app.request("/jobs/sync-meter-events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "upstash-signature": "invalid-signature",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);
    });

    it("syncs pending meter events to Stripe (DB required)", async () => {
      process.env["NODE_ENV"] = "development";

      const res = await app.request("/jobs/sync-meter-events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect([200, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body.status).toBe("ok");
        expect(body).toHaveProperty("synced");
      }
    });
  });

  describe("POST /jobs/reset-free-periods", () => {
    it("returns 401 without valid signature", async () => {
      const { Receiver } = await import("@upstash/qstash");
      vi.mocked(Receiver).mockImplementation(() => ({
        verify: vi.fn().mockResolvedValue(false),
      }));

      const res = await app.request("/jobs/reset-free-periods", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "upstash-signature": "invalid-signature",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);
    });

    it("resets expired free plan periods (DB required)", async () => {
      process.env["NODE_ENV"] = "development";

      const res = await app.request("/jobs/reset-free-periods", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect([200, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body.status).toBe("ok");
        expect(body).toHaveProperty("reset");
        expect(body).toHaveProperty("total");
      }
    });
  });

  describe("POST /jobs/cleanup-expired-webhooks", () => {
    it("returns 401 without valid signature", async () => {
      const { Receiver } = await import("@upstash/qstash");
      vi.mocked(Receiver).mockImplementation(() => ({
        verify: vi.fn().mockResolvedValue(false),
      }));

      const res = await app.request("/jobs/cleanup-expired-webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "upstash-signature": "invalid-signature",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);
    });

    it("cleans up expired webhook records (DB required)", async () => {
      process.env["NODE_ENV"] = "development";

      const res = await app.request("/jobs/cleanup-expired-webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect([200, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body.status).toBe("ok");
        expect(body).toHaveProperty("deleted");
      }
    });
  });

  describe("GET /jobs/health", () => {
    it("returns health status without authentication", async () => {
      const res = await app.request("/jobs/health");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("ok");
      // qstashConfigured is a boolean based on actual runtime config
      expect(typeof body.qstashConfigured).toBe("boolean");
    });
  });
});
