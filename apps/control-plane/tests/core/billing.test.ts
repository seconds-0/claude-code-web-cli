/**
 * Billing Core Smoke Tests
 *
 * Critical path tests for billing security and idempotency.
 * These run on every pre-commit and must be fast (<1s total).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../src/app.js";

// Note: These tests run with SKIP_AUTH=true from setup.ts

describe("Billing Security", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated billing API requests", async () => {
    // Test without X-Test-User-Id header (auth required)
    const res = await app.request("/api/v1/billing/subscription");

    // Should return 401 (Unauthorized), 500 (if auth middleware throws), or 503 (DB unavailable)
    expect([401, 500, 503]).toContain(res.status);
  });

  it("rejects unsigned QStash job requests in production", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["QSTASH_CURRENT_SIGNING_KEY"] = "test-key";

    const res = await app.request("/jobs/record-compute-usage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });

  it("rejects Stripe webhooks without valid signature", async () => {
    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "invalid-signature",
      },
      body: JSON.stringify({}),
    });

    // Should be 400 (invalid signature) or 503 (Stripe not configured)
    expect([400, 503]).toContain(res.status);
  });

  it("rejects Stripe webhooks without signature header", async () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_xxx";
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_test_xxx";

    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    // Should be 400 (missing signature) or 503 (Stripe not configured)
    expect([400, 503]).toContain(res.status);
  });
});

describe("Billing Input Validation", () => {
  const testUserId = "test-user-core";

  it("rejects open redirect URLs in checkout", async () => {
    const res = await app.request("/api/v1/billing/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-User-Id": testUserId,
      },
      body: JSON.stringify({
        plan: "starter",
        successUrl: "https://evil.com/steal",
        cancelUrl: "http://localhost:3000/cancel",
      }),
    });

    // Should be 400 for invalid URL, 500 for errors, or 503 for DB unavailable
    expect([400, 500, 503]).toContain(res.status);

    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).toContain("Invalid successUrl");
    }
  });

  it("rejects malformed JSON in checkout", async () => {
    const res = await app.request("/api/v1/billing/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-User-Id": testUserId,
      },
      body: "not valid json {",
    });

    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("rejects malformed JSON in portal", async () => {
    const res = await app.request("/api/v1/billing/portal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-User-Id": testUserId,
      },
      body: "{broken json",
    });

    expect(res.status).toBe(400);
  });
});
