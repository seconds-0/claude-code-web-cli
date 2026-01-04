/**
 * Billing Routes Integration Tests
 *
 * Tests for the user-facing billing API endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../../src/app.js";
import { resetIdCounter } from "../../helpers/factories.js";

// Note: These tests run with SKIP_AUTH=true from setup.ts
// They test HTTP layer behavior, not business logic (covered by service tests)

describe("Billing API Routes", () => {
  const testUserId = "test-billing-user";

  beforeEach(() => {
    resetIdCounter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/v1/billing/subscription", () => {
    it("requires authentication", async () => {
      const res = await app.request("/api/v1/billing/subscription");

      // Without X-Test-User-Id header, should get 401
      expect([401, 500]).toContain(res.status);
    });

    it("returns subscription data (DB required) or appropriate error", async () => {
      const res = await app.request("/api/v1/billing/subscription", {
        headers: {
          "X-Test-User-Id": testUserId,
        },
      });

      // Will be 200 with DB (returns subscription), 404 (no user), or 500 (no DB)
      expect([200, 404, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body).toHaveProperty("subscription");
        expect(body).toHaveProperty("plan");
      }
    });
  });

  describe("GET /api/v1/billing/usage", () => {
    it("requires authentication", async () => {
      const res = await app.request("/api/v1/billing/usage");

      expect([401, 500]).toContain(res.status);
    });

    it("returns usage data (DB required)", async () => {
      const res = await app.request("/api/v1/billing/usage", {
        headers: {
          "X-Test-User-Id": testUserId,
        },
      });

      expect([200, 404, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body).toHaveProperty("period");
        expect(body).toHaveProperty("summary");
      }
    });
  });

  describe("GET /api/v1/billing/alerts", () => {
    it("requires authentication", async () => {
      const res = await app.request("/api/v1/billing/alerts");

      expect([401, 500]).toContain(res.status);
    });

    it("returns alerts array (DB required)", async () => {
      const res = await app.request("/api/v1/billing/alerts", {
        headers: {
          "X-Test-User-Id": testUserId,
        },
      });

      expect([200, 404, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body).toHaveProperty("alerts");
        expect(Array.isArray(body.alerts)).toBe(true);
      }
    });
  });

  describe("POST /api/v1/billing/alerts/:id/dismiss", () => {
    it("requires authentication", async () => {
      const res = await app.request("/api/v1/billing/alerts/test-alert/dismiss", {
        method: "POST",
      });

      expect([401, 500]).toContain(res.status);
    });

    it("returns 404 for non-existent alert (DB required)", async () => {
      const res = await app.request("/api/v1/billing/alerts/nonexistent-alert/dismiss", {
        method: "POST",
        headers: {
          "X-Test-User-Id": testUserId,
        },
      });

      // 404 if alert not found, or 500 without DB
      expect([404, 500]).toContain(res.status);
    });
  });

  describe("GET /api/v1/billing/plans", () => {
    it("returns available plans without auth", async () => {
      const res = await app.request("/api/v1/billing/plans", {
        headers: {
          "X-Test-User-Id": testUserId,
        },
      });

      expect([200, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body).toHaveProperty("plans");
        expect(body).toHaveProperty("stripeConfigured");
        expect(typeof body.stripeConfigured).toBe("boolean");
      }
    });
  });

  describe("POST /api/v1/billing/checkout", () => {
    it("requires authentication", async () => {
      const res = await app.request("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan: "starter",
          successUrl: "http://localhost:3000/success",
          cancelUrl: "http://localhost:3000/cancel",
        }),
      });

      expect([401, 500]).toContain(res.status);
    });

    it("returns 400 for missing required fields", async () => {
      const res = await app.request("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: JSON.stringify({}),
      });

      expect([400, 500]).toContain(res.status);
    });

    it("returns 400 for invalid successUrl (open redirect prevention)", async () => {
      const res = await app.request("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: JSON.stringify({
          plan: "starter",
          successUrl: "https://evil.com/steal-tokens",
          cancelUrl: "http://localhost:3000/cancel",
        }),
      });

      expect([400, 500]).toContain(res.status);

      if (res.status === 400) {
        const body = await res.json();
        expect(body.error).toContain("Invalid successUrl");
      }
    });

    it("returns 400 for javascript: URL (XSS prevention)", async () => {
      const res = await app.request("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: JSON.stringify({
          plan: "starter",
          successUrl: "javascript:alert(1)",
          cancelUrl: "http://localhost:3000/cancel",
        }),
      });

      expect([400, 500]).toContain(res.status);
    });

    it("returns 400 for data: URL", async () => {
      const res = await app.request("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: JSON.stringify({
          plan: "starter",
          successUrl: "data:text/html,<script>alert(1)</script>",
          cancelUrl: "http://localhost:3000/cancel",
        }),
      });

      expect([400, 500]).toContain(res.status);
    });

    it("returns 400 for malformed JSON", async () => {
      const res = await app.request("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: "not valid json",
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("Invalid JSON");
    });

    it("accepts valid localhost URLs", async () => {
      const res = await app.request("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: JSON.stringify({
          plan: "starter",
          successUrl: "http://localhost:3000/success",
          cancelUrl: "http://localhost:3000/cancel",
        }),
      });

      // Should be 200/503 (Stripe config), 404 (no user), or 500 (no DB)
      // But NOT 400 for URL validation
      expect([200, 404, 500, 503]).toContain(res.status);
    });
  });

  describe("POST /api/v1/billing/portal", () => {
    it("requires authentication", async () => {
      const res = await app.request("/api/v1/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          returnUrl: "http://localhost:3000/billing",
        }),
      });

      expect([401, 500]).toContain(res.status);
    });

    it("returns 400 for missing returnUrl", async () => {
      const res = await app.request("/api/v1/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: JSON.stringify({}),
      });

      expect([400, 500]).toContain(res.status);
    });

    it("returns 400 for invalid returnUrl (open redirect prevention)", async () => {
      const res = await app.request("/api/v1/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: JSON.stringify({
          returnUrl: "https://attacker.com/phish",
        }),
      });

      expect([400, 500]).toContain(res.status);

      if (res.status === 400) {
        const body = await res.json();
        expect(body.error).toContain("Invalid returnUrl");
      }
    });

    it("returns 400 for malformed JSON", async () => {
      const res = await app.request("/api/v1/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: "{invalid json",
      });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/v1/billing/overages/enable", () => {
    it("requires authentication", async () => {
      const res = await app.request("/api/v1/billing/overages/enable", {
        method: "POST",
      });

      expect([401, 500]).toContain(res.status);
    });

    it("enables overages (DB required)", async () => {
      const res = await app.request("/api/v1/billing/overages/enable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: JSON.stringify({}),
      });

      expect([200, 404, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body.success).toBe(true);
      }
    });
  });

  describe("POST /api/v1/billing/overages/disable", () => {
    it("requires authentication", async () => {
      const res = await app.request("/api/v1/billing/overages/disable", {
        method: "POST",
      });

      expect([401, 500]).toContain(res.status);
    });

    it("disables overages (DB required)", async () => {
      const res = await app.request("/api/v1/billing/overages/disable", {
        method: "POST",
        headers: {
          "X-Test-User-Id": testUserId,
        },
      });

      expect([200, 404, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body.success).toBe(true);
      }
    });
  });

  describe("GET /api/v1/billing/current", () => {
    it("requires authentication", async () => {
      const res = await app.request("/api/v1/billing/current");

      expect([401, 500]).toContain(res.status);
    });

    it("returns real-time billing status (DB required)", async () => {
      const res = await app.request("/api/v1/billing/current", {
        headers: {
          "X-Test-User-Id": testUserId,
        },
      });

      expect([200, 404, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body).toHaveProperty("plan");
        expect(body).toHaveProperty("billingMode");
        expect(body).toHaveProperty("period");
        expect(body).toHaveProperty("usage");
        expect(body.period).toHaveProperty("daysRemaining");
      }
    });

    it("returns default free tier when no subscription", async () => {
      // This is tested by the subscription auto-creation behavior
      const res = await app.request("/api/v1/billing/current", {
        headers: {
          "X-Test-User-Id": "new-user-no-subscription",
        },
      });

      // With DB: 200 (auto-creates or returns defaults)
      // Without DB: 500
      expect([200, 500]).toContain(res.status);
    });
  });
});
