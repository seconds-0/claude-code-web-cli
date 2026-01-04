/**
 * Test Data Factories
 *
 * Creates mock data objects for billing tests.
 */

import type { Subscription } from "../../src/services/subscription.js";
import type { BillingAlert } from "../../src/services/billing-alerts.js";

let idCounter = 1;

function generateId(): string {
  return `test-${idCounter++}`;
}

/**
 * Reset ID counter (call in beforeEach)
 */
export function resetIdCounter(): void {
  idCounter = 1;
}

/**
 * Create a mock subscription
 */
export function createMockSubscription(overrides: Partial<Subscription> = {}): Subscription {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  return {
    id: generateId(),
    userId: `user-${generateId()}`,
    stripeCustomerId: `cus_${generateId()}`,
    stripeSubscriptionId: null,
    plan: "starter",
    status: "active",
    overagesEnabled: false,
    overagesEnabledAt: null,
    computeMinutesLimit: 1800,
    storageGbLimit: 25,
    voiceSecondsLimit: 1800,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    createdAt: now,
    updatedAt: now,
    canceledAt: null,
    ...overrides,
  };
}

/**
 * Create a mock free subscription
 */
export function createMockFreeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return createMockSubscription({
    plan: "free",
    computeMinutesLimit: 300,
    storageGbLimit: 10,
    voiceSecondsLimit: 1800,
    ...overrides,
  });
}

/**
 * Create a mock pro subscription
 */
export function createMockProSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return createMockSubscription({
    plan: "pro",
    computeMinutesLimit: 6000,
    storageGbLimit: 50,
    voiceSecondsLimit: 7200,
    ...overrides,
  });
}

/**
 * Create a mock unlimited subscription
 */
export function createMockUnlimitedSubscription(
  overrides: Partial<Subscription> = {}
): Subscription {
  return createMockSubscription({
    plan: "unlimited",
    computeMinutesLimit: null,
    storageGbLimit: 100,
    voiceSecondsLimit: 30000,
    ...overrides,
  });
}

/**
 * Create a mock billing alert
 */
export function createMockAlert(overrides: Partial<BillingAlert> = {}): BillingAlert {
  const now = new Date();

  return {
    id: generateId(),
    userId: `user-${generateId()}`,
    alertType: "usage_50_percent",
    resourceType: "compute",
    message: "50% of your compute time limit",
    metadata: null,
    billingPeriodStart: now,
    emailSent: false,
    emailSentAt: null,
    inAppDismissed: false,
    inAppDismissedAt: null,
    createdAt: now,
    ...overrides,
  };
}

/**
 * Create a mock usage event
 */
export function createMockUsageEvent(
  overrides: Partial<{
    id: string;
    userId: string;
    workspaceId: string;
    eventType: string;
    quantity: string;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
    idempotencyKey: string;
    stripeSyncStatus: string;
    stripeSyncAttempts: number;
    stripeSyncError: string | null;
    stripeMeterEventId: string | null;
    stripeSyncedAt: Date | null;
    createdAt: Date;
  }> = {}
) {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  return {
    id: generateId(),
    userId: `user-${generateId()}`,
    workspaceId: `ws-${generateId()}`,
    eventType: "compute_minute",
    quantity: "1",
    billingPeriodStart: now,
    billingPeriodEnd: periodEnd,
    idempotencyKey: `compute:ws-1:${Date.now()}`,
    stripeSyncStatus: "pending",
    stripeSyncAttempts: 0,
    stripeSyncError: null,
    stripeMeterEventId: null,
    stripeSyncedAt: null,
    createdAt: now,
    ...overrides,
  };
}

/**
 * Create a mock user
 */
export function createMockUser(
  overrides: Partial<{
    id: string;
    clerkId: string;
    email: string;
    displayName: string;
    createdAt: Date;
    updatedAt: Date;
  }> = {}
) {
  const now = new Date();

  return {
    id: generateId(),
    clerkId: `clerk_${generateId()}`,
    email: `user${idCounter}@example.com`,
    displayName: `Test User ${idCounter}`,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a mock Stripe subscription object (webhook format)
 */
export function createMockStripeSubscription(
  overrides: Partial<{
    id: string;
    customer: string;
    status: string;
    items: { data: Array<{ price: { id: string } }> };
    current_period_start: number;
    current_period_end: number;
    canceled_at: number | null;
  }> = {}
) {
  const now = Math.floor(Date.now() / 1000);
  const periodEnd = now + 30 * 24 * 60 * 60; // 30 days

  return {
    id: `sub_${generateId()}`,
    customer: `cus_${generateId()}`,
    status: "active",
    items: {
      data: [{ price: { id: "price_starter" } }],
    },
    current_period_start: now,
    current_period_end: periodEnd,
    canceled_at: null,
    ...overrides,
  };
}

/**
 * Create a mock Stripe webhook event
 */
export function createMockStripeEvent(
  type: string,
  data: Record<string, unknown>,
  overrides: Partial<{
    id: string;
    created: number;
    livemode: boolean;
  }> = {}
) {
  return {
    id: `evt_${generateId()}`,
    object: "event",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: data,
    },
    livemode: false,
    pending_webhooks: 0,
    type,
    ...overrides,
  };
}
