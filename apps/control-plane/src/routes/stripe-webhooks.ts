/**
 * Stripe Webhook Handler
 *
 * Handles Stripe webhook events with idempotency.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { processedWebhooks } from "@ccc/db/schema";
import { getDb } from "../db.js";
import { stripe, isStripeConfigured } from "../lib/stripe.js";
import { createSubscriptionService } from "../services/subscription.js";
import { createBillingAlertService } from "../services/billing-alerts.js";

const STRIPE_WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"];

// Webhook retention: 30 days
const WEBHOOK_EXPIRY_DAYS = 30;

export const stripeWebhooksRoute = new Hono();

/**
 * Check if a webhook has already been processed (idempotency)
 */
async function isWebhookProcessed(db: ReturnType<typeof getDb>, eventId: string): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(processedWebhooks)
    .where(eq(processedWebhooks.stripeEventId, eventId))
    .limit(1);

  return !!existing;
}

/**
 * Mark a webhook as processed
 */
async function markWebhookProcessed(
  db: ReturnType<typeof getDb>,
  eventId: string,
  eventType: string
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + WEBHOOK_EXPIRY_DAYS);

  await db.insert(processedWebhooks).values({
    stripeEventId: eventId,
    eventType,
    expiresAt,
  });
}

/**
 * POST /webhooks/stripe
 * Main webhook endpoint
 */
stripeWebhooksRoute.post("/", async (c) => {
  if (!isStripeConfigured() || !stripe) {
    return c.json({ error: "Stripe not configured" }, 503);
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook secret not configured" }, 503);
  }

  // Get raw body for signature verification
  const payload = await c.req.text();
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    return c.json({ error: "Missing signature" }, 400);
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return c.json({ error: "Invalid signature" }, 400);
  }

  const db = getDb();

  // Idempotency check
  if (await isWebhookProcessed(db, event.id)) {
    console.log(`Webhook already processed: ${event.id}`);
    return c.json({ received: true, status: "already_processed" });
  }

  const subscriptionService = createSubscriptionService(db);
  const alertService = createBillingAlertService(db);

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        // Cast to raw object to access properties
        // Stripe SDK v20+ renamed properties to camelCase
        const sub = event.data.object as unknown as {
          id: string;
          customer: string;
          status: string;
          items: { data: Array<{ price: { id: string } }> };
          currentPeriodStart: number;
          currentPeriodEnd: number;
          canceledAt: number | null;
        };
        await subscriptionService.syncFromStripe({
          id: sub.id,
          customer: sub.customer,
          status: sub.status,
          items: sub.items,
          current_period_start: sub.currentPeriodStart,
          current_period_end: sub.currentPeriodEnd,
          canceled_at: sub.canceledAt,
        });
        console.log(`Subscription synced: ${sub.id}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await subscriptionService.handleCancellation(subscription.customer as string);
        console.log(`Subscription canceled: ${subscription.id}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;
        const sub = await subscriptionService.getSubscriptionByCustomerId(customerId);

        if (sub) {
          await alertService.createAlert({
            userId: sub.userId,
            alertType: "payment_failed",
            message: `Payment failed for invoice ${invoice.id}. Please update your payment method.`,
            billingPeriodStart: sub.currentPeriodStart,
            metadata: JSON.stringify({
              invoiceId: invoice.id,
              amountDue: invoice.amount_due,
              attemptCount: invoice.attempt_count,
            }),
          });
        }
        console.log(`Payment failed for customer: ${customerId}`);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;
        const sub = await subscriptionService.getSubscriptionByCustomerId(customerId);

        if (sub) {
          // Reset usage period on successful payment
          await subscriptionService.resetPeriod(sub.userId);
          console.log(`Period reset for user: ${sub.userId}`);
        }
        break;
      }

      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        const sub = await subscriptionService.getSubscriptionByCustomerId(customerId);

        if (sub) {
          await alertService.createAlert({
            userId: sub.userId,
            alertType: "trial_ending",
            message: "Your trial ends in 3 days. Add a payment method to continue.",
            billingPeriodStart: sub.currentPeriodStart,
          });
        }
        console.log(`Trial ending for customer: ${customerId}`);
        break;
      }

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }

    // Mark webhook as processed
    await markWebhookProcessed(db, event.id, event.type);

    return c.json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error processing webhook ${event.id}:`, message);
    // Don't mark as processed so it can be retried
    return c.json({ error: "Processing failed" }, 500);
  }
});

/**
 * GET /webhooks/stripe/health
 * Health check for webhook endpoint
 */
stripeWebhooksRoute.get("/health", (c) => {
  return c.json({
    status: "ok",
    stripeConfigured: isStripeConfigured(),
    webhookSecretConfigured: !!STRIPE_WEBHOOK_SECRET,
  });
});
