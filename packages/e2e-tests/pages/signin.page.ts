/**
 * Sign-In Page Object Model
 *
 * Clerk sign-in form with email/password and OAuth.
 */

import { Page, Locator, expect } from "@playwright/test";

export class SignInPage {
  readonly page: Page;

  // Form elements
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  // OAuth buttons
  readonly githubButton: Locator;
  readonly googleButton: Locator;

  // Links
  readonly signUpLink: Locator;

  // Error states
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Form inputs (Clerk Elements)
    this.emailInput = page.locator('[name="emailAddress"], [name="identifier"]');
    this.passwordInput = page.locator('[name="password"]');
    this.submitButton = page.locator('button[type="submit"], .auth-submit');

    // OAuth buttons
    this.githubButton = page.locator('button:has-text("GitHub")');
    this.googleButton = page.locator('button:has-text("Google")');

    // Links
    this.signUpLink = page.getByText(/create account|sign up/i);

    // Error message
    this.errorMessage = page.locator(".auth-global-error, .cl-formFieldErrorText");
  }

  async goto() {
    await this.page.goto("/sign-in");
    await this.page.waitForLoadState("networkidle");
  }

  async expectVisible() {
    await expect(this.emailInput).toBeVisible();
  }

  async signInWithEmail(email: string, password?: string) {
    await this.emailInput.fill(email);

    // If password field appears, fill it
    if (password) {
      // Submit email first if needed
      const passwordVisible = await this.passwordInput.isVisible();
      if (!passwordVisible) {
        await this.submitButton.click();
        await this.passwordInput.waitFor({ state: "visible" });
      }
      await this.passwordInput.fill(password);
    }

    await this.submitButton.click();
  }

  async signInWithGitHub() {
    await this.githubButton.click();
    // Note: OAuth flows can't be fully automated in E2E tests
  }

  async signInWithGoogle() {
    await this.googleButton.click();
    // Note: OAuth flows can't be fully automated in E2E tests
  }

  async expectError(message?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async navigateToSignUp() {
    await this.signUpLink.click();
    await expect(this.page).toHaveURL(/sign-up|waitlist/);
  }
}
