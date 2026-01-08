/**
 * Workspace Page Object Model
 *
 * Individual workspace with terminal access.
 */

import { Page, Locator, expect } from "@playwright/test";

export class WorkspacePage {
  readonly page: Page;

  // Terminal
  readonly terminalContainer: Locator;
  readonly terminalScreen: Locator;

  // Status indicators
  readonly statusBadge: Locator;
  readonly provisioningIndicator: Locator;

  // Actions
  readonly claudeCodeButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Terminal elements
    this.terminalContainer = page.locator(".terminal-container, [data-testid='terminal']");
    this.terminalScreen = page.locator(".terminal-screen, .xterm");

    // Status
    this.statusBadge = page.locator('[data-testid="status-badge"]');
    this.provisioningIndicator = page.getByText(/provisioning/i);

    // Actions
    this.claudeCodeButton = page.getByRole("button", { name: /claude code/i });
    this.backButton = page.getByRole("link", { name: /back|dashboard/i });
  }

  async goto(workspaceId: string) {
    await this.page.goto(`/dashboard/workspace/${workspaceId}`);
    await this.page.waitForLoadState("networkidle");
  }

  async waitForTerminalReady(timeoutMs: number = 60_000) {
    // Workspace provisioning can take 30-60s
    await expect(this.terminalContainer).toBeVisible({ timeout: timeoutMs });
  }

  async expectProvisioning() {
    await expect(this.provisioningIndicator).toBeVisible();
  }

  async expectTerminalVisible() {
    await expect(this.terminalContainer).toBeVisible();
  }

  async typeInTerminal(text: string) {
    // Click terminal to focus
    await this.terminalContainer.click();
    // Type the command
    await this.page.keyboard.type(text);
  }

  async pressEnter() {
    await this.page.keyboard.press("Enter");
  }

  async runCommand(command: string) {
    await this.typeInTerminal(command);
    await this.pressEnter();
    // Wait a moment for command to execute
    await this.page.waitForTimeout(500);
  }

  async expectTerminalContains(text: string) {
    await expect(this.terminalContainer).toContainText(text);
  }

  async activateClaudeCode() {
    await this.claudeCodeButton.click();
    // Wait for activation confirmation
    await expect(this.page.getByText(/claude code activated|starting/i)).toBeVisible({
      timeout: 10_000,
    });
  }

  async goBackToDashboard() {
    await this.backButton.click();
    await expect(this.page).toHaveURL(/dashboard/);
  }
}
