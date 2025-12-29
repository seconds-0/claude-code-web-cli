/**
 * Tailscale API Service
 *
 * Provides methods for managing Tailscale resources including auth keys and devices.
 * API Reference: https://tailscale.com/api
 * Auth Keys: https://tailscale.com/kb/1085/auth-keys
 */

const TAILSCALE_API_BASE = "https://api.tailscale.com/api/v2";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_AUTH_KEY_EXPIRY_SECONDS = 3600; // 1 hour

// Tailscale API types
export interface TailscaleDevice {
  id: string;
  name: string;
  hostname: string;
  nodeKey: string;
  addresses: string[]; // IPv4 and IPv6 addresses
  user: string;
  os: string;
  clientVersion: string;
  created: string;
  lastSeen: string;
  authorized: boolean;
  isExternal: boolean;
  tags?: string[];
  expires?: string;
}

export interface TailscaleAuthKey {
  id: string;
  key: string; // The actual auth key value (only returned once on creation)
  description: string;
  created: string;
  expires: string;
  revoked: string | null;
  capabilities: {
    devices: {
      create: {
        reusable: boolean;
        ephemeral: boolean;
        preauthorized: boolean;
        tags?: string[];
      };
    };
  };
}

export interface CreateAuthKeyParams {
  description?: string;
  expirySeconds?: number;
  ephemeral?: boolean;
  preauthorized?: boolean;
  reusable?: boolean;
  tags?: string[];
}

// Error class
export class TailscaleApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "TailscaleApiError";
  }
}

/**
 * Tailscale API client
 */
export class TailscaleService {
  private readonly apiKey: string;
  private readonly tailnet: string;

  constructor(options: { apiKey: string; tailnet: string }) {
    if (!options.apiKey) {
      throw new Error("Tailscale API key is required");
    }
    if (!options.tailnet) {
      throw new Error("Tailscale tailnet is required");
    }
    this.apiKey = options.apiKey;
    this.tailnet = options.tailnet;
  }

  /**
   * Make an API request to Tailscale
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Replace :tailnet placeholder with actual tailnet
    const resolvedPath = path.replace(":tailnet", encodeURIComponent(this.tailnet));

    try {
      const response = await fetch(`${TAILSCALE_API_BASE}${resolvedPath}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        let errorMessage = `HTTP ${response.status}`;
        let errorCode = "unknown_error";

        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorMessage;
          errorCode = errorData.error || errorCode;
        } catch {
          if (errorText) {
            errorMessage = errorText;
          }
        }

        throw new TailscaleApiError(response.status, errorCode, errorMessage);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof TailscaleApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Tailscale API request timed out after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Create a new auth key for registering devices
   *
   * By default, creates ephemeral + preauthorized keys suitable for VM provisioning
   */
  async createAuthKey(params: CreateAuthKeyParams = {}): Promise<TailscaleAuthKey> {
    const {
      description = "ccc-provisioned-key",
      expirySeconds = DEFAULT_AUTH_KEY_EXPIRY_SECONDS,
      ephemeral = true,
      preauthorized = true,
      reusable = false,
      tags = [],
    } = params;

    const response = await this.request<TailscaleAuthKey>("POST", "/tailnet/:tailnet/keys", {
      capabilities: {
        devices: {
          create: {
            reusable,
            ephemeral,
            preauthorized,
            tags: tags.length > 0 ? tags : undefined,
          },
        },
      },
      expirySeconds,
      description,
    });

    return response;
  }

  /**
   * List all auth keys
   */
  async listAuthKeys(): Promise<{ keys: TailscaleAuthKey[] }> {
    return this.request<{ keys: TailscaleAuthKey[] }>("GET", "/tailnet/:tailnet/keys");
  }

  /**
   * Delete an auth key
   */
  async deleteAuthKey(keyId: string): Promise<void> {
    await this.request<void>("DELETE", `/tailnet/:tailnet/keys/${keyId}`);
  }

  /**
   * List all devices in the tailnet
   */
  async listDevices(): Promise<{ devices: TailscaleDevice[] }> {
    return this.request<{ devices: TailscaleDevice[] }>("GET", "/tailnet/:tailnet/devices");
  }

  /**
   * Get a device by ID
   */
  async getDevice(deviceId: string): Promise<TailscaleDevice | null> {
    try {
      return await this.request<TailscaleDevice>("GET", `/device/${deviceId}`);
    } catch (error) {
      if (error instanceof TailscaleApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get a device by its hostname
   *
   * Returns the first device matching the hostname, or null if not found
   */
  async getDeviceByHostname(hostname: string): Promise<TailscaleDevice | null> {
    const { devices } = await this.listDevices();
    return devices.find((d) => d.hostname === hostname) || null;
  }

  /**
   * Delete a device from the tailnet
   */
  async deleteDevice(deviceId: string): Promise<void> {
    await this.request<void>("DELETE", `/device/${deviceId}`);
  }

  /**
   * Authorize a device (if device approval is enabled)
   */
  async authorizeDevice(deviceId: string): Promise<TailscaleDevice> {
    return this.request<TailscaleDevice>("POST", `/device/${deviceId}/authorized`, {
      authorized: true,
    });
  }

  /**
   * Wait for a device with the given hostname to appear in the tailnet
   *
   * Useful after VM provisioning to wait for Tailscale to connect
   */
  async waitForDevice(
    hostname: string,
    options: {
      timeoutMs?: number;
      pollIntervalMs?: number;
    } = {}
  ): Promise<TailscaleDevice> {
    const { timeoutMs = 120_000, pollIntervalMs = 5000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const device = await this.getDeviceByHostname(hostname);

      if (device) {
        return device;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Device with hostname "${hostname}" did not appear within ${timeoutMs}ms`);
  }

  /**
   * Get the primary IPv4 address for a device
   */
  getDeviceIp(device: TailscaleDevice): string | null {
    // Tailscale addresses are typically in the 100.x.x.x range for IPv4
    const ipv4 = device.addresses.find((addr) => addr.startsWith("100."));
    return ipv4 || null;
  }
}

/**
 * Create a TailscaleService instance from environment variables
 */
export function createTailscaleService(): TailscaleService {
  const apiKey = process.env["TAILSCALE_API_KEY"];
  if (!apiKey) {
    throw new Error("TAILSCALE_API_KEY environment variable is required");
  }

  const tailnet = process.env["TAILSCALE_TAILNET"];
  if (!tailnet) {
    throw new Error("TAILSCALE_TAILNET environment variable is required");
  }

  return new TailscaleService({
    apiKey,
    tailnet,
  });
}
