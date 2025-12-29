import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  HetznerService,
  HetznerApiError,
  HetznerTimeoutError,
  createHetznerService,
} from "../../../src/services/hetzner.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("HetznerService", () => {
  let service: HetznerService;

  beforeEach(() => {
    service = new HetznerService({
      token: "test-token",
      defaultLocation: "nbg1",
      defaultServerType: "cpx11",
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("throws if token is missing", () => {
      expect(() => new HetznerService({ token: "" })).toThrow("Hetzner API token is required");
    });

    it("sets default values", () => {
      const s = new HetznerService({ token: "test" });
      expect(s).toBeDefined();
    });
  });

  describe("createServer", () => {
    it("creates a server with correct parameters", async () => {
      const mockResponse = {
        server: {
          id: 123,
          name: "test-server",
          status: "initializing",
          public_net: {
            ipv4: { ip: "1.2.3.4" },
            ipv6: { ip: "2001:db8::1" },
          },
          server_type: { name: "cpx11", cores: 2, memory: 2, disk: 40 },
          datacenter: {
            name: "nbg1-dc3",
            location: { name: "nbg1", city: "Nuremberg", country: "DE" },
          },
          image: { id: 1, name: "ubuntu-22.04", os_flavor: "ubuntu" },
          volumes: [],
          created: "2024-01-01T00:00:00Z",
        },
        action: {
          id: 456,
          command: "create_server",
          status: "running",
          progress: 0,
          started: "2024-01-01T00:00:00Z",
          finished: null,
        },
        root_password: "test-password",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.createServer({
        name: "test-server",
        serverType: "cpx11",
        userData: "#cloud-config\nruncmd:\n  - echo hello",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.hetzner.cloud/v1/servers",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          },
        })
      );

      const requestBody = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] &&
          ((mockFetch.mock.calls[0] as unknown[])[1] as { body?: string })?.body) ||
          "{}"
      );
      expect(requestBody.name).toBe("test-server");
      expect(requestBody.server_type).toBe("cpx11");
      expect(requestBody.location).toBe("nbg1");
      expect(requestBody.start_after_create).toBe(true);

      expect(result.server.id).toBe(123);
      expect(result.action.id).toBe(456);
      expect(result.rootPassword).toBe("test-password");
    });

    it("throws HetznerApiError on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: { code: "invalid_input", message: "Invalid server name" },
          }),
      });

      await expect(service.createServer({ name: "" })).rejects.toThrow(HetznerApiError);
    });
  });

  describe("getServer", () => {
    it("returns server when found", async () => {
      const mockServer = {
        id: 123,
        name: "test-server",
        status: "running",
        public_net: { ipv4: { ip: "1.2.3.4" }, ipv6: { ip: "::1" } },
        server_type: { name: "cpx11" },
        datacenter: { name: "nbg1-dc3", location: { name: "nbg1" } },
        image: null,
        volumes: [],
        created: "2024-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ server: mockServer }),
      });

      const result = await service.getServer(123);
      expect(result?.id).toBe(123);
      expect(result?.status).toBe("running");
    });

    it("returns null when server not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { code: "not_found", message: "Not found" } }),
      });

      const result = await service.getServer(999);
      expect(result).toBeNull();
    });
  });

  describe("deleteServer", () => {
    it("deletes a server and returns action", async () => {
      const mockAction = {
        id: 789,
        command: "delete_server",
        status: "running",
        progress: 0,
        started: "2024-01-01T00:00:00Z",
        finished: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ action: mockAction }),
      });

      const result = await service.deleteServer(123);
      expect(result.id).toBe(789);
      expect(result.command).toBe("delete_server");
    });
  });

  describe("createVolume", () => {
    it("creates a volume with correct parameters", async () => {
      const mockResponse = {
        volume: {
          id: 100,
          name: "test-volume",
          size: 20,
          server: null,
          status: "creating",
          location: { name: "nbg1", city: "Nuremberg", country: "DE" },
          linux_device: "/dev/disk/by-id/scsi-0HC_Volume_100",
          format: "ext4",
          created: "2024-01-01T00:00:00Z",
        },
        action: {
          id: 101,
          command: "create_volume",
          status: "running",
          progress: 0,
          started: "2024-01-01T00:00:00Z",
          finished: null,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.createVolume({
        name: "test-volume",
        size: 20,
        location: "nbg1",
      });

      expect(result.volume.id).toBe(100);
      expect(result.volume.size).toBe(20);
      expect(result.action.id).toBe(101);
    });
  });

  describe("attachVolume", () => {
    it("attaches a volume to a server", async () => {
      const mockAction = {
        id: 200,
        command: "attach_volume",
        status: "running",
        progress: 0,
        started: "2024-01-01T00:00:00Z",
        finished: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ action: mockAction }),
      });

      const result = await service.attachVolume(100, 123);
      expect(result.id).toBe(200);
      expect(result.command).toBe("attach_volume");
    });
  });

  describe("detachVolume", () => {
    it("detaches a volume from a server", async () => {
      const mockAction = {
        id: 201,
        command: "detach_volume",
        status: "running",
        progress: 0,
        started: "2024-01-01T00:00:00Z",
        finished: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ action: mockAction }),
      });

      const result = await service.detachVolume(100);
      expect(result.id).toBe(201);
      expect(result.command).toBe("detach_volume");
    });
  });

  describe("waitForAction", () => {
    it("returns action when status is success", async () => {
      const mockAction = {
        id: 300,
        command: "create_server",
        status: "success",
        progress: 100,
        started: "2024-01-01T00:00:00Z",
        finished: "2024-01-01T00:00:30Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ action: mockAction }),
      });

      const result = await service.waitForAction(300, { pollIntervalMs: 10 });
      expect(result.status).toBe("success");
      expect(result.progress).toBe(100);
    });

    it("throws HetznerApiError when action fails", async () => {
      const mockAction = {
        id: 301,
        command: "create_server",
        status: "error",
        progress: 50,
        started: "2024-01-01T00:00:00Z",
        finished: "2024-01-01T00:00:30Z",
        error: { code: "server_error", message: "Server creation failed" },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ action: mockAction }),
      });

      await expect(service.waitForAction(301, { pollIntervalMs: 10 })).rejects.toThrow(
        HetznerApiError
      );
    });

    it("polls until action completes", async () => {
      const runningAction = {
        id: 302,
        command: "create_server",
        status: "running",
        progress: 50,
        started: "2024-01-01T00:00:00Z",
        finished: null,
      };

      const successAction = {
        ...runningAction,
        status: "success",
        progress: 100,
        finished: "2024-01-01T00:00:30Z",
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ action: runningAction }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ action: successAction }),
        });

      const result = await service.waitForAction(302, { pollIntervalMs: 10 });
      expect(result.status).toBe("success");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws HetznerTimeoutError after timeout", async () => {
      const runningAction = {
        id: 303,
        command: "create_server",
        status: "running",
        progress: 50,
        started: "2024-01-01T00:00:00Z",
        finished: null,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ action: runningAction }),
      });

      await expect(
        service.waitForAction(303, { timeoutMs: 50, pollIntervalMs: 10 })
      ).rejects.toThrow(HetznerTimeoutError);
    });
  });

  describe("waitForServerStatus", () => {
    it("returns server when target status reached", async () => {
      const mockServer = {
        id: 400,
        name: "test-server",
        status: "running",
        public_net: { ipv4: { ip: "1.2.3.4" }, ipv6: { ip: "::1" } },
        server_type: { name: "cpx11" },
        datacenter: { name: "nbg1-dc3", location: { name: "nbg1" } },
        image: null,
        volumes: [],
        created: "2024-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ server: mockServer }),
      });

      const result = await service.waitForServerStatus(400, "running", {
        pollIntervalMs: 10,
      });
      expect(result.status).toBe("running");
    });

    it("throws error if server not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { code: "not_found", message: "Not found" } }),
      });

      await expect(
        service.waitForServerStatus(999, "running", { pollIntervalMs: 10 })
      ).rejects.toThrow("Server 999 not found");
    });
  });
});

describe("createHetznerService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws if HETZNER_API_TOKEN is not set", () => {
    delete process.env["HETZNER_API_TOKEN"];
    expect(() => createHetznerService()).toThrow(
      "HETZNER_API_TOKEN environment variable is required"
    );
  });

  it("creates service with token from env", () => {
    process.env["HETZNER_API_TOKEN"] = "test-env-token";
    const service = createHetznerService();
    expect(service).toBeDefined();
  });
});
