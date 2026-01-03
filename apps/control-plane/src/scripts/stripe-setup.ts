#!/usr/bin/env tsx
/**
 * Stripe Setup Script
 *
 * Creates Stripe products, prices, and billing meters for the billing system.
 * Run this once to set up your Stripe account:
 *
 *   pnpm tsx apps/control-plane/src/scripts/stripe-setup.ts
 *
 * After running, add the output IDs to your .env file.
 */

import Stripe from "stripe";
import { PLAN_CONFIGS, OVERAGE_RATES } from "../lib/stripe.js";

const stripeSecretKey = process.env["STRIPE_SECRET_KEY"];
if (!stripeSecretKey) {
  console.error("Error: STRIPE_SECRET_KEY environment variable is required");
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey);

interface SetupResult {
  products: Record<string, string>;
  prices: Record<string, string>;
  meters: Record<string, string>;
  overagePrices: Record<string, string>;
}

async function createProducts(): Promise<Record<string, string>> {
  console.log("\n📦 Creating Products...\n");

  const products: Record<string, string> = {};

  // Create subscription products
  for (const [key, config] of Object.entries(PLAN_CONFIGS)) {
    if (key === "free") continue; // Free plan doesn't need a Stripe product

    try {
      const product = await stripe.products.create({
        name: `Claude Code Cloud - ${config.displayName}`,
        description: config.features.join(", "),
        metadata: {
          plan: key,
          computeMinutesLimit: config.computeMinutesLimit?.toString() || "unlimited",
          storageGbLimit: config.storageGbLimit?.toString() || "unlimited",
          voiceSecondsLimit: config.voiceSecondsLimit?.toString() || "unlimited",
        },
      });

      products[key] = product.id;
      console.log(`  ✅ ${config.displayName}: ${product.id}`);
    } catch (error) {
      console.error(`  ❌ Failed to create ${config.displayName}:`, error);
    }
  }

  // Create overage product (for metered usage)
  try {
    const overageProduct = await stripe.products.create({
      name: "Claude Code Cloud - Usage Overages",
      description: "Metered usage beyond plan limits",
      metadata: { type: "overage" },
    });
    products["overage"] = overageProduct.id;
    console.log(`  ✅ Overage Product: ${overageProduct.id}`);
  } catch (error) {
    console.error("  ❌ Failed to create overage product:", error);
  }

  return products;
}

async function createPrices(products: Record<string, string>): Promise<Record<string, string>> {
  console.log("\n💰 Creating Prices...\n");

  const prices: Record<string, string> = {};

  // Create subscription prices
  for (const [key, config] of Object.entries(PLAN_CONFIGS)) {
    if (key === "free" || key === "usage_based" || !products[key]) continue;

    try {
      const price = await stripe.prices.create({
        product: products[key]!,
        unit_amount: config.priceMonthly,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { plan: key },
      });

      prices[key] = price.id;
      console.log(`  ✅ ${config.displayName} ($${config.priceMonthly / 100}/mo): ${price.id}`);
    } catch (error) {
      console.error(`  ❌ Failed to create price for ${config.displayName}:`, error);
    }
  }

  return prices;
}

async function createBillingMeters(): Promise<Record<string, string>> {
  console.log("\n📊 Creating Billing Meters...\n");

  const meters: Record<string, string> = {};

  const meterConfigs = [
    {
      key: "compute_minute",
      displayName: "Compute Minutes",
      eventName: "compute_minute",
    },
    {
      key: "storage_gb_hour",
      displayName: "Storage GB-Hours",
      eventName: "storage_gb_hour",
    },
    {
      key: "voice_second",
      displayName: "Voice Seconds",
      eventName: "voice_second",
    },
  ];

  for (const config of meterConfigs) {
    try {
      const meter = await stripe.billing.meters.create({
        display_name: config.displayName,
        event_name: config.eventName,
        default_aggregation: { formula: "sum" },
        customer_mapping: {
          event_payload_key: "stripe_customer_id",
          type: "by_id",
        },
        value_settings: {
          event_payload_key: "value",
        },
      });

      meters[config.key] = meter.id;
      console.log(`  ✅ ${config.displayName}: ${meter.id}`);
    } catch (error) {
      console.error(`  ❌ Failed to create ${config.displayName} meter:`, error);
    }
  }

  return meters;
}

