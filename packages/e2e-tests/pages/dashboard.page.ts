/**
 * Dashboard Page Object Model
 *
 * Workspace list and management.
 */

import { Page, Locator, expect } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;

  // Navigation
  readonly newWorkspaceButton: Locator;

  // Workspace list
  readonly workspaceCards: Locator;

  // Stats
  readonly totalWorkspaces: Locator;
  readonly activeWorkspaces: Locator;

  constructor(page: Page) {
    this.page = page;

    // Create new workspace button
    this.newWorkspaceButton = page.getByRole("button", {
      name: /new workspace/i,
    });

    // Workspace cards in the list
    this.workspaceCards = page.locator(".workspace-card");

    // Footer stats
    this.totalWorkspaces = page.getByText(/total:/i);
    this.activeWorkspaces = page.getByText(/active:/i);
  }

  async goto() {
    await this.page.goto("/dashboard");
    await this.page.waitForLoadState("networkidle");
  }

  async expectVisible() {
    // Dashboard should show workspace list or redirect to setup
    const url = this.page.url();
    expect(url).toMatch(/dashboard/);
  }

  async getWorkspaceCount(): Promise<number> {
    return this.workspaceCards.count();
  }

  async clickNewWorkspace() {
    await this.newWorkspaceButton.click();
    await expect(this.page).toHaveURL(/dashboard\/new/);
  }

  async clickWorkspace(index: number) {
    await this.workspaceCards.nth(index).click();
    await expect(this.page).toHaveURL(/dashboard\/workspace\//);
  }

  async clickWorkspaceByName(name: string) {
    const card = this.page.locator(`.workspace-card:has-text("${name}")`);
    await card.click();
    await expect(this.page).toHaveURL(/dashboard\/workspace\//);
  }

  async getWorkspaceNames(): Promise<string[]> {
    const cards = await this.workspaceCards.all();
    const names: string[] = [];
    for (const card of cards) {
      const text = await card.textContent();
      if (text) names.push(text);
    }
    return names;
  }

  async expectWorkspaceExists(name: string) {
    await expect(this.page.locator(`.workspace-card:has-text("${name}")`)).toBeVisible();
  }
}
