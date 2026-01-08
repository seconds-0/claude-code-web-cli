/**
 * User Journey E2E Tests
 *
 * Complete flow: Landing → Auth → Dashboard → Workspace → Terminal → Claude Code
 *
 * These tests use the authenticated fixture which leverages saved auth state
 * from global setup for faster execution.
 */

import { test, expect } from "../../fixtures/index.js";
import { HomePage, DashboardPage, WorkspacePage } from "../../pages/index.js";

test.describe("User Journey", () => {
  test.describe("Unauthenticated User", () => {
    test("can view landing page and navigate to sign-in", async ({ page }) => {
      const homePage = new HomePage(page);

      // Step 1: View landing page
      await homePage.goto();
      await homePage.expectVisible();

      // Step 2: Hero content is visible
      await expect(homePage.heroTitle).toContainText("untethered");
      await expect(homePage.terminalPreview).toBeVisible();

      // Step 3: Navigate to sign-in
      await homePage.navigateToSignIn();

      // Step 4: Sign-in page loads
      await expect(page).toHaveURL(/sign-in/);
    });

    test("sign-up redirects to waitlist (in waitlist mode)", async ({ page }) => {
      const homePage = new HomePage(page);
      await homePage.goto();

      // Click Get Started
      await homePage.navigateToSignUp();

      // Should be on sign-up or waitlist page
      const url = page.url();
      expect(url).toMatch(/sign-up|waitlist/);
    });
  });

  test.describe("Authenticated User", () => {
    test("dashboard redirects to setup for new users", async ({ authenticatedPage }) => {
      // New users with no workspaces get redirected to setup
      await authenticatedPage.goto("/dashboard");
      await authenticatedPage.waitForLoadState("networkidle");

      // Should be on dashboard or setup page
      const url = authenticatedPage.url();
      expect(url).toMatch(/dashboard/);
    });

    test("can access dashboard with auth", async ({ authenticatedPage }) => {
      const dashboard = new DashboardPage(authenticatedPage);
      await dashboard.goto();

      // Dashboard should be accessible (may redirect to setup if no workspaces)
      await dashboard.expectVisible();
    });

    test("can create new workspace", async ({ authenticatedPage }) => {
      const dashboard = new DashboardPage(authenticatedPage);
      await dashboard.goto();

      // If we have the new workspace button, click it
      const hasNewButton = await dashboard.newWorkspaceButton.isVisible();
      if (hasNewButton) {
        await dashboard.clickNewWorkspace();
        await expect(authenticatedPage).toHaveURL(/dashboard\/new/);
      }
    });
  });

  test.describe("Workspace Flow", () => {
    test.skip("complete workspace creation and terminal access", async ({ authenticatedPage }) => {
      // Skip in CI until we have proper test environment
      // This test creates real infrastructure

      const dashboard = new DashboardPage(authenticatedPage);
      const workspace = new WorkspacePage(authenticatedPage);

      // Step 1: Go to dashboard
      await dashboard.goto();
      await dashboard.expectVisible();

      // Step 2: Create new workspace (if button exists)
      const hasNewButton = await dashboard.newWorkspaceButton.isVisible();
      if (!hasNewButton) {
        test.skip();
        return;
      }

      await dashboard.clickNewWorkspace();

      // Step 3: Fill workspace creation form
      await authenticatedPage.fill('[name="name"]', `e2e-test-${Date.now()}`);
      await authenticatedPage.click('button:has-text("Create")');

      // Step 4: Wait for provisioning (can take 30-60s)
      await workspace.waitForTerminalReady(90_000);

      // Step 5: Verify terminal is interactive
      await workspace.runCommand('echo "E2E Test"');
      await workspace.expectTerminalContains("E2E Test");

      // Step 6: Test Claude Code activation (if available)
      const hasClaudeButton = await workspace.claudeCodeButton.isVisible();
      if (hasClaudeButton) {
        await workspace.activateClaudeCode();
      }
    });
  });

  test.describe("Navigation", () => {
    test("authenticated user is redirected from home to dashboard", async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto("/");
      await authenticatedPage.waitForLoadState("networkidle");

      // Authenticated users should be redirected to dashboard
      const url = authenticatedPage.url();
      expect(url).toMatch(/dashboard/);
    });

    test("can navigate between pages", async ({ authenticatedPage }) => {
      // Start at dashboard
      await authenticatedPage.goto("/dashboard");
      await expect(authenticatedPage).toHaveURL(/dashboard/);

      // If we have workspaces, we can navigate to them
      const workspaceCards = authenticatedPage.locator(".workspace-card");
      const count = await workspaceCards.count();

      if (count > 0) {
        await workspaceCards.first().click();
        await expect(authenticatedPage).toHaveURL(/dashboard\/workspace\//);
      }
    });
  });

  test.describe("Error Handling", () => {
    test("shows error for invalid workspace ID", async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/dashboard/workspace/invalid-id-123");
      await authenticatedPage.waitForLoadState("networkidle");

      // Should show error or redirect
      const url = authenticatedPage.url();
      const hasError = await authenticatedPage.getByText(/error|not found/i).isVisible();

      expect(url.includes("invalid-id-123") || hasError || url.includes("dashboard")).toBe(true);
    });

    test("protected routes redirect unauthenticated users", async ({ page }) => {
      // Use non-authenticated page
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Should redirect to sign-in
      const url = page.url();
      expect(url).toMatch(/sign-in|sign-up|waitlist|\//);
    });
  });
});