async function createOveragePrices(
  products: Record<string, string>,
  meters: Record<string, string>
): Promise<Record<string, string>> {
  console.log("\n📈 Creating Overage Prices (Metered)...\n");

  const overagePrices: Record<string, string> = {};
  const overageProductId = products["overage"];

  if (!overageProductId) {
    console.error("  ❌ Overage product not found, skipping overage prices");
    return overagePrices;
  }

  const overageConfigs = [
    {
      key: "compute_minute",
      displayName: "Compute Overage",
      meterId: meters["compute_minute"],
      unitAmountDecimal: OVERAGE_RATES.computeMinute.toString(), // $0.015/min in cents
    },
    {
      key: "storage_gb_hour",
      displayName: "Storage Overage",
      meterId: meters["storage_gb_hour"],
      unitAmountDecimal: OVERAGE_RATES.storageGbHour.toString(), // ~$0.10/GB-month in cents/GB-hour
    },
    {
      key: "voice_second",
      displayName: "Voice Overage",
      meterId: meters["voice_second"],
      unitAmountDecimal: OVERAGE_RATES.voiceSecond.toString(), // $0.01/min in cents/sec
    },
  ];

  for (const config of overageConfigs) {
    if (!config.meterId) {
      console.error(`  ❌ Meter not found for ${config.displayName}, skipping`);
      continue;
    }

    try {
      const price = await stripe.prices.create({
        product: overageProductId,
        billing_scheme: "per_unit",
        unit_amount_decimal: config.unitAmountDecimal,
        currency: "usd",
        recurring: {
          interval: "month",
          meter: config.meterId,
          usage_type: "metered",
        },
        metadata: { type: "overage", resource: config.key },
      });

      overagePrices[config.key] = price.id;
      console.log(`  ✅ ${config.displayName}: ${price.id}`);
    } catch (error) {
      console.error(`  ❌ Failed to create ${config.displayName}:`, error);
    }
  }

  return overagePrices;
}

function printEnvVariables(result: SetupResult): void {
  console.log("\n" + "=".repeat(60));
  console.log("📋 Add these to your .env file:");
  console.log("=".repeat(60) + "\n");

  console.log("# Stripe Products");
  if (result.products["starter"])
    console.log(`STRIPE_PRODUCT_STARTER=${result.products["starter"]}`);
  if (result.products["pro"]) console.log(`STRIPE_PRODUCT_PRO=${result.products["pro"]}`);
  if (result.products["unlimited"])
    console.log(`STRIPE_PRODUCT_UNLIMITED=${result.products["unlimited"]}`);
  if (result.products["usage_based"])
    console.log(`STRIPE_PRODUCT_USAGE_BASED=${result.products["usage_based"]}`);
  if (result.products["overage"])
    console.log(`STRIPE_PRODUCT_OVERAGE=${result.products["overage"]}`);

  console.log("\n# Stripe Prices");
  if (result.prices["starter"]) console.log(`STRIPE_PRICE_STARTER=${result.prices["starter"]}`);
  if (result.prices["pro"]) console.log(`STRIPE_PRICE_PRO=${result.prices["pro"]}`);
  if (result.prices["unlimited"])
    console.log(`STRIPE_PRICE_UNLIMITED=${result.prices["unlimited"]}`);

  console.log("\n# Stripe Billing Meters");
  if (result.meters["compute_minute"])
    console.log(`STRIPE_METER_COMPUTE=${result.meters["compute_minute"]}`);
  if (result.meters["storage_gb_hour"])
    console.log(`STRIPE_METER_STORAGE=${result.meters["storage_gb_hour"]}`);
  if (result.meters["voice_second"])
    console.log(`STRIPE_METER_VOICE=${result.meters["voice_second"]}`);

  console.log("\n# Stripe Overage Prices");
  if (result.overagePrices["compute_minute"])
    console.log(`STRIPE_OVERAGE_PRICE_COMPUTE=${result.overagePrices["compute_minute"]}`);
  if (result.overagePrices["storage_gb_hour"])
    console.log(`STRIPE_OVERAGE_PRICE_STORAGE=${result.overagePrices["storage_gb_hour"]}`);
  if (result.overagePrices["voice_second"])
    console.log(`STRIPE_OVERAGE_PRICE_VOICE=${result.overagePrices["voice_second"]}`);

  console.log("\n" + "=".repeat(60) + "\n");
}

async function main(): Promise<void> {
  console.log("🚀 Setting up Stripe for Claude Code Cloud Billing\n");

  try {
    // Verify Stripe connection
    const account = await stripe.accounts.retrieve();
    console.log(`✅ Connected to Stripe account: ${account.email || account.id}\n`);
  } catch (error) {
    console.error("❌ Failed to connect to Stripe:", error);
    process.exit(1);
  }

  const products = await createProducts();
  const prices = await createPrices(products);
  const meters = await createBillingMeters();
  const overagePrices = await createOveragePrices(products, meters);

  const result: SetupResult = {
    products,
    prices,
    meters,
    overagePrices,
  };

  printEnvVariables(result);

  console.log("✅ Stripe setup complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
