/**
 * Usage Tracking Service
 *
 * Records usage events with idempotency and syncs to Stripe meters.
 * Tracks: compute minutes, storage GB-hours, voice seconds.
 */

import { eq, and, gte, lte, sql } from "drizzle-orm";
import { usageEvents, subscriptions } from "@ccc/db/schema";
import type { Database } from "@ccc/db";
import { stripe, STRIPE_METERS, isStripeConfigured } from "../lib/stripe.js";

// Event types
export type UsageEventType = "compute_minute" | "storage_gb_hour" | "voice_second";

export interface RecordUsageParams {
  userId: string;
  workspaceId?: string;
  eventType: UsageEventType;
  quantity: number;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  idempotencyKey: string;
}

export interface UsageSummary {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  computeMinutes: number;
  storageGbHours: number;
  voiceSeconds: number;
  computeMinutesLimit: number | null;
  storageGbLimit: number | null;
  voiceSecondsLimit: number | null;
  computeMinutesPercent: number;
  storagePercent: number;
  voiceSecondsPercent: number;
}

export interface WorkspaceUsage {
  workspaceId: string;
  computeMinutes: number;
  storageGbHours: number;
  voiceSeconds: number;
}

/**
 * Usage Tracking Service
 */
export class UsageService {
  constructor(private db: Database) {}

