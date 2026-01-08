/**
 * Authentication Fixtures
 *
 * Provides pre-authenticated pages for tests, using saved auth state
 * from global setup. This saves 70%+ test time by avoiding re-authentication.
 */

import { test as base, Page, BrowserContext } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, "../auth/user.json");

/**
 * Extended test with authentication fixtures
 */
export const test = base.extend<{
  /**
   * Pre-authenticated page using saved state from global setup.
   * Use this for most tests - it's the fastest option.
   */
  authenticatedPage: Page;

  /**
   * Pre-authenticated browser context.
   * Use when you need multiple pages with same auth.
   */
  authenticatedContext: BrowserContext;

  /**
   * Fresh login page - authenticates during the test.
   * Use when testing the login flow itself or need clean auth state.
   */
  freshAuthPage: Page;
}>({
  // Pre-authenticated page (uses saved state - fast)
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: authFile,
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  // Pre-authenticated context (for multi-page scenarios)
  authenticatedContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: authFile,
    });
    await use(context);
    await context.close();
  },

  // Fresh login (authenticates during test)
  freshAuthPage: async ({ page }, use) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: process.env.E2E_CLERK_USER_USERNAME!,
        password: process.env.E2E_CLERK_USER_PASSWORD!,
      },
    });

    await use(page);
  },
});

export { expect } from "@playwright/test";
