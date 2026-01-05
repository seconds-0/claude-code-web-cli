/**
 * Billing Jobs Route
 *
 * HTTP endpoints for scheduled billing jobs (called by QStash).
 * These endpoints handle:
 * - Compute usage tracking (every minute for running VMs)
 * - Storage usage tracking (every hour for volumes)
 * - Stripe meter sync (every minute for pending events)
 * - Free plan period reset (daily)
 * - Expired webhook cleanup (daily)
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { eq, and, lt, lte } from "drizzle-orm";
import { Receiver } from "@upstash/qstash";
import {
  workspaceInstances,
  workspaceVolumes,
  workspaces,
  subscriptions,
  processedWebhooks,
} from "@ccc/db/schema";
import { getDb } from "../db.js";
import { createUsageService } from "../services/usage.js";
import { createBillingAlertService } from "../services/billing-alerts.js";
import { createSubscriptionService } from "../services/subscription.js";

const QSTASH_CURRENT_SIGNING_KEY = process.env["QSTASH_CURRENT_SIGNING_KEY"];
const QSTASH_NEXT_SIGNING_KEY = process.env["QSTASH_NEXT_SIGNING_KEY"];
const IS_PRODUCTION = process.env["NODE_ENV"] === "production";

// Warn if QStash configuration is missing in production
// Billing jobs will fail individually when called, but app should still start
if (IS_PRODUCTION && !QSTASH_CURRENT_SIGNING_KEY && !QSTASH_NEXT_SIGNING_KEY) {
  console.warn(
    "WARNING: QStash signing keys not configured in production. " +
      "Billing jobs will reject all requests until QSTASH_CURRENT_SIGNING_KEY or QSTASH_NEXT_SIGNING_KEY is set."
  );
}

// Initialize QStash Receiver for signature verification
const qstashReceiver =
  QSTASH_CURRENT_SIGNING_KEY || QSTASH_NEXT_SIGNING_KEY
    ? new Receiver({
        currentSigningKey: QSTASH_CURRENT_SIGNING_KEY || "",
        nextSigningKey: QSTASH_NEXT_SIGNING_KEY || "",
      })
    : null;

export const billingJobsRoute = new Hono();

/**
 * Verify QStash signature using the official SDK Receiver
 */
async function verifyQStashSignature(c: Context): Promise<boolean> {
  // In development, allow unauthenticated requests
  if (process.env["NODE_ENV"] === "development") {
    return true;
  }

  // If QStash is not configured, reject all requests
  // Note: In production, this should never be reached due to startup validation
  if (!qstashReceiver) {
    console.error(
      "QStash signing keys not configured - rejecting billing job request. " +
        "This should not happen in production."
    );
    return false;
  }

  // Check for QStash signature header
  const signature = c.req.header("upstash-signature");
  if (!signature) {
    return false;
  }

  try {
    // Get raw request body for signature verification
    const body = await c.req.text();

    // Verify the signature using the QStash Receiver
    const isValid = await qstashReceiver.verify({
      signature,
      body,
      clockTolerance: 60, // Allow 60 seconds clock difference
    });

    return isValid;
  } catch (error) {
    console.error("QStash signature verification failed:", error);
    return false;
  }
}

/**
 * POST /jobs/record-compute-usage
 *
 * Records 1 compute minute for each running workspace VM.
 * Should be called every minute by QStash.
 */
