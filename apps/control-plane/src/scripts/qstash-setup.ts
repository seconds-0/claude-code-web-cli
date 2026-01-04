#!/usr/bin/env tsx
/**
 * QStash Setup Script
 *
 * Creates QStash schedules for billing jobs.
 * Run this once after deploying to set up scheduled jobs:
 *
 *   pnpm tsx apps/control-plane/src/scripts/qstash-setup.ts
 *
 * Requires environment variables:
 *   - QSTASH_TOKEN: Your QStash API token
 *   - API_URL: Your control plane URL (e.g., https://api.yourdomain.com)
 */

import { Client } from "@upstash/qstash";

const qstashToken = process.env["QSTASH_TOKEN"];
const apiUrl = process.env["API_URL"];

if (!qstashToken) {
  console.error("Error: QSTASH_TOKEN environment variable is required");
  process.exit(1);
}

if (!apiUrl) {
  console.error("Error: API_URL environment variable is required");
  process.exit(1);
}

const qstash = new Client({ token: qstashToken });

interface ScheduleConfig {
  scheduleId: string;
  destination: string;
  cron: string;
  description: string;
}

const schedules: ScheduleConfig[] = [
  {
    scheduleId: "compute-usage-tracker",
    destination: `${apiUrl}/jobs/record-compute-usage`,
    cron: "* * * * *", // Every minute
    description: "Records compute minutes for running VMs",
  },
  {
    scheduleId: "storage-usage-tracker",
    destination: `${apiUrl}/jobs/record-storage-usage`,
    cron: "0 * * * *", // Top of every hour
    description: "Records storage GB-hours for volumes",
  },
  {
    scheduleId: "stripe-meter-sync",
    destination: `${apiUrl}/jobs/sync-meter-events`,
    cron: "* * * * *", // Every minute
    description: "Syncs pending usage events to Stripe meters",
  },
  {
    scheduleId: "free-period-reset",
    destination: `${apiUrl}/jobs/reset-free-periods`,
    cron: "0 0 * * *", // Daily at midnight UTC
    description: "Resets billing periods for free plan users",
  },
  {
    scheduleId: "webhook-cleanup",
    destination: `${apiUrl}/jobs/cleanup-expired-webhooks`,
    cron: "0 1 * * *", // Daily at 1 AM UTC
    description: "Cleans up expired webhook idempotency records",
  },
];

async function createSchedule(config: ScheduleConfig): Promise<boolean> {
  try {
    await qstash.schedules.create({
      destination: config.destination,
      cron: config.cron,
      scheduleId: config.scheduleId,
    });
    console.log(`  ✅ ${config.scheduleId}: ${config.cron}`);
    console.log(`     ${config.description}`);
    console.log(`     → ${config.destination}`);
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Check if schedule already exists
    if (message.includes("already exists")) {
      console.log(`  ⏭️  ${config.scheduleId}: Already exists (skipping)`);
      return true;
    }
    console.error(`  ❌ ${config.scheduleId}: ${message}`);
    return false;
  }
}

async function listSchedules(): Promise<void> {
  try {
    const existingSchedules = await qstash.schedules.list();
    console.log("\n📋 Existing QStash Schedules:\n");
    for (const schedule of existingSchedules) {
      console.log(`  - ${schedule.scheduleId || "unnamed"}`);
      console.log(`    Cron: ${schedule.cron}`);
      console.log(`    Destination: ${schedule.destination}`);
      console.log();
    }
  } catch (error) {
    console.error("Failed to list schedules:", error);
  }
}

async function main(): Promise<void> {
  console.log("🚀 Setting up QStash Schedules for Billing Jobs\n");
  console.log(`Target API: ${apiUrl}\n`);

  let success = 0;
  let failed = 0;

  console.log("📅 Creating Schedules:\n");

  for (const schedule of schedules) {
    const result = await createSchedule(schedule);
    if (result) {
      success++;
    } else {
      failed++;
    }
    console.log();
  }

  console.log("\n" + "=".repeat(60));
  console.log(`✅ Created: ${success}  ❌ Failed: ${failed}`);
  console.log("=".repeat(60));

  // List all schedules
  await listSchedules();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
