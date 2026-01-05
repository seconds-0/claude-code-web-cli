import { describe, it, expect } from "vitest";
import { generateCloudInit } from "../../src/jobs/handlers/provision.js";

/**
 * Core smoke tests for provisioning
 * These tests verify critical path functionality - they should run fast and catch major issues
 */

describe("Provision core smoke tests", () => {
  describe("generateCloudInit produces valid output", () => {
    it("generates valid cloud-config YAML header", () => {
      const result = generateCloudInit({
        hostname: "test-host",
      });

      // Must start with cloud-config header for cloud-init to recognize it
      expect(result).toMatch(/^#cloud-config\n/);
    });

    it("always includes ttyd start command", () => {
      // ttyd is the terminal service - if it doesn't start, terminal won't work
      const result = generateCloudInit({
        hostname: "test-host",
      });

      expect(result).toContain("systemctl start ttyd");
    });

    it("always signals provisioning complete", () => {
      // This marker file indicates successful provisioning
      const result = generateCloudInit({
        hostname: "test-host",
      });

      expect(result).toContain("touch /var/run/ccc-provisioned");
    });

    it("includes tailscale configuration when authKey provided", () => {
      const result = generateCloudInit({
        tailscaleAuthKey: "test-key",
        hostname: "test-host",
      });

      // Tailscale commands should be present when key is provided
      expect(result).toContain("tailscale up");
      expect(result).toContain("test-key");
      expect(result).toContain("test-host");
    });
  });

  describe("cloud-init handles Tailscale modes", () => {
    it("skips Tailscale when no authKey provided (direct connect mode)", () => {
      const result = generateCloudInit({
        hostname: "test-host",
        // No tailscaleAuthKey = direct connect mode
      });

      // Direct connect should show disabled message
      expect(result).toContain("Tailscale disabled");
      expect(result).not.toContain("tailscale up --authkey");
    });

    it("configures Tailscale when authKey provided", () => {
      const result = generateCloudInit({
        tailscaleAuthKey: "test-key",
        hostname: "test-host",
      });

      // Should wait for Tailscale interface
      expect(result).toContain("for i in $(seq 1 30); do tailscale status");
    });
  });

  describe("cloud-init security", () => {
    it("warns when CONTROL_PLANE_IPS not configured", () => {
      const result = generateCloudInit({
        hostname: "test-host",
        // No controlPlaneIps = warning
      });

      expect(result).toContain("WARNING");
      expect(result).toContain("ttyd");
    });
  });
});