billingJobsRoute.post("/record-compute-usage", async (c) => {
  if (!(await verifyQStashSignature(c))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb();
  const usageService = createUsageService(db);
  const alertService = createBillingAlertService(db);

  // Get all running instances with workspace and subscription info
  const runningInstances = await db
    .select({
      instanceId: workspaceInstances.id,
      workspaceId: workspaceInstances.workspaceId,
      userId: workspaces.userId,
      periodStart: subscriptions.currentPeriodStart,
      periodEnd: subscriptions.currentPeriodEnd,
      computeLimit: subscriptions.computeMinutesLimit,
    })
    .from(workspaceInstances)
    .innerJoin(workspaces, eq(workspaceInstances.workspaceId, workspaces.id))
    .innerJoin(subscriptions, eq(workspaces.userId, subscriptions.userId))
    .where(eq(workspaceInstances.status, "running"));

  let recorded = 0;
  let skipped = 0;

  for (const instance of runningInstances) {
    if (!instance.periodStart || !instance.periodEnd) {
      skipped++;
      continue;
    }

    const wasRecorded = await usageService.recordComputeMinute({
      userId: instance.userId,
      workspaceId: instance.workspaceId,
      billingPeriodStart: instance.periodStart,
      billingPeriodEnd: instance.periodEnd,
    });

    if (wasRecorded) {
      recorded++;

      // Check if we should create usage alerts
      const limitCheck = await usageService.checkLimitExceeded(
        instance.userId,
        instance.periodStart,
        instance.periodEnd
      );

      if (limitCheck.computePercent >= 50) {
        await alertService.checkUsageThresholds({
          userId: instance.userId,
          resourceType: "compute",
          usedPercent: limitCheck.computePercent,
          billingPeriodStart: instance.periodStart,
        });
      }
    } else {
      skipped++; // Duplicate (idempotency key collision)
    }
  }

  return c.json({
    status: "ok",
    recorded,
    skipped,
    total: runningInstances.length,
  });
});

/**
 * POST /jobs/record-storage-usage
 *
 * Records storage GB-hours for each workspace volume.
 * Should be called every hour by QStash.
 */
billingJobsRoute.post("/record-storage-usage", async (c) => {
  if (!(await verifyQStashSignature(c))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb();
  const usageService = createUsageService(db);
  const alertService = createBillingAlertService(db);

  // Get all active volumes with workspace and subscription info
  const activeVolumes = await db
    .select({
      volumeId: workspaceVolumes.id,
      workspaceId: workspaceVolumes.workspaceId,
      sizeGb: workspaceVolumes.sizeGb,
      userId: workspaces.userId,
      periodStart: subscriptions.currentPeriodStart,
      periodEnd: subscriptions.currentPeriodEnd,
    })
    .from(workspaceVolumes)
    .innerJoin(workspaces, eq(workspaceVolumes.workspaceId, workspaces.id))
    .innerJoin(subscriptions, eq(workspaces.userId, subscriptions.userId))
    .where(eq(workspaceVolumes.status, "available"));

  let recorded = 0;
  let skipped = 0;

  for (const volume of activeVolumes) {
    if (!volume.periodStart || !volume.periodEnd) {
      skipped++;
      continue;
    }

    // Skip volumes without valid size (don't default to 50GB as that could overcharge)
    if (!volume.sizeGb || volume.sizeGb <= 0) {
      console.warn(`Volume ${volume.volumeId} has invalid sizeGb: ${volume.sizeGb}, skipping`);
      skipped++;
      continue;
    }

    const wasRecorded = await usageService.recordStorageGbHour({
      userId: volume.userId,
      workspaceId: volume.workspaceId,
      volumeId: volume.volumeId,
      sizeGb: volume.sizeGb,
      billingPeriodStart: volume.periodStart,
      billingPeriodEnd: volume.periodEnd,
    });

    if (wasRecorded) {
      recorded++;

      // Check if we should create usage alerts
      const limitCheck = await usageService.checkLimitExceeded(
        volume.userId,
        volume.periodStart,
        volume.periodEnd
      );

      if (limitCheck.storagePercent >= 50) {
        await alertService.checkUsageThresholds({
          userId: volume.userId,
          resourceType: "storage",
          usedPercent: limitCheck.storagePercent,
          billingPeriodStart: volume.periodStart,
        });
      }
    } else {
      skipped++;
    }
  }

  return c.json({
    status: "ok",
    recorded,
    skipped,
    total: activeVolumes.length,
  });
});

/**
 * POST /jobs/sync-meter-events
 *
 * Syncs pending usage events to Stripe meters.
 * Should be called every minute by QStash.
 */
billingJobsRoute.post("/sync-meter-events", async (c) => {
  if (!(await verifyQStashSignature(c))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb();
  const usageService = createUsageService(db);

  const synced = await usageService.syncToStripeMeter(100);

  return c.json({
    status: "ok",
    synced,
  });
});

/**
 * POST /jobs/reset-free-periods
 *
 * Resets billing periods for free plan users whose period has ended.
 * Should be called daily at midnight by QStash.
 */
billingJobsRoute.post("/reset-free-periods", async (c) => {
  if (!(await verifyQStashSignature(c))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb();
  const subscriptionService = createSubscriptionService(db);

  const now = new Date();

  // Find free plan subscriptions with expired periods
  const expiredFreeSubscriptions = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.plan, "free"), lte(subscriptions.currentPeriodEnd, now)));

  let reset = 0;

  for (const sub of expiredFreeSubscriptions) {
    await subscriptionService.resetPeriod(sub.userId);
    reset++;
  }

  return c.json({
    status: "ok",
    reset,
    total: expiredFreeSubscriptions.length,
  });
});

/**
 * POST /jobs/cleanup-expired-webhooks
 *
 * Removes expired entries from the processed_webhooks table.
 * Should be called daily by QStash.
 */
billingJobsRoute.post("/cleanup-expired-webhooks", async (c) => {
  if (!(await verifyQStashSignature(c))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb();
  const now = new Date();

  const result = await db
    .delete(processedWebhooks)
    .where(lt(processedWebhooks.expiresAt, now))
    .returning({ id: processedWebhooks.id });

  return c.json({
    status: "ok",
    deleted: result.length,
  });
});

/**
 * GET /jobs/health
 *
 * Health check for job endpoints.
 */
billingJobsRoute.get("/health", (c) => {
  return c.json({
    status: "ok",
    qstashConfigured: !!(QSTASH_CURRENT_SIGNING_KEY || QSTASH_NEXT_SIGNING_KEY),
  });
});
