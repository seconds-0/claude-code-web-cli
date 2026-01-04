/**
 * Billing Alerts Service
 *
 * Manages billing-related alerts and notifications.
 */

import { eq, and, desc } from "drizzle-orm";
import { billingAlerts } from "@ccc/db/schema";
import type { Database } from "@ccc/db";

export type AlertType =
  | "usage_50_percent"
  | "usage_80_percent"
  | "usage_100_percent"
  | "payment_failed"
  | "trial_ending"
  | "subscription_canceled"
  | "overage_enabled"
  | "overage_warning";

export interface CreateAlertParams {
  userId: string;
  alertType: AlertType | string;
  resourceType?: "compute" | "storage" | "voice";
  message: string;
  billingPeriodStart: Date;
  metadata?: string;
}

export interface BillingAlert {
  id: string;
  userId: string;
  alertType: string;
  resourceType: string | null;
  message: string;
  metadata: string | null;
  billingPeriodStart: Date;
  emailSent: boolean | null;
  emailSentAt: Date | null;
  inAppDismissed: boolean | null;
  inAppDismissedAt: Date | null;
  createdAt: Date;
}

/**
 * Billing Alerts Service
 */
export class BillingAlertService {
  constructor(private db: Database) {}

  /**
   * Create a new billing alert
   *
   * Uses a unique constraint on (userId, alertType, resourceType, billingPeriodStart)
   * to prevent duplicate alerts for the same issue in the same period.
   */
  async createAlert(params: CreateAlertParams): Promise<BillingAlert | null> {
    try {
      const [alert] = await this.db
        .insert(billingAlerts)
        .values({
          userId: params.userId,
          alertType: params.alertType,
          resourceType: params.resourceType || null,
          message: params.message,
          billingPeriodStart: params.billingPeriodStart,
          metadata: params.metadata || null,
        })
        .onConflictDoNothing()
        .returning();

      return (alert as BillingAlert | undefined) ?? null;
    } catch (error: unknown) {
      // Ignore duplicate key errors (alert already exists)
      if (
        error instanceof Error &&
        (error.message.includes("unique constraint") || error.message.includes("duplicate key"))
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get all active (non-dismissed) alerts for a user
   */
  async getActiveAlerts(userId: string): Promise<BillingAlert[]> {
    const alerts = await this.db
      .select()
      .from(billingAlerts)
      .where(and(eq(billingAlerts.userId, userId), eq(billingAlerts.inAppDismissed, false)))
      .orderBy(desc(billingAlerts.createdAt));

    return alerts as BillingAlert[];
  }

  /**
   * Get all alerts for a user (including dismissed)
   */
  async getAllAlerts(userId: string, limit = 50): Promise<BillingAlert[]> {
    const alerts = await this.db
      .select()
      .from(billingAlerts)
      .where(eq(billingAlerts.userId, userId))
      .orderBy(desc(billingAlerts.createdAt))
      .limit(limit);

    return alerts as BillingAlert[];
  }

  /**
   * Dismiss an alert (in-app only)
   */
  async dismissAlert(alertId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .update(billingAlerts)
      .set({
        inAppDismissed: true,
        inAppDismissedAt: new Date(),
      })
      .where(and(eq(billingAlerts.id, alertId), eq(billingAlerts.userId, userId)))
      .returning({ id: billingAlerts.id });

    return result.length > 0;
  }

  /**
   * Mark alert as email sent
   */
  async markEmailSent(alertId: string): Promise<void> {
    await this.db
      .update(billingAlerts)
      .set({
        emailSent: true,
        emailSentAt: new Date(),
      })
      .where(eq(billingAlerts.id, alertId));
  }

  /**
   * Create usage threshold alerts
   *
   * Call this when usage is updated to check if alerts should be created.
   */
  async checkUsageThresholds(params: {
    userId: string;
    resourceType: "compute" | "storage" | "voice";
    usedPercent: number;
    billingPeriodStart: Date;
  }): Promise<void> {
    const thresholds = [
      { percent: 50, type: "usage_50_percent" as const, message: "50% of your {resource} limit" },
      { percent: 80, type: "usage_80_percent" as const, message: "80% of your {resource} limit" },
      {
        percent: 100,
        type: "usage_100_percent" as const,
        message: "100% of your {resource} limit",
      },
    ];

    const resourceLabels: Record<string, string> = {
      compute: "compute time",
      storage: "storage",
      voice: "voice minutes",
    };

    const resourceLabel = resourceLabels[params.resourceType] || params.resourceType;

    for (const threshold of thresholds) {
      if (params.usedPercent >= threshold.percent) {
        await this.createAlert({
          userId: params.userId,
          alertType: threshold.type,
          resourceType: params.resourceType,
          message: threshold.message.replace("{resource}", resourceLabel),
          billingPeriodStart: params.billingPeriodStart,
          metadata: JSON.stringify({
            usedPercent: params.usedPercent,
            threshold: threshold.percent,
          }),
        });
      }
    }
  }

  /**
   * Get alerts pending email delivery
   */
  async getAlertsForEmail(limit = 100): Promise<BillingAlert[]> {
    const alerts = await this.db
      .select()
      .from(billingAlerts)
      .where(eq(billingAlerts.emailSent, false))
      .orderBy(billingAlerts.createdAt)
      .limit(limit);

    return alerts as BillingAlert[];
  }

  /**
   * Count active alerts for a user
   */
  async countActiveAlerts(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: billingAlerts.id })
      .from(billingAlerts)
      .where(and(eq(billingAlerts.userId, userId), eq(billingAlerts.inAppDismissed, false)));

    return result.length;
  }
}

/**
 * Create a BillingAlertService instance
 */
export function createBillingAlertService(db: Database): BillingAlertService {
  return new BillingAlertService(db);
}
