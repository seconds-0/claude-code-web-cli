import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { healthRoute } from "./routes/health.js";
import { meRoute } from "./routes/me.js";
import { workspacesRoute } from "./routes/workspaces.js";
import { usersRoute } from "./routes/users.js";
import { anthropicRoute } from "./routes/anthropic.js";

// Create the main app
export const app = new Hono();

// Global middleware
app.use("*", logger());
app.use("*", requestId());
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow any localhost port for development
      if (origin && /^http:\/\/localhost:\d+$/.test(origin)) return origin;
      // Allow specific Vercel preview/production URLs
      // In production, set ALLOWED_ORIGINS env var
      const allowedOrigins = process.env["ALLOWED_ORIGINS"]?.split(",") ?? [];
      if (allowedOrigins.includes(origin)) return origin;
      // Allow Vercel preview deployments (validate pattern properly)
      if (origin && /^https:\/\/[\w-]+-[\w-]+\.vercel\.app$/.test(origin)) {
        return origin;
      }
      // Allow Railway deployments (*.up.railway.app)
      if (origin && /^https:\/\/[\w-]+\.up\.railway\.app$/.test(origin)) {
        return origin;
      }
      return null;
    },
    credentials: true,
  })
);

// Mount routes
app.route("/api/v1/health", healthRoute);
app.route("/api/v1/me", meRoute);
app.route("/api/v1/workspaces", workspacesRoute);
app.route("/api/v1/users", usersRoute);
app.route("/api/v1/anthropic", anthropicRoute);

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
