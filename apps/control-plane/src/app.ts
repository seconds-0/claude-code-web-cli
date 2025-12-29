import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { healthRoute } from "./routes/health.js";

// Create the main app
export const app = new Hono();

// Global middleware
app.use("*", logger());
app.use("*", requestId());
app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "https://*.vercel.app"],
    credentials: true,
  })
);

// Mount routes
app.route("/api/v1/health", healthRoute);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "not_found", message: "Route not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: "internal_error",
      message: process.env["NODE_ENV"] === "development" ? err.message : "Internal server error",
      requestId: c.get("requestId"),
    },
    500
  );
});
