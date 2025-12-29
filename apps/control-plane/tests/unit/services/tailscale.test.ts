import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TailscaleService,
  TailscaleApiError,
  createTailscaleService,
} from "../../../src/services/tailscale.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("TailscaleService", () => {
  let service: TailscaleService;

  beforeEach(() => {
    service = new TailscaleService({
      apiKey: "test-api-key",
      tailnet: "test-tailnet",
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("throws if apiKey is missing", () => {
      expect(() => new TailscaleService({ apiKey: "", tailnet: "test" })).toThrow(
        "Tailscale API key is required"
      );
    });

    it("throws if tailnet is missing", () => {
      expect(() => new TailscaleService({ apiKey: "test", tailnet: "" })).toThrow(
        "Tailscale tailnet is required"
      );
    });

    it("creates service with valid options", () => {
      const s = new TailscaleService({
        apiKey: "test",
        tailnet: "my-tailnet",
      });
      expect(s).toBeDefined();
    });
  });

  describe("createAuthKey", () => {
    it("creates an auth key with default parameters", async () => {
      const mockResponse = {
        id: "key-123",
        key: "tskey-auth-xxxxx",
        description: "ccc-provisioned-key",
        created: "2024-01-01T00:00:00Z",
        expires: "2024-01-01T01:00:00Z",
        revoked: null,
        capabilities: {
          devices: {
            create: {
              reusable: false,
              ephemeral: true,
              preauthorized: true,
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.createAuthKey();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.tailscale.com/api/v2/tailnet/test-tailnet/keys",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer test-api-key",
            "Content-Type": "application/json",
          },
        })
      );

      expect(result.id).toBe("key-123");
      expect(result.key).toBe("tskey-auth-xxxxx");
      expect(result.capabilities.devices.create.ephemeral).toBe(true);
      expect(result.capabilities.devices.create.preauthorized).toBe(true);
    });

    it("creates an auth key with custom parameters", async () => {
      const mockResponse = {
        id: "key-456",
        key: "tskey-auth-yyyyy",
        description: "custom-key",
        created: "2024-01-01T00:00:00Z",
        expires: "2024-01-01T02:00:00Z",
        revoked: null,
        capabilities: {
          devices: {
            create: {
              reusable: true,
              ephemeral: false,
              preauthorized: true,
              tags: ["tag:server"],
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.createAuthKey({
        description: "custom-key",
        expirySeconds: 7200,
        ephemeral: false,
        preauthorized: true,
        reusable: true,
        tags: ["tag:server"],
      });

      expect(result.id).toBe("key-456");
      expect(result.capabilities.devices.create.reusable).toBe(true);
      expect(result.capabilities.devices.create.tags).toContain("tag:server");
    });

    it("throws TailscaleApiError on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve(JSON.stringify({ message: "Forbidden", error: "forbidden" })),
      });

      await expect(service.createAuthKey()).rejects.toThrow(TailscaleApiError);
    });
  });

  describe("listDevices", () => {
    it("returns list of devices", async () => {
      const mockDevices = {
        devices: [
          {
            id: "device-1",
            name: "server-1.tailnet.ts.net",
            hostname: "server-1",
            nodeKey: "nodekey:xxxxx",
            addresses: ["100.64.0.1", "fd7a:115c:a1e0::1"],
            user: "user@example.com",
            os: "linux",
            clientVersion: "1.50.0",
            created: "2024-01-01T00:00:00Z",
            lastSeen: "2024-01-01T12:00:00Z",
            authorized: true,
            isExternal: false,
            tags: ["tag:server"],
          },
          {
            id: "device-2",
            name: "server-2.tailnet.ts.net",
            hostname: "server-2",
            nodeKey: "nodekey:yyyyy",
            addresses: ["100.64.0.2", "fd7a:115c:a1e0::2"],
            user: "user@example.com",
            os: "linux",
            clientVersion: "1.50.0",
            created: "2024-01-02T00:00:00Z",
            lastSeen: "2024-01-02T12:00:00Z",
            authorized: true,
            isExternal: false,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockDevices),
      });

      const result = await service.listDevices();
      expect(result.devices).toHaveLength(2);
      expect(result.devices[0].hostname).toBe("server-1");
    });
  });

  describe("getDevice", () => {
    it("returns device when found", async () => {
      const mockDevice = {
        id: "device-1",
        name: "server-1.tailnet.ts.net",
        hostname: "server-1",
        nodeKey: "nodekey:xxxxx",
        addresses: ["100.64.0.1"],
        user: "user@example.com",
        os: "linux",
        clientVersion: "1.50.0",
        created: "2024-01-01T00:00:00Z",
        lastSeen: "2024-01-01T12:00:00Z",
        authorized: true,
        isExternal: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockDevice),
      });

      const result = await service.getDevice("device-1");
      expect(result?.id).toBe("device-1");
      expect(result?.hostname).toBe("server-1");
    });

    it("returns null when device not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not found"),
      });

      const result = await service.getDevice("device-999");
      expect(result).toBeNull();
    });
  });

  describe("getDeviceByHostname", () => {
    it("returns device matching hostname", async () => {
      const mockDevices = {
        devices: [
          {
            id: "device-1",
            name: "server-1.tailnet.ts.net",
            hostname: "server-1",
            nodeKey: "nodekey:xxxxx",
            addresses: ["100.64.0.1"],
            user: "user@example.com",
            os: "linux",
            clientVersion: "1.50.0",
            created: "2024-01-01T00:00:00Z",
            lastSeen: "2024-01-01T12:00:00Z",
            authorized: true,
            isExternal: false,
          },
          {
            id: "device-2",
            name: "server-2.tailnet.ts.net",
            hostname: "server-2",
            nodeKey: "nodekey:yyyyy",
            addresses: ["100.64.0.2"],
            user: "user@example.com",
            os: "linux",
            clientVersion: "1.50.0",
            created: "2024-01-02T00:00:00Z",
            lastSeen: "2024-01-02T12:00:00Z",
            authorized: true,
            isExternal: false,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockDevices),
      });

      const result = await service.getDeviceByHostname("server-2");
      expect(result?.id).toBe("device-2");
      expect(result?.hostname).toBe("server-2");
    });

    it("returns null when hostname not found", async () => {
      const mockDevices = {
        devices: [
          {
            id: "device-1",
            name: "server-1.tailnet.ts.net",
            hostname: "server-1",
            nodeKey: "nodekey:xxxxx",
            addresses: ["100.64.0.1"],
            user: "user@example.com",
            os: "linux",
            clientVersion: "1.50.0",
            created: "2024-01-01T00:00:00Z",
            lastSeen: "2024-01-01T12:00:00Z",
            authorized: true,
            isExternal: false,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockDevices),
      });

      const result = await service.getDeviceByHostname("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("deleteDevice", () => {
    it("deletes a device", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await expect(service.deleteDevice("device-1")).resolves.not.toThrow();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.tailscale.com/api/v2/device/device-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("waitForDevice", () => {
    it("returns device when found on first poll", async () => {
      const mockDevice = {
        id: "device-1",
        name: "server-1.tailnet.ts.net",
        hostname: "server-1",
        nodeKey: "nodekey:xxxxx",
        addresses: ["100.64.0.1"],
        user: "user@example.com",
        os: "linux",
        clientVersion: "1.50.0",
        created: "2024-01-01T00:00:00Z",
        lastSeen: "2024-01-01T12:00:00Z",
        authorized: true,
        isExternal: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ devices: [mockDevice] }),
      });

      const result = await service.waitForDevice("server-1", {
        pollIntervalMs: 10,
      });
      expect(result.id).toBe("device-1");
    });

    it("polls until device appears", async () => {
      const mockDevice = {
        id: "device-1",
        name: "server-1.tailnet.ts.net",
        hostname: "server-1",
        nodeKey: "nodekey:xxxxx",
        addresses: ["100.64.0.1"],
        user: "user@example.com",
        os: "linux",
        clientVersion: "1.50.0",
        created: "2024-01-01T00:00:00Z",
        lastSeen: "2024-01-01T12:00:00Z",
        authorized: true,
        isExternal: false,
      };

      // First call: device not found
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ devices: [] }),
      });

      // Second call: device found
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ devices: [mockDevice] }),
      });

      const result = await service.waitForDevice("server-1", {
        pollIntervalMs: 10,
        timeoutMs: 1000,
      });

      expect(result.id).toBe("device-1");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws after timeout", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ devices: [] }),
      });

      await expect(
        service.waitForDevice("nonexistent", {
          timeoutMs: 50,
          pollIntervalMs: 10,
        })
      ).rejects.toThrow('Device with hostname "nonexistent" did not appear');
    });
  });

  describe("getDeviceIp", () => {
    it("returns IPv4 address from device addresses", () => {
      const device = {
        id: "device-1",
        name: "server-1.tailnet.ts.net",
        hostname: "server-1",
        nodeKey: "nodekey:xxxxx",
        addresses: ["100.64.0.1", "fd7a:115c:a1e0::1"],
        user: "user@example.com",
        os: "linux",
        clientVersion: "1.50.0",
        created: "2024-01-01T00:00:00Z",
        lastSeen: "2024-01-01T12:00:00Z",
        authorized: true,
        isExternal: false,
      };

      const ip = service.getDeviceIp(device);
      expect(ip).toBe("100.64.0.1");
    });

    it("returns null if no IPv4 address", () => {
      const device = {
        id: "device-1",
        name: "server-1.tailnet.ts.net",
        hostname: "server-1",
        nodeKey: "nodekey:xxxxx",
        addresses: ["fd7a:115c:a1e0::1"],
        user: "user@example.com",
        os: "linux",
        clientVersion: "1.50.0",
        created: "2024-01-01T00:00:00Z",
        lastSeen: "2024-01-01T12:00:00Z",
        authorized: true,
        isExternal: false,
      };

      const ip = service.getDeviceIp(device);
      expect(ip).toBeNull();
    });
  });
});

describe("createTailscaleService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws if TAILSCALE_API_KEY is not set", () => {
    delete process.env["TAILSCALE_API_KEY"];
    delete process.env["TAILSCALE_TAILNET"];
    expect(() => createTailscaleService()).toThrow(
      "TAILSCALE_API_KEY environment variable is required"
    );
  });

  it("throws if TAILSCALE_TAILNET is not set", () => {
    process.env["TAILSCALE_API_KEY"] = "test-key";
    delete process.env["TAILSCALE_TAILNET"];
    expect(() => createTailscaleService()).toThrow(
      "TAILSCALE_TAILNET environment variable is required"
    );
  });

  it("creates service with env variables", () => {
    process.env["TAILSCALE_API_KEY"] = "test-key";
    process.env["TAILSCALE_TAILNET"] = "test-tailnet";
    const service = createTailscaleService();
    expect(service).toBeDefined();
  });
});
