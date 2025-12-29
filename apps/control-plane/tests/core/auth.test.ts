import { describe, it, expect } from "vitest";
import { app } from "../../src/app.js";

describe("Auth middleware", () => {
  describe("GET /api/v1/me (protected route)", () => {
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
      // Empty Bearer is treated as invalid format
      expect(body.message).toContain("Authorization");
    });

    it("returns 200 when valid Bearer token provided", async () => {
      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer test-token-12345",
        },
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.userId).toBeDefined();
    });
  });
});
