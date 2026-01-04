/**
 * Stripe Configuration and Client
 *
 * Centralized Stripe setup for billing, subscriptions, and usage metering.
 */

import Stripe from "stripe";

// Initialize Stripe client
const stripeSecretKey = process.env["STRIPE_SECRET_KEY"];

if (!stripeSecretKey) {
  console.warn("STRIPE_SECRET_KEY not set - billing features disabled");
}

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      typescript: true,
    })
  : null;

/**
 * Plan configuration - maps plan names to limits and features
 */
export interface PlanConfig {
  name: string;
  displayName: string;
  priceMonthly: number; // in cents
  computeMinutesLimit: number | null; // null = unlimited
  storageGbLimit: number | null;
  voiceSecondsLimit: number | null;
  features: string[];
}

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
  free: {
    name: "free",
    displayName: "Free Trial",
    priceMonthly: 0,
    computeMinutesLimit: 300, // 5 hours
    storageGbLimit: 10,
    voiceSecondsLimit: 1800, // 30 minutes
    features: ["1 workspace", "Basic support"],
  },
  starter: {
    name: "starter",
    displayName: "Starter",
    priceMonthly: 900, // $9
    computeMinutesLimit: 1800, // 30 hours
    storageGbLimit: 25,
    voiceSecondsLimit: 1800, // 30 minutes
    features: ["2 workspaces", "Email support", "Community access"],
  },
  pro: {
    name: "pro",
    displayName: "Pro",
    priceMonthly: 1900, // $19
    computeMinutesLimit: 6000, // 100 hours
    storageGbLimit: 50,
    voiceSecondsLimit: 7200, // 120 minutes
    features: ["5 workspaces", "Priority support", "Voice commands"],
  },
  unlimited: {
    name: "unlimited",
    displayName: "Unlimited",
    priceMonthly: 3900, // $39
    computeMinutesLimit: null, // 24/7 always-on
    storageGbLimit: 100,
    voiceSecondsLimit: 30000, // 500 minutes
    features: ["Unlimited workspaces", "24/7 always-on VM", "Dedicated support"],
  },
  usage_based: {
    name: "usage_based",
    displayName: "Usage Based",
    priceMonthly: 0, // Pay-as-you-go
    computeMinutesLimit: null,
    storageGbLimit: null,
    voiceSecondsLimit: null,
    features: ["Pay only for what you use", "No monthly commitment"],
  },
};

/**
 * Overage rates (in cents per unit)
 */
export const OVERAGE_RATES = {
  computeMinute: 1.5, // $0.015/min = $0.90/hour
  storageGbHour: 0.0139, // $0.000139/GB-hour ≈ $0.10/GB-month
  voiceSecond: 0.0167, // $0.01/min = $0.000167/sec
};

/**
 * Usage-based rates (for usage_based plan)
 */
export const USAGE_BASED_RATES = {
  computeMinute: 1.2, // $0.012/min = $0.72/hour
  storageGbMonth: 8, // $0.08/GB-month
  voiceSecond: 0.025, // $0.015/min = $0.00025/sec
};

/**
 * Stripe Product IDs (set after setup script runs)
 * These should be set via environment variables
 */
export const STRIPE_PRODUCTS = {
  starter: process.env["STRIPE_PRODUCT_STARTER"],
  pro: process.env["STRIPE_PRODUCT_PRO"],
  unlimited: process.env["STRIPE_PRODUCT_UNLIMITED"],
  usageBased: process.env["STRIPE_PRODUCT_USAGE_BASED"],
};

/**
 * Stripe Price IDs (set after setup script runs)
 */
export const STRIPE_PRICES = {
  starter: process.env["STRIPE_PRICE_STARTER"],
  pro: process.env["STRIPE_PRICE_PRO"],
  unlimited: process.env["STRIPE_PRICE_UNLIMITED"],
};

/**
 * Stripe Billing Meter IDs (set after setup script runs)
 */
export const STRIPE_METERS = {
  computeMinute: process.env["STRIPE_METER_COMPUTE"],
  storageGbHour: process.env["STRIPE_METER_STORAGE"],
  voiceSecond: process.env["STRIPE_METER_VOICE"],
};

/**
 * Map Stripe price ID to plan name
 */
export function getPlanFromPriceId(priceId: string): string {
  const priceToplan: Record<string, string> = {};

  if (STRIPE_PRICES.starter) priceToplan[STRIPE_PRICES.starter] = "starter";
  if (STRIPE_PRICES.pro) priceToplan[STRIPE_PRICES.pro] = "pro";
  if (STRIPE_PRICES.unlimited) priceToplan[STRIPE_PRICES.unlimited] = "unlimited";

  return priceToplan[priceId] || "free";
}

/**
 * Get plan configuration by name
 */
export function getPlanConfig(planName: string): PlanConfig {
  return PLAN_CONFIGS[planName] || PLAN_CONFIGS["free"]!;
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return stripe !== null;
}

/**
 * Calculate usage percentage
 */
export function calculateUsagePercentage(used: number, limit: number | null): number {
  if (limit === null) return 0; // Unlimited
  if (limit === 0) return 100;
  return Math.min(100, Math.round((used / limit) * 100));
}
