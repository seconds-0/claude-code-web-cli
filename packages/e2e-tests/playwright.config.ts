import { defineConfig, devices } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default URLs
const WEB_URL = process.env.STAGING_WEB_URL || "https://www.untethered.computer";

// Auth state file path
const authFile = path.join(__dirname, "auth/user.json");

// Check if auth file exists (may not if globalSetup skipped auth)
const hasAuthFile = fs.existsSync(authFile);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [["html"], process.env.CI ? ["blob"] : ["list"]],

  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  // Global setup for Clerk authentication
  globalSetup: path.join(__dirname, "global-setup.ts"),

  projects: [
    // Desktop Chrome - authenticated tests
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use storageState if auth file exists (created by globalSetup)
        ...(hasAuthFile && { storageState: authFile }),
      },
    },

    // Desktop Firefox
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        ...(hasAuthFile && { storageState: authFile }),
      },
    },

    // Mobile Safari (iPhone)
    {
      name: "mobile-safari",
      use: {
        ...devices["iPhone 13"],
        ...(hasAuthFile && { storageState: authFile }),
      },
    },

    // Mobile Chrome (Android)
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"],
        ...(hasAuthFile && { storageState: authFile }),
      },
    },
  ],

  // Timeouts
  timeout: 60_000, // 60s per test (workspace provisioning can be slow)
  expect: {
    timeout: 10_000, // 10s for assertions
  },
});
