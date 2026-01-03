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
        tailscaleAuthKey: "test-key",
        hostname: "test-host",
      });

      // Must start with cloud-config header for cloud-init to recognize it
      expect(result).toMatch(/^#cloud-config\n/);
    });

    it("always includes ttyd start command", () => {
      // ttyd is the terminal service - if it doesn't start, terminal won't work
      const result = generateCloudInit({
        tailscaleAuthKey: "test-key",
        hostname: "test-host",
      });

      expect(result).toContain("systemctl start ttyd");
    });

    it("always signals provisioning complete", () => {
      // This marker file indicates successful provisioning
      const result = generateCloudInit({
        tailscaleAuthKey: "test-key",
        hostname: "test-host",
      });

      expect(result).toContain("touch /var/run/ccc-provisioned");
    });

    it("includes tailscale configuration", () => {
      const result = generateCloudInit({
        tailscaleAuthKey: "test-key",
        hostname: "test-host",
      });

      // Tailscale command should be present (even if optional in direct mode)
      expect(result).toContain("tailscale up");
      expect(result).toContain("test-key");
      expect(result).toContain("test-host");
    });
  });

  describe("cloud-init handles both connection modes", () => {
    it("direct connect mode skips Tailscale wait", () => {
      const result = generateCloudInit({
        tailscaleAuthKey: "test-key",
        hostname: "test-host",
        privateMode: false,
      });

      // Direct connect should NOT block waiting for Tailscale
      expect(result).toContain("Tailscale optional in direct mode");
    });

    it("private mode waits for Tailscale", () => {
      const result = generateCloudInit({
        tailscaleAuthKey: "test-key",
        hostname: "test-host",
        privateMode: true,
      });

      // Private mode should wait for Tailscale interface
      expect(result).toContain("for i in $(seq 1 30); do tailscale status");
    });
  });

  describe("cloud-init includes network readiness check", () => {
    it("waits for network before starting ttyd", () => {
      const result = generateCloudInit({
        tailscaleAuthKey: "test-key",
        hostname: "test-host",
      });

      // Network check should be present
      expect(result).toContain("Waiting for network interface");
      expect(result).toContain("scope global");
    });
  });
});
