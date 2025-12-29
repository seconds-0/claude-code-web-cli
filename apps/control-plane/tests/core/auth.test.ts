import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { app } from "../../src/app.js";

describe("Auth middleware", () => {
  describe("with SKIP_AUTH=true (test mode)", () => {
    it("allows requests without Authorization header", async () => {
      const res = await app.request("/api/v1/me");
      expect(res.status).toBe(200);
    });

    it("uses X-Test-User-Id header when provided", async () => {
      const res = await app.request("/api/v1/me", {
        headers: {
          "X-Test-User-Id": "custom-test-user",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("custom-test-user");
    });

    it("uses default test-user-id when X-Test-User-Id not provided", async () => {
      const res = await app.request("/api/v1/me");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("test-user-id");
    });
  });

  describe("with SKIP_AUTH=false (production mode)", () => {
    const originalSkipAuth = process.env["SKIP_AUTH"];

    beforeEach(() => {
      process.env["SKIP_AUTH"] = "false";
    });

    afterEach(() => {
      process.env["SKIP_AUTH"] = originalSkipAuth;
    });

    it("returns 401 when no Authorization header", async () => {
      const res = await app.request("/api/v1/me");

      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe("unauthorized");
      expect(body.message).toBe("Missing Authorization header");
    });

    it("returns 401 when Authorization header is not Bearer format", async () => {
      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Basic dXNlcjpwYXNz",
        },
      });

      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe("unauthorized");
      expect(body.message).toBe("Invalid Authorization format");
    });

    it("returns 401 when Bearer token is empty", async () => {
      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer ",
        },
      });

      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe("unauthorized");
      // Could be "Missing token" or "Invalid Authorization format" depending on how empty space is handled
      expect(body.message).toMatch(/Missing token|Invalid Authorization format/);
    });

    it("returns 401 when token is invalid JWT", async () => {
      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer invalid-jwt-token",
        },
      });

      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe("unauthorized");
    });
  });
});
