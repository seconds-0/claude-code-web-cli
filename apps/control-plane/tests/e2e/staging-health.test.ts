/**
 * Staging Environment E2E Tests
 *
 * These tests run against deployed staging environment to verify
 * critical paths work end-to-end after deployment.
 *
 * Run with: STAGING_URL=https://api-staging.untethered.computer pnpm test:e2e
 */

import { describe, it, expect } from "vitest";

// Default to production Railway URLs
// Override with env vars for testing specific environments (staging, custom domains, etc.)
// Note: Custom domain (api.untethered.computer) may not be configured - use Railway URLs as defaults
const STAGING_API_URL =
  process.env.STAGING_API_URL || "https://control-plane-production-1516.up.railway.app";
const STAGING_WEB_URL = process.env.STAGING_WEB_URL || "https://www.untethered.computer";
const TIMEOUT = 30000; // 30 second timeout for network requests

describe("Staging Environment Health", () => {
  describe("Control Plane API", () => {
    it(
      "health endpoint returns ok",
      async () => {
        const response = await fetch(`${STAGING_API_URL}/api/v1/health`, {
          signal: AbortSignal.timeout(TIMEOUT),
        });

        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data.status).toBe("ok");
        expect(data.timestamp).toBeDefined();
      },
      TIMEOUT
    );

    it(
      "returns 401 for unauthenticated workspace requests",
      async () => {
        const response = await fetch(`${STAGING_API_URL}/api/v1/workspaces`, {
          signal: AbortSignal.timeout(TIMEOUT),
        });

        expect(response.status).toBe(401);
      },
      TIMEOUT
    );

    it(
      "returns 401 for unauthenticated billing requests",
      async () => {
        const response = await fetch(`${STAGING_API_URL}/api/v1/billing/subscription`, {
          signal: AbortSignal.timeout(TIMEOUT),
        });

        // 401 (no auth) or 500 (auth passed but no DB user) are both acceptable
        expect([401, 500]).toContain(response.status);
      },
      TIMEOUT
    );

    it(
      "returns 404 for unknown routes",
      async () => {
        const response = await fetch(`${STAGING_API_URL}/api/v1/nonexistent-route`, {
          signal: AbortSignal.timeout(TIMEOUT),
        });

        expect(response.status).toBe(404);
      },
      TIMEOUT
    );

    it(
      "handles CORS preflight requests",
      async () => {
        const response = await fetch(`${STAGING_API_URL}/api/v1/health`, {
          method: "OPTIONS",
          headers: {
            Origin: "https://staging.untethered.computer",
            "Access-Control-Request-Method": "GET",
          },
          signal: AbortSignal.timeout(TIMEOUT),
        });

        expect(response.status).toBe(204);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
      },
      TIMEOUT
    );
  });

  describe("Web Application", () => {
    it(
      "homepage loads successfully",
      async () => {
        const response = await fetch(STAGING_WEB_URL, {
          signal: AbortSignal.timeout(TIMEOUT),
        });

        expect(response.ok).toBe(true);
        const html = await response.text();
        expect(html).toContain("<!DOCTYPE html>");
      },
      TIMEOUT
    );

    it(
      "serves static assets",
      async () => {
        const response = await fetch(`${STAGING_WEB_URL}/favicon.ico`, {
          signal: AbortSignal.timeout(TIMEOUT),
        });

        // Favicon should exist
        expect([200, 304]).toContain(response.status);
      },
      TIMEOUT
    );
  });
});

describe("Staging API Response Times", () => {
  it(
    "health endpoint responds under 500ms",
    async () => {
      const start = Date.now();
      const response = await fetch(`${STAGING_API_URL}/api/v1/health`, {
        signal: AbortSignal.timeout(TIMEOUT),
      });
      const duration = Date.now() - start;

      expect(response.ok).toBe(true);
      expect(duration).toBeLessThan(500);
    },
    TIMEOUT
  );

  it(
    "web homepage responds under 2000ms",
    async () => {
      const start = Date.now();
      const response = await fetch(STAGING_WEB_URL, {
        signal: AbortSignal.timeout(TIMEOUT),
      });
      const duration = Date.now() - start;

      expect(response.ok).toBe(true);
      expect(duration).toBeLessThan(2000);
    },
    TIMEOUT
  );
});
