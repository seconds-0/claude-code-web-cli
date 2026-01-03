/**
 * Billing API Routes
 *
 * User-facing endpoints for billing, subscriptions, and usage.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { users } from "@ccc/db/schema";
import { authMiddleware } from "../middleware/auth.js";
import { getDb } from "../db.js";
import { createSubscriptionService } from "../services/subscription.js";
import { createUsageService } from "../services/usage.js";
import { createBillingAlertService } from "../services/billing-alerts.js";
import { PLAN_CONFIGS, isStripeConfigured } from "../lib/stripe.js";

type Variables = {
  userId: string;
};

export const billingRoute = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all routes
billingRoute.use("*", authMiddleware);

// Allowed redirect URL hosts (prevent open redirects)
const ALLOWED_REDIRECT_HOSTS = new Set([
  process.env["WEB_APP_URL"] ? new URL(process.env["WEB_APP_URL"]).host : "localhost:3000",
  "localhost:3000",
  "localhost:3001",
]);

/**
 * Validate a redirect URL to prevent open redirect attacks
 */
function isValidRedirectUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    // Only allow https in production, http in development
    if (process.env["NODE_ENV"] === "production" && url.protocol !== "https:") {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return ALLOWED_REDIRECT_HOSTS.has(url.host);
  } catch {
    return false;
  }
}

/**
 * Safe JSON parsing helper
 */
async function safeJsonParse<T>(c: { req: { json: () => Promise<unknown> } }): Promise<T | null> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return null;
  }
}

/**
 * GET /billing/subscription
 *
 * Get current subscription details
 */
billingRoute.get("/subscription", async (c) => {
  const clerkId = c.get("userId");
  const db = getDb();

  // Get user from Clerk ID
  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const subscriptionService = createSubscriptionService(db);
  const subscription = await subscriptionService.getSubscription(user.id);

  if (!subscription) {
    // Auto-create subscription for new users
    const newSub = await subscriptionService.createSubscription({
      userId: user.id,
      email: user.email,
    });
    const planConfig = PLAN_CONFIGS[newSub.plan] || PLAN_CONFIGS["free"];
    return c.json({
      subscription: newSub,
      plan: planConfig,
    });
  }

  const planConfig = PLAN_CONFIGS[subscription.plan] || PLAN_CONFIGS["free"];

  return c.json({
    subscription,
    plan: planConfig,
  });
});

/**
 * GET /billing/usage
 *
 * Get current period usage summary
 */
billingRoute.get("/usage", async (c) => {
  const clerkId = c.get("userId");
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const subscriptionService = createSubscriptionService(db);
  const usageService = createUsageService(db);

  const subscription = await subscriptionService.getSubscription(user.id);

  if (!subscription) {
    return c.json({ error: "No subscription found" }, 404);
  }

  const summary = await usageService.getUsageSummary(
    user.id,
    subscription.currentPeriodStart,
    subscription.currentPeriodEnd
  );

  const workspaceUsage = await usageService.getUsageByWorkspace(
    user.id,
    subscription.currentPeriodStart,
    subscription.currentPeriodEnd
  );

  return c.json({
    period: {
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd,
    },
    summary,
    byWorkspace: workspaceUsage,
  });
});

/**
 * GET /billing/alerts
 *
 * Get active billing alerts
 */
billingRoute.get("/alerts", async (c) => {
  const clerkId = c.get("userId");
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const alertService = createBillingAlertService(db);
  const alerts = await alertService.getActiveAlerts(user.id);

  return c.json({ alerts });
});

/**
 * POST /billing/alerts/:id/dismiss
 *
 * Dismiss a billing alert
 */
billingRoute.post("/alerts/:id/dismiss", async (c) => {
  const clerkId = c.get("userId");
  const alertId = c.req.param("id");
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const alertService = createBillingAlertService(db);
  const dismissed = await alertService.dismissAlert(alertId, user.id);

  if (!dismissed) {
    return c.json({ error: "Alert not found" }, 404);
  }

  return c.json({ success: true });
});

/**
 * GET /billing/plans
 *
 * Get available plans
 */
billingRoute.get("/plans", async (c) => {
  return c.json({
    plans: Object.values(PLAN_CONFIGS),
    stripeConfigured: isStripeConfigured(),
  });
});

/**
 * POST /billing/checkout
 *
 * Create a Stripe Checkout session for upgrading
 */
