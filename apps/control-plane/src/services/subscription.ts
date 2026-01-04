/**
 * Subscription Service
 *
 * Manages user subscriptions, Stripe integration, and plan enforcement.
 */

import { eq } from "drizzle-orm";
import { subscriptions } from "@ccc/db/schema";
import type { Database } from "@ccc/db";
import {
  stripe,
  isStripeConfigured,
  STRIPE_PRICES,
  getPlanFromPriceId,
  getPlanConfig,
  type PlanConfig,
} from "../lib/stripe.js";

export interface Subscription {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  plan: string;
  status: string;
  overagesEnabled: boolean;
  overagesEnabledAt: Date | null;
  computeMinutesLimit: number | null;
  storageGbLimit: number | null;
  voiceSecondsLimit: number | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
  canceledAt: Date | null;
}

export interface CreateSubscriptionParams {
  userId: string;
  email: string;
  plan?: string;
}

export interface UpgradeParams {
  userId: string;
  newPlan: string;
}

/**
 * Subscription Service
 */
export class SubscriptionService {
  constructor(private db: Database) {}

  /**
   * Get subscription for a user
   */
  async getSubscription(userId: string): Promise<Subscription | null> {
    const [sub] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    return (sub as Subscription | undefined) ?? null;
  }

  /**
   * Get subscription by Stripe customer ID
   */
  async getSubscriptionByCustomerId(stripeCustomerId: string): Promise<Subscription | null> {
    const [sub] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
      .limit(1);

    return (sub as Subscription | undefined) ?? null;
  }

  /**
   * Create a new subscription for a user
   *
   * If Stripe is configured, creates a Stripe customer.
   * Otherwise, creates a local-only free subscription.
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<Subscription> {
    const plan = params.plan || "free";
    const planConfig = getPlanConfig(plan);

    // Calculate billing period (monthly from now)
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    let stripeCustomerId: string;

    if (isStripeConfigured() && stripe) {
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: params.email,
        metadata: {
          userId: params.userId,
        },
      });
      stripeCustomerId = customer.id;
    } else {
      // Local-only mode: generate a placeholder ID
      stripeCustomerId = `local_${params.userId}`;
    }

    // Insert subscription record
    const [sub] = await this.db
      .insert(subscriptions)
      .values({
        userId: params.userId,
        stripeCustomerId,
        stripeSubscriptionId: null,
        plan,
        status: "active",
        overagesEnabled: false,
        computeMinutesLimit: planConfig.computeMinutesLimit,
        storageGbLimit: planConfig.storageGbLimit,
        voiceSecondsLimit: planConfig.voiceSecondsLimit,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning();

    return sub as Subscription;
  }

  /**
   * Ensure a user has a subscription (create if not exists)
   */
  async ensureSubscription(userId: string, email: string): Promise<Subscription> {
    const existing = await this.getSubscription(userId);
    if (existing) {
      return existing;
    }

    return this.createSubscription({ userId, email });
  }

  /**
   * Create a Stripe Checkout session for upgrading to a paid plan
   */
  async createCheckoutSession(params: {
    userId: string;
    plan: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string | null> {
    if (!isStripeConfigured() || !stripe) {
      return null;
    }

    const subscription = await this.getSubscription(params.userId);
    if (!subscription) {
      throw new Error("User has no subscription");
    }

    const priceId = STRIPE_PRICES[params.plan as keyof typeof STRIPE_PRICES];
    if (!priceId) {
      throw new Error(`Invalid plan: ${params.plan}`);
    }

    const session = await stripe.checkout.sessions.create({
      customer: subscription.stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        userId: params.userId,
        plan: params.plan,
      },
    });

    return session.url;
  }

  /**
   * Create a Stripe Customer Portal session for managing subscription
   */
  async createPortalSession(params: { userId: string; returnUrl: string }): Promise<string | null> {
    if (!isStripeConfigured() || !stripe) {
      return null;
    }

    const subscription = await this.getSubscription(params.userId);
    if (!subscription) {
      throw new Error("User has no subscription");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: params.returnUrl,
    });

    return session.url;
  }