  /**
   * Record a usage event with idempotency
   *
   * If an event with the same idempotency key already exists, this is a no-op.
   * Returns true if a new event was recorded, false if it was a duplicate.
   */
  async recordUsage(params: RecordUsageParams): Promise<boolean> {
    try {
      await this.db.insert(usageEvents).values({
        userId: params.userId,
        workspaceId: params.workspaceId,
        eventType: params.eventType,
        quantity: params.quantity.toString(),
        billingPeriodStart: params.billingPeriodStart,
        billingPeriodEnd: params.billingPeriodEnd,
        idempotencyKey: params.idempotencyKey,
        stripeSyncStatus: "pending",
      });
      return true;
    } catch (error: unknown) {
      // Check if it's a unique constraint violation (duplicate idempotency key)
      if (
        error instanceof Error &&
        (error.message.includes("unique constraint") || error.message.includes("duplicate key"))
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Record compute usage (1 minute)
   */
  async recordComputeMinute(params: {
    userId: string;
    workspaceId: string;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
    timestamp?: Date;
  }): Promise<boolean> {
    const ts = params.timestamp || new Date();
    // Idempotency key: one event per workspace per minute
    const minuteKey = Math.floor(ts.getTime() / 60000);
    const idempotencyKey = `compute:${params.workspaceId}:${minuteKey}`;

    return this.recordUsage({
      userId: params.userId,
      workspaceId: params.workspaceId,
      eventType: "compute_minute",
      quantity: 1,
      billingPeriodStart: params.billingPeriodStart,
      billingPeriodEnd: params.billingPeriodEnd,
      idempotencyKey,
    });
  }

  /**
   * Record storage usage (GB-hours)
   */
  async recordStorageGbHour(params: {
    userId: string;
    workspaceId: string;
    volumeId: string;
    sizeGb: number;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
    timestamp?: Date;
  }): Promise<boolean> {
    const ts = params.timestamp || new Date();
    // Idempotency key: one event per volume per hour (supports multiple volumes per workspace)
    const hourKey = Math.floor(ts.getTime() / 3600000);
    const idempotencyKey = `storage:${params.volumeId}:${hourKey}`;

    return this.recordUsage({
      userId: params.userId,
      workspaceId: params.workspaceId,
      eventType: "storage_gb_hour",
      quantity: params.sizeGb,
      billingPeriodStart: params.billingPeriodStart,
      billingPeriodEnd: params.billingPeriodEnd,
      idempotencyKey,
    });
  }

  /**
   * Record voice usage (seconds)
   */
  async recordVoiceSeconds(params: {
    userId: string;
    workspaceId?: string;
    seconds: number;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
    sessionId: string; // unique per voice session
  }): Promise<boolean> {
    // Idempotency key: unique per voice session
    const idempotencyKey = `voice:${params.sessionId}`;

    return this.recordUsage({
      userId: params.userId,
      workspaceId: params.workspaceId,
      eventType: "voice_second",
      quantity: params.seconds,
      billingPeriodStart: params.billingPeriodStart,
      billingPeriodEnd: params.billingPeriodEnd,
      idempotencyKey,
    });
  }

  /**
   * Get usage summary for a user in a billing period
   */
  async getUsageSummary(userId: string, periodStart: Date, periodEnd: Date): Promise<UsageSummary> {
    // Get all usage events for this period
    const events = await this.db
      .select({
        eventType: usageEvents.eventType,
        total: sql<string>`SUM(${usageEvents.quantity}::numeric)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          gte(usageEvents.billingPeriodStart, periodStart),
          lte(usageEvents.billingPeriodEnd, periodEnd)
        )
      )
      .groupBy(usageEvents.eventType);

    // Get subscription limits
    const [subscription] = await this.db
      .select({
        computeMinutesLimit: subscriptions.computeMinutesLimit,
        storageGbLimit: subscriptions.storageGbLimit,
        voiceSecondsLimit: subscriptions.voiceSecondsLimit,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    // Parse event totals
    const totals = new Map<string, number>();
    for (const event of events) {
      totals.set(event.eventType, parseFloat(event.total || "0"));
    }

    const computeMinutes = totals.get("compute_minute") || 0;
    const storageGbHours = totals.get("storage_gb_hour") || 0;
    const voiceSeconds = totals.get("voice_second") || 0;

    const computeMinutesLimit = subscription?.computeMinutesLimit ?? null;
    const storageGbLimit = subscription?.storageGbLimit ?? null;
    const voiceSecondsLimit = subscription?.voiceSecondsLimit ?? null;

    // Calculate percentages (0 if unlimited)
    const computeMinutesPercent = computeMinutesLimit
      ? Math.min(100, Math.round((computeMinutes / computeMinutesLimit) * 100))
      : 0;
    const storagePercent = storageGbLimit
      ? Math.min(100, Math.round((storageGbHours / (storageGbLimit * 24 * 30)) * 100))
      : 0; // Approximate: limit is GB, usage is GB-hours
    const voiceSecondsPercent = voiceSecondsLimit
      ? Math.min(100, Math.round((voiceSeconds / voiceSecondsLimit) * 100))
      : 0;

    return {
      userId,
      periodStart,
      periodEnd,
      computeMinutes,
      storageGbHours,
      voiceSeconds,
      computeMinutesLimit,
      storageGbLimit,
      voiceSecondsLimit,
      computeMinutesPercent,
      storagePercent,
      voiceSecondsPercent,
    };
  }

  /**
   * Get usage breakdown by workspace
   */
  async getUsageByWorkspace(
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<WorkspaceUsage[]> {
    const events = await this.db
      .select({
        workspaceId: usageEvents.workspaceId,
        eventType: usageEvents.eventType,
        total: sql<string>`SUM(${usageEvents.quantity}::numeric)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          gte(usageEvents.billingPeriodStart, periodStart),
          lte(usageEvents.billingPeriodEnd, periodEnd)
        )
      )
      .groupBy(usageEvents.workspaceId, usageEvents.eventType);

    // Group by workspace
    const workspaceMap = new Map<string, WorkspaceUsage>();

    for (const event of events) {
      if (!event.workspaceId) continue;

      let workspace = workspaceMap.get(event.workspaceId);
      if (!workspace) {
        workspace = {
          workspaceId: event.workspaceId,
          computeMinutes: 0,
          storageGbHours: 0,
          voiceSeconds: 0,
        };
        workspaceMap.set(event.workspaceId, workspace);
      }

      const value = parseFloat(event.total || "0");
      switch (event.eventType) {
        case "compute_minute":
          workspace.computeMinutes = value;
          break;
        case "storage_gb_hour":
          workspace.storageGbHours = value;
          break;
        case "voice_second":
          workspace.voiceSeconds = value;
          break;
      }
    }

    return Array.from(workspaceMap.values());
  }

  /**
   * Sync pending usage events to Stripe meters
   *
   * Returns the number of events synced.
   */
  async syncToStripeMeter(limit = 100): Promise<number> {
    if (!isStripeConfigured() || !stripe) {
      return 0;
    }

    // Get pending events with retry backoff (max 3 attempts)
    const pendingEvents = await this.db
      .select()
      .from(usageEvents)
      .where(
        and(eq(usageEvents.stripeSyncStatus, "pending"), lte(usageEvents.stripeSyncAttempts, 3))
      )
      .limit(limit);

    if (pendingEvents.length === 0) {
      return 0;
    }

    // Get Stripe customer IDs for all users
    const userIds = [...new Set(pendingEvents.map((e) => e.userId))];
    const userSubscriptions = await this.db
      .select({
        userId: subscriptions.userId,
        stripeCustomerId: subscriptions.stripeCustomerId,
        overagesEnabled: subscriptions.overagesEnabled,
      })
      .from(subscriptions)
      .where(sql`${subscriptions.userId} = ANY(${userIds})`);

    const customerMap = new Map<string, { stripeCustomerId: string; overagesEnabled: boolean }>();
    for (const sub of userSubscriptions) {
      customerMap.set(sub.userId, {
        stripeCustomerId: sub.stripeCustomerId,
        overagesEnabled: sub.overagesEnabled,
      });
    }

    let syncedCount = 0;

    for (const event of pendingEvents) {
      const customer = customerMap.get(event.userId);

      // Skip if no customer or overages not enabled
      if (!customer) {
        await this.db
          .update(usageEvents)
          .set({
            stripeSyncStatus: "not_required",
            stripeSyncedAt: new Date(),
          })
          .where(eq(usageEvents.id, event.id));
        continue;
      }

      // Get the appropriate meter
      const meterMap: Record<string, string | undefined> = {
        compute_minute: STRIPE_METERS.computeMinute,
        storage_gb_hour: STRIPE_METERS.storageGbHour,
        voice_second: STRIPE_METERS.voiceSecond,
      };

      const meterId = meterMap[event.eventType];
      if (!meterId) {
        await this.db
          .update(usageEvents)
          .set({
            stripeSyncStatus: "not_required",
            stripeSyncError: "No meter configured for event type",
            stripeSyncedAt: new Date(),
          })
          .where(eq(usageEvents.id, event.id));
        continue;
      }

      // Only sync if overages are enabled (otherwise usage tracking is just informational)
      if (!customer.overagesEnabled) {
        await this.db
          .update(usageEvents)
          .set({
            stripeSyncStatus: "not_required",
            stripeSyncedAt: new Date(),
          })
          .where(eq(usageEvents.id, event.id));
        continue;
      }

      try {
        // Send meter event to Stripe
        // Note: identifier provides idempotency on Stripe's side
        const meterEvent = await stripe.billing.meterEvents.create({
          event_name: event.eventType,
          payload: {
            stripe_customer_id: customer.stripeCustomerId,
            value: event.quantity.toString(),
          },
          identifier: event.idempotencyKey, // Idempotency on Stripe side
        });

        await this.db
          .update(usageEvents)
          .set({
            stripeSyncStatus: "synced",
            stripeMeterEventId: meterEvent.identifier,
            stripeSyncedAt: new Date(),
          })
          .where(eq(usageEvents.id, event.id));

        syncedCount++;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const attempts = (event.stripeSyncAttempts || 0) + 1;

        await this.db
          .update(usageEvents)
          .set({
            stripeSyncStatus: attempts >= 3 ? "failed" : "pending",
            stripeSyncError: errorMessage,
            stripeSyncAttempts: attempts,
          })
          .where(eq(usageEvents.id, event.id));
      }
    }

    return syncedCount;
  }

  /**
   * Check if user has exceeded their plan limits
   */
  async checkLimitExceeded(
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{
    computeExceeded: boolean;
    storageExceeded: boolean;
    voiceExceeded: boolean;
    computePercent: number;
    storagePercent: number;
    voicePercent: number;
  }> {
    const summary = await this.getUsageSummary(userId, periodStart, periodEnd);

    return {
      computeExceeded:
        summary.computeMinutesLimit !== null &&
        summary.computeMinutes >= summary.computeMinutesLimit,
      storageExceeded:
        summary.storageGbLimit !== null &&
        summary.storageGbHours >= summary.storageGbLimit * 24 * 30, // Approximate month in hours
      voiceExceeded:
        summary.voiceSecondsLimit !== null && summary.voiceSeconds >= summary.voiceSecondsLimit,
      computePercent: summary.computeMinutesPercent,
      storagePercent: summary.storagePercent,
      voicePercent: summary.voiceSecondsPercent,
    };
  }
}

/**
 * Create a UsageService instance
 */
export function createUsageService(db: Database): UsageService {
  return new UsageService(db);
}
