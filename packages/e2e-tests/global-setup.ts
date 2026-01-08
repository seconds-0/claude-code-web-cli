/**
 * Global Setup for Playwright E2E Tests
 *
 * This file runs before all tests to:
 * 1. Configure Clerk Testing Token (bypasses bot detection + waitlist)
 * 2. Authenticate a test user
 * 3. Save auth state for reuse across all tests
 */

import { chromium, FullConfig } from "@playwright/test";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, "auth/user.json");

export default async function globalSetup(config: FullConfig) {
  // Get base URL from config or environment
  const baseURL =
    process.env.STAGING_WEB_URL || config.projects[0]?.use?.baseURL || "http://localhost:3000";

  // Check if Clerk keys are available
  const hasClerkKeys = process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY;

  // Check if we have credentials for auth
  const username = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;

  if (!hasClerkKeys) {
    console.log("⚠️  CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY not set.");
    console.log("   Skipping Clerk testing setup. Auth-related tests may fail.");
    return;
  }

  // Step 1: Configure Clerk Testing Token
  // This obtains a Testing Token from Clerk that bypasses bot detection + waitlist
  await clerkSetup();

  if (!username || !password) {
    console.log("⚠️  E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD not set.");
    console.log("   Skipping auth state setup. Tests requiring auth will be skipped.");
    return;
  }

  // Step 3: Authenticate and save state
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the app (loads Clerk)
    await page.goto(baseURL);
    await page.waitForLoadState("networkidle");

    // Programmatic sign-in - no manual browser interaction!
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: username,
        password: password,
      },
    });

    // Wait for auth to propagate
    await page.waitForTimeout(2000);

    // Save auth state for all tests to reuse
    await context.storageState({ path: authFile });

    console.log("✓ Auth state saved to:", authFile);
  } catch (error) {
    console.error("❌ Failed to authenticate:", error);
    // Don't throw - allow tests to run, auth-requiring tests will skip
  } finally {
    await browser.close();
  }
}
