import { describe, it, expect } from "vitest";
import { generateCloudInit } from "../../../src/jobs/handlers/provision.js";

describe("generateCloudInit", () => {
  const baseParams = {
    tailscaleAuthKey: "ts-key-123",
    hostname: "ccc-testhost",
  };

  describe("basic cloud-init structure", () => {
    it("produces valid cloud-config header", () => {
      const result = generateCloudInit(baseParams);
      expect(result.startsWith("#cloud-config\n")).toBe(true);
    });

    it("sets hostname", () => {
      const result = generateCloudInit({
        ...baseParams,
        hostname: "my-custom-host",
      });
      expect(result).toContain("hostname: my-custom-host");
    });

    it("starts ttyd service", () => {
      const result = generateCloudInit(baseParams);
      expect(result).toContain("systemctl start ttyd");
    });

    it("signals provisioning complete", () => {
      const result = generateCloudInit(baseParams);
      expect(result).toContain("touch /var/run/ccc-provisioned");
    });
  });

  describe("Tailscale handling", () => {
    it("configures Tailscale when authKey provided", () => {
      const result = generateCloudInit({
        tailscaleAuthKey: "test-key",
        hostname: "test-host",
      });

      expect(result).toContain("tailscale up --authkey=test-key");
      expect(result).toContain("tailscale status");
    });

    it("skips Tailscale when no authKey provided (direct connect mode)", () => {
      const result = generateCloudInit({
        hostname: "test-host",
        // No tailscaleAuthKey = direct connect mode
      });

      expect(result).toContain("Tailscale disabled");
      expect(result).not.toContain("tailscale up --authkey");
    });

    it("waits for Tailscale interface when key provided", () => {
      const result = generateCloudInit({
        tailscaleAuthKey: "test-key",
        hostname: "test-host",
      });

      expect(result).toContain("for i in $(seq 1 30); do tailscale status");
    });
  });

  describe("firewall configuration", () => {
    it("uses firewall script when CONTROL_PLANE_IPS provided", () => {
      const result = generateCloudInit({
        ...baseParams,
        controlPlaneIps: "1.2.3.4 5.6.7.8",
      });

      expect(result).toContain("configure-ttyd-firewall.sh");
      expect(result).toContain('CONTROL_PLANE_IPS="1.2.3.4 5.6.7.8"');
    });

    it("warns when CONTROL_PLANE_IPS not provided", () => {
      const result = generateCloudInit({
        hostname: "test-host",
      });

      expect(result).toContain("ttyd port 7681 is accessible from any IP");
    });
  });

  describe("volume mounting", () => {
    it("includes volume mount commands when volumeDevice provided", () => {
      const result = generateCloudInit({
        ...baseParams,
        volumeDevice: "/dev/sdb",
      });

      expect(result).toContain("mkdir -p /mnt/workspace");
      expect(result).toContain("mount /dev/sdb /mnt/workspace");
      expect(result).toContain("chown coder:coder /mnt/workspace");
    });

    it("skips volume mount when volumeDevice not provided", () => {
      const result = generateCloudInit({
        hostname: "test-host",
      });

      expect(result).not.toContain("mkdir -p /mnt/workspace");
    });
  });

  describe("credential injection", () => {
    it("injects anthropic tokens when provided", () => {
      const result = generateCloudInit({
        ...baseParams,
        anthropicTokens: {
          accessToken: "test-access-token",
          refreshToken: "test-refresh-token",
        } as unknown as import("../../../src/services/encryption.js").TokenBlob,
      });

      expect(result).toContain("/home/coder/.claude/.credentials.json");
      expect(result).toContain("chmod 600 /home/coder/.claude/.credentials.json");
    });

    it("sets up capture token when provided", () => {
      const result = generateCloudInit({
        ...baseParams,
        captureToken: "capture-token-123",
        apiUrl: "https://api.example.com",
      });

      expect(result).toContain("/var/run/ccc-capture-token");
      expect(result).toContain("CCC_API_URL=https://api.example.com");
    });
  });
});
