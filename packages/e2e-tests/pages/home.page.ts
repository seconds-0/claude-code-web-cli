/**
 * Home Page Object Model
 *
 * Landing page with hero section and auth navigation.
 */

import { Page, Locator, expect } from "@playwright/test";

export class HomePage {
  readonly page: Page;

  // Navigation
  readonly signInButton: Locator;
  readonly getStartedButton: Locator;

  // Hero section
  readonly heroTitle: Locator;
  readonly startCodingButton: Locator;

  // Terminal demo
  readonly terminalPreview: Locator;

  constructor(page: Page) {
    this.page = page;

    // Navigation buttons
    this.signInButton = page.getByRole("button", { name: /sign in/i });
    this.getStartedButton = page.getByRole("button", { name: /get started/i });

    // Hero section
    this.heroTitle = page.getByRole("heading", {
      name: /your computer, untethered/i,
    });
    this.startCodingButton = page.getByRole("button", {
      name: /start coding/i,
    });

    // Terminal demo
    this.terminalPreview = page.locator(".terminal-container");
  }

  async goto() {
    await this.page.goto("/");
    await this.page.waitForLoadState("networkidle");
  }

  async expectVisible() {
    await expect(this.heroTitle).toBeVisible();
    await expect(this.terminalPreview).toBeVisible();
  }

  async navigateToSignIn() {
    await this.signInButton.first().click();
    await expect(this.page).toHaveURL(/sign-in/);
  }

  async navigateToSignUp() {
    await this.getStartedButton.first().click();
    // May redirect to waitlist or sign-up
    await expect(this.page).toHaveURL(/sign-up|waitlist/);
  }

  async startCoding() {
    await this.startCodingButton.click();
    await expect(this.page).toHaveURL(/sign-up|waitlist/);
  }
}
