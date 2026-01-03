import { describe, it, expect } from "vitest";
import { generateCloudInit } from "../../../src/jobs/handlers/provision.js";

describe("generateCloudInit", () => {
  const baseParams = {
    tailscaleAuthKey: "ts-key-123",
    hostname: "ccc-testhost",
  };

  describe("privateMode handling", () => {
    it("skips Tailscale wait in direct connect mode (privateMode=false)", () => {
      const result = generateCloudInit({
        ...baseParams,
        privateMode: false,
      });

      // Should NOT have the wait loop for Tailscale
      expect(result).not.toContain("for i in $(seq 1 30); do tailscale status");
      // Should have the non-blocking Tailscale command with fallback
      expect(result).toContain('|| echo "Tailscale optional in direct mode"');
    });

    it("waits for Tailscale in private mode (privateMode=true)", () => {
      const result = generateCloudInit({
        ...baseParams,
        privateMode: true,
      });

      // Should have the wait loop for Tailscale
      expect(result).toContain("for i in $(seq 1 30); do tailscale status");
      // Should NOT have the "optional" fallback
      expect(result).not.toContain("Tailscale optional in direct mode");
    });

    it("defaults to direct connect mode when privateMode is omitted", () => {
      const result = generateCloudInit(baseParams);

      // Should behave like privateMode=false
      expect(result).not.toContain("for i in $(seq 1 30); do tailscale status");
      expect(result).toContain("Tailscale optional in direct mode");
    });
  });

  describe("firewall configuration", () => {
    it("uses inline iptables when CONTROL_PLANE_IPS provided", () => {
      const result = generateCloudInit({
        ...baseParams,
        controlPlaneIps: "1.2.3.4 5.6.7.8",
      });

      // Should use inline iptables, not external script
      expect(result).toContain("iptables -A INPUT -p tcp --dport 7681 -j DROP");
      expect(result).toContain("iptables -I INPUT -p tcp --dport 7681 -s");
      expect(result).not.toContain("configure-ttyd-firewall.sh");
    });

    it("warns when CONTROL_PLANE_IPS not provided", () => {
      const result = generateCloudInit(baseParams);

      expect(result).toContain("ttyd port 7681 is accessible from any IP");
    });

    it("allows localhost access for debugging", () => {
      const result = generateCloudInit({
        ...baseParams,
        controlPlaneIps: "1.2.3.4",
      });

      expect(result).toContain("iptables -I INPUT -p tcp --dport 7681 -s 127.0.0.1");
    });
  });

  describe("network readiness", () => {
    it("waits for network interface before starting ttyd", () => {
      const result = generateCloudInit(baseParams);

      // Network check should come before ttyd start
      const networkCheckIndex = result.indexOf("Waiting for network interface");
      const ttydStartIndex = result.indexOf("systemctl start ttyd");

      expect(networkCheckIndex).toBeGreaterThan(-1);
      expect(ttydStartIndex).toBeGreaterThan(-1);
      expect(networkCheckIndex).toBeLessThan(ttydStartIndex);
    });

    it("checks for scope global in ip addr output", () => {
      const result = generateCloudInit(baseParams);

      expect(result).toContain("ip addr show | grep -q 'scope global'");
    });
  });

  describe("ttyd startup verification", () => {
    it("verifies ttyd started successfully", () => {
      const result = generateCloudInit(baseParams);

      expect(result).toContain("systemctl is-active --quiet ttyd");
      expect(result).toContain("ttyd started successfully");
    });

    it("logs ttyd status on failure", () => {
      const result = generateCloudInit(baseParams);

      expect(result).toContain("systemctl status ttyd");
      expect(result).toContain("journalctl -u ttyd");
    });
  });

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
      const result = generateCloudInit(baseParams);

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
