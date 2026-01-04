import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { healthRoute } from "./routes/health.js";
import { meRoute } from "./routes/me.js";
import { workspacesRoute } from "./routes/workspaces.js";
import { usersRoute } from "./routes/users.js";
import { anthropicRoute } from "./routes/anthropic.js";
import { costsRoute } from "./routes/costs.js";
import { stripeWebhooksRoute } from "./routes/stripe-webhooks.js";
import { billingJobsRoute } from "./routes/billing-jobs.js";
import { billingRoute } from "./routes/billing.js";

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
      // Production: ALLOWED_ORIGINS should be set to your custom domain(s)
      // This takes precedence and is the recommended approach for production
      const allowedOrigins = process.env["ALLOWED_ORIGINS"]?.split(",") ?? [];
      if (origin && allowedOrigins.includes(origin)) return origin;
      // Allow Railway preview deployments (*.up.railway.app)
      // Note: This is permissive for development convenience. In production,
      // set ALLOWED_ORIGINS to your specific domain(s) for tighter security.
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
app.route("/api/v1/costs", costsRoute);
app.route("/webhooks/stripe", stripeWebhooksRoute);
app.route("/jobs", billingJobsRoute);
app.route("/api/v1/billing", billingRoute);

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
