/**
 * Smoke Tests - Health Checks
 *
 * Quick tests to verify the app is working.
 * Run these first before longer E2E tests.
 */

import { test, expect } from "@playwright/test";
import { HomePage } from "../../pages/index.js";

const API_URL = process.env.STAGING_API_URL || "https://api.untethered.computer";

test.describe("Smoke Tests", () => {
  test.describe("Web Application", () => {
    test("homepage loads successfully", async ({ page }) => {
      const homePage = new HomePage(page);
      await homePage.goto();
      await homePage.expectVisible();
    });

    test("homepage has navigation buttons", async ({ page }) => {
      const homePage = new HomePage(page);
      await homePage.goto();

      await expect(homePage.signInButton.first()).toBeVisible();
      await expect(homePage.getStartedButton.first()).toBeVisible();
    });

    test("terminal demo is visible", async ({ page }) => {
      const homePage = new HomePage(page);
      await homePage.goto();

      await expect(homePage.terminalPreview).toBeVisible();
    });

    test("sign-in page loads", async ({ page }) => {
      await page.goto("/sign-in");
      await page.waitForLoadState("networkidle");

      // Should have email input (Clerk form)
      await expect(page.locator('[name="emailAddress"], [name="identifier"]')).toBeVisible();
    });
  });

  test.describe("API Health", () => {
    test("health endpoint returns ok", async ({ request }) => {
      const response = await request.get(`${API_URL}/api/v1/health`);

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.status).toBe("ok");
      expect(data.timestamp).toBeDefined();
    });

    test("unauthenticated requests return 401", async ({ request }) => {
      const response = await request.get(`${API_URL}/api/v1/workspaces`);

      expect(response.status()).toBe(401);
    });

    test("unknown routes return 404", async ({ request }) => {
      const response = await request.get(`${API_URL}/api/v1/nonexistent-route`);

      expect(response.status()).toBe(404);
    });
  });

  test.describe("Response Times", () => {
    test("homepage loads under 3s", async ({ page }) => {
      const start = Date.now();
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(3000);
    });

    test("API health responds under 500ms", async ({ request }) => {
      const start = Date.now();
      const response = await request.get(`${API_URL}/api/v1/health`);
      const duration = Date.now() - start;

      expect(response.ok()).toBe(true);
      expect(duration).toBeLessThan(500);
    });
  });
});
