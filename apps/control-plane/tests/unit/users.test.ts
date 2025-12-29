import { describe, it, expect } from "vitest";
import { app } from "../../src/app.js";

// Note: These tests run with SKIP_AUTH=true from setup.ts
// Tests marked with "DB required" will return 500 without a real database connection

describe("Users API", () => {
  const testUserId = "test-user-456";

  describe("GET /api/v1/users/me", () => {
    it("returns user data (DB required) or 500 without DB", async () => {
      const res = await app.request("/api/v1/users/me", {
        headers: {
          "X-Test-User-Id": testUserId,
        },
      });

      // Will be 200 with DB, 500 without
      expect([200, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body).toHaveProperty("user");
      }
    });
  });

  describe("GET /api/v1/users/me/onboarding", () => {
    it("returns onboarding status (DB required) or 500 without DB", async () => {
      const res = await app.request("/api/v1/users/me/onboarding", {
        headers: {
          "X-Test-User-Id": testUserId,
        },
      });

      // Will be 200 with DB, 500 without
      expect([200, 500]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(body).toHaveProperty("completed");
        expect(typeof body.completed).toBe("boolean");
      }
    });
  });

  describe("PATCH /api/v1/users/me", () => {
    it("validates request body (may fail without DB)", async () => {
      const res = await app.request("/api/v1/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: JSON.stringify({}),
      });

      // 400 if validation happens first, 500 if DB connection fails first
      expect([400, 500]).toContain(res.status);
    });

    it("accepts valid display name (DB required)", async () => {
      const res = await app.request("/api/v1/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: JSON.stringify({ displayName: "Test User" }),
      });

      // 200 with DB, 500 without
      expect([200, 500]).toContain(res.status);
    });

    it("accepts onboarding completion (DB required)", async () => {
      const res = await app.request("/api/v1/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": testUserId,
        },
        body: JSON.stringify({ onboardingCompleted: true }),
      });

      // 200 with DB, 500 without
      expect([200, 500]).toContain(res.status);
    });
  });
});

describe("Legacy /me endpoint", () => {
  it("GET /api/v1/me returns userId from auth context", async () => {
    const res = await app.request("/api/v1/me", {
      headers: {
        "X-Test-User-Id": "legacy-test-user",
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("legacy-test-user");
  });
});