  /**
   * Sync subscription state from Stripe
   *
   * Called from webhook handlers when subscription changes.
   */
  async syncFromStripe(stripeSubscription: {
    id: string;
    customer: string;
    status: string;
    items: {
      data: Array<{ price: { id: string } }>;
    };
    current_period_start: number;
    current_period_end: number;
    canceled_at: number | null;
  }): Promise<void> {
    const customerId =
      typeof stripeSubscription.customer === "string"
        ? stripeSubscription.customer
        : stripeSubscription.customer;

    const subscription = await this.getSubscriptionByCustomerId(customerId);
    if (!subscription) {
      console.warn(`No subscription found for Stripe customer: ${customerId}`);
      return;
    }

    // Determine plan from price ID
    const priceId = stripeSubscription.items.data[0]?.price.id;
    const plan = priceId ? getPlanFromPriceId(priceId) : subscription.plan;
    const planConfig = getPlanConfig(plan);

    // Map Stripe status to our status
    const statusMap: Record<string, string> = {
      active: "active",
      past_due: "past_due",
      canceled: "canceled",
      incomplete: "incomplete",
      incomplete_expired: "canceled",
      trialing: "trialing",
      unpaid: "past_due",
      paused: "paused",
    };
    const status = statusMap[stripeSubscription.status] || "active";

    await this.db
      .update(subscriptions)
      .set({
        stripeSubscriptionId: stripeSubscription.id,
        plan,
        status,
        computeMinutesLimit: planConfig.computeMinutesLimit,
        storageGbLimit: planConfig.storageGbLimit,
        voiceSecondsLimit: planConfig.voiceSecondsLimit,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        canceledAt: stripeSubscription.canceled_at
          ? new Date(stripeSubscription.canceled_at * 1000)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));
  }

  /**
   * Handle subscription cancellation
   */
  async handleCancellation(stripeCustomerId: string): Promise<void> {
    const subscription = await this.getSubscriptionByCustomerId(stripeCustomerId);
    if (!subscription) {
      console.warn(`No subscription found for Stripe customer: ${stripeCustomerId}`);
      return;
    }

    // Downgrade to free plan
    const freeConfig = getPlanConfig("free");

    await this.db
      .update(subscriptions)
      .set({
        stripeSubscriptionId: null,
        plan: "free",
        status: "active",
        computeMinutesLimit: freeConfig.computeMinutesLimit,
        storageGbLimit: freeConfig.storageGbLimit,
        voiceSecondsLimit: freeConfig.voiceSecondsLimit,
        canceledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));
  }

  /**
   * Enable usage-based overages for a subscription
   */
  async enableOverages(userId: string, paymentMethodId?: string): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({
        overagesEnabled: true,
        overagesEnabledAt: new Date(),
        overagesPaymentMethodId: paymentMethodId,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, userId));
  }

  /**
   * Disable usage-based overages
   */
  async disableOverages(userId: string): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({
        overagesEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, userId));
  }

  /**
   * Reset usage period (called at billing period boundary)
   */
  async resetPeriod(userId: string): Promise<void> {
    const subscription = await this.getSubscription(userId);
    if (!subscription) {
      return;
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await this.db
      .update(subscriptions)
      .set({
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        updatedAt: now,
      })
      .where(eq(subscriptions.userId, userId));
  }

  /**
   * Get plan configuration for a user
   */
  async getUserPlanConfig(userId: string): Promise<PlanConfig | null> {
    const subscription = await this.getSubscription(userId);
    if (!subscription) {
      return null;
    }
    return getPlanConfig(subscription.plan);
  }

  /**
   * Check if user can perform an action based on their plan
   */
  async checkPlanAccess(userId: string, _feature: keyof PlanConfig["features"]): Promise<boolean> {
    const config = await this.getUserPlanConfig(userId);
    if (!config) {
      return false;
    }
    // For now, all features in the features array are allowed
    return true;
  }

  /**
   * Get billing period for a user
   */
  async getBillingPeriod(userId: string): Promise<{ start: Date; end: Date } | null> {
    const subscription = await this.getSubscription(userId);
    if (!subscription) {
      return null;
    }
    return {
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd,
    };
  }
}

/**
 * Create a SubscriptionService instance
 */
export function createSubscriptionService(db: Database): SubscriptionService {
  return new SubscriptionService(db);
}
