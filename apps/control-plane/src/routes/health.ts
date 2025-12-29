import { Hono } from "hono";
import type { HealthResponse } from "@ccc/api-contract";

const VERSION = process.env["npm_package_version"] || "0.0.0";

export const healthRoute = new Hono();

healthRoute.get("/", (c) => {
  const response: HealthResponse = {
    status: "ok",
    version: VERSION,
    timestamp: new Date().toISOString(),
  };
  return c.json(response);
});