billingRoute.post("/checkout", async (c) => {
  const clerkId = c.get("userId");
  const db = getDb();

  const body = await safeJsonParse<{ plan: string; successUrl: string; cancelUrl: string }>(c);

  if (!body) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.plan || !body.successUrl || !body.cancelUrl) {
    return c.json({ error: "Missing required fields: plan, successUrl, cancelUrl" }, 400);
  }

  // Validate redirect URLs to prevent open redirect attacks
  if (!isValidRedirectUrl(body.successUrl)) {
    return c.json({ error: "Invalid successUrl: must be a valid URL on allowed domain" }, 400);
  }
  if (!isValidRedirectUrl(body.cancelUrl)) {
    return c.json({ error: "Invalid cancelUrl: must be a valid URL on allowed domain" }, 400);
  }

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const subscriptionService = createSubscriptionService(db);

  try {
    const checkoutUrl = await subscriptionService.createCheckoutSession({
      userId: user.id,
      plan: body.plan,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
    });

    if (!checkoutUrl) {
      return c.json({ error: "Stripe not configured" }, 503);
    }

    return c.json({ url: checkoutUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /billing/portal
 *
 * Create a Stripe Customer Portal session
 */
billingRoute.post("/portal", async (c) => {
  const clerkId = c.get("userId");
  const db = getDb();

  const body = await safeJsonParse<{ returnUrl: string }>(c);

  if (!body) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.returnUrl) {
    return c.json({ error: "Missing required field: returnUrl" }, 400);
  }

  // Validate redirect URL to prevent open redirect attacks
  if (!isValidRedirectUrl(body.returnUrl)) {
    return c.json({ error: "Invalid returnUrl: must be a valid URL on allowed domain" }, 400);
  }

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const subscriptionService = createSubscriptionService(db);

  try {
    const portalUrl = await subscriptionService.createPortalSession({
      userId: user.id,
      returnUrl: body.returnUrl,
    });

    if (!portalUrl) {
      return c.json({ error: "Stripe not configured" }, 503);
    }

    return c.json({ url: portalUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /billing/overages/enable
 *
 * Enable usage-based overages
 */
billingRoute.post("/overages/enable", async (c) => {
  const clerkId = c.get("userId");
  const db = getDb();

  const body = await c.req
    .json<{ paymentMethodId?: string }>()
    .catch(() => ({ paymentMethodId: undefined }));

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const subscriptionService = createSubscriptionService(db);
  await subscriptionService.enableOverages(user.id, body.paymentMethodId);

  return c.json({ success: true });
});

/**
 * POST /billing/overages/disable
 *
 * Disable usage-based overages
 */
billingRoute.post("/overages/disable", async (c) => {
  const clerkId = c.get("userId");
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const subscriptionService = createSubscriptionService(db);
  await subscriptionService.disableOverages(user.id);

  return c.json({ success: true });
});

/**
 * GET /billing/current
 *
 * Get real-time billing status (for status bar)
 */
billingRoute.get("/current", async (c) => {
  const clerkId = c.get("userId");
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const subscriptionService = createSubscriptionService(db);
  const usageService = createUsageService(db);
  const alertService = createBillingAlertService(db);

  const subscription = await subscriptionService.getSubscription(user.id);

  if (!subscription) {
    // Return default free tier info
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    return c.json({
      plan: "free",
      billingMode: "included",
      period: {
        start: now.toISOString(),
        end: periodEnd.toISOString(),
        daysRemaining: 30,
      },
      usage: {
        compute: { used: 0, limit: 300, unit: "minutes", percentUsed: 0 },
        storage: { used: 0, limit: 10, unit: "GB", percentUsed: 0 },
        voice: { used: 0, limit: 1800, unit: "seconds", percentUsed: 0 },
      },
      activeAlerts: 0,
    });
  }

  const summary = await usageService.getUsageSummary(
    user.id,
    subscription.currentPeriodStart,
    subscription.currentPeriodEnd
  );

  const activeAlerts = await alertService.countActiveAlerts(user.id);

  const now = new Date();
  const daysRemaining = Math.max(
    0,
    Math.ceil((subscription.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  return c.json({
    plan: subscription.plan,
    billingMode: subscription.overagesEnabled ? "usage_based" : "included",
    status: subscription.status,
    period: {
      start: subscription.currentPeriodStart.toISOString(),
      end: subscription.currentPeriodEnd.toISOString(),
      daysRemaining,
    },
    usage: {
      compute: {
        used: summary.computeMinutes,
        limit: summary.computeMinutesLimit,
        unit: "minutes",
        percentUsed: summary.computeMinutesPercent,
      },
      storage: {
        used: Math.round(summary.storageGbHours / 720), // Approximate GB from GB-hours
        limit: summary.storageGbLimit,
        unit: "GB",
        percentUsed: summary.storagePercent,
      },
      voice: {
        used: summary.voiceSeconds,
        limit: summary.voiceSecondsLimit,
        unit: "seconds",
        percentUsed: summary.voiceSecondsPercent,
      },
    },
    activeAlerts,
    overagesEnabled: subscription.overagesEnabled,
  });
});
