import { describe, it, expect } from "vitest";
import { app } from "../../src/app.js";

describe("GET /api/v1/health", () => {
  it("returns status ok with 200", async () => {
    const res = await app.request("/api/v1/health");

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  it("returns valid ISO timestamp", async () => {
    const res = await app.request("/api/v1/health");
    const body = await res.json();

    // Should be a valid ISO date string
    const date = new Date(body.timestamp);
    expect(date.toISOString()).toBe(body.timestamp);
  });
});

describe("404 handling", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await app.request("/api/v1/unknown-route");

    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("not_found");
  });
});
