/**
 * Hetzner Cloud API Service
 *
 * Provides methods for managing Hetzner Cloud resources including servers and volumes.
 * API Reference: https://docs.hetzner.cloud/
 */

const HETZNER_API_BASE = "https://api.hetzner.cloud/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const PROVISIONING_TIMEOUT_MS = 300_000; // 5 minutes for server creation

// Server types for pricing reference
export const SERVER_TYPES = {
  cpx11: { vcpu: 2, ram: 2, price: 3.85 },
  cpx21: { vcpu: 3, ram: 4, price: 7.05 },
  cpx31: { vcpu: 4, ram: 8, price: 12.99 },
  cpx41: { vcpu: 8, ram: 16, price: 23.99 },
  cpx51: { vcpu: 16, ram: 32, price: 44.99 },
} as const;

export type ServerType = keyof typeof SERVER_TYPES;

// Hetzner API response types
export interface HetznerError {
  code: string;
  message: string;
}

export interface HetznerAction {
  id: number;
  command: string;
  status: "running" | "success" | "error";
  progress: number;
  started: string;
  finished: string | null;
  error?: {
    code: string;
    message: string;
  };
}

export interface HetznerServer {
  id: number;
  name: string;
  status:
    | "running"
    | "initializing"
    | "starting"
    | "stopping"
    | "off"
    | "deleting"
    | "rebuilding"
    | "migrating"
    | "unknown";
  public_net: {
    ipv4: {
      ip: string;
    };
    ipv6: {
      ip: string;
    };
  };
  server_type: {
    name: string;
    description: string;
    cores: number;
    memory: number;
    disk: number;
  };
  datacenter: {
    name: string;
    location: {
      name: string;
      city: string;
      country: string;
    };
  };
  image: {
    id: number;
    name: string;
    os_flavor: string;
  } | null;
  volumes: number[];
  created: string;
}

export interface HetznerVolume {
  id: number;
  name: string;
  size: number;
  server: number | null;
  status: "creating" | "available" | "attached";
  location: {
    name: string;
    city: string;
    country: string;
  };
  linux_device: string;
  format: string | null;
  created: string;
}

// Request types
export interface CreateServerParams {
  name: string;
  serverType?: ServerType;
  location?: string;
  image?: string | number; // Image name or snapshot ID
  sshKeys?: number[];
  userData?: string; // Cloud-init user data
  volumes?: number[];
  labels?: Record<string, string>;
}

export interface CreateVolumeParams {
  name: string;
  size: number; // GB
  location: string;
  format?: "xfs" | "ext4";
  labels?: Record<string, string>;
}

// Response types
interface ServerCreateResponse {
  server: HetznerServer;
  action: HetznerAction;
  root_password?: string;
}

interface ServerDeleteResponse {
  action: HetznerAction;
}

interface VolumeCreateResponse {
  volume: HetznerVolume;
  action: HetznerAction;
}

interface VolumeActionResponse {
  action: HetznerAction;
}

interface ActionGetResponse {
  action: HetznerAction;
}

// Error classes
export class HetznerApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "HetznerApiError";
  }
}

export class HetznerTimeoutError extends Error {
  constructor(
    public actionId: number,
    message: string
  ) {
    super(message);
    this.name = "HetznerTimeoutError";
  }
}

/**
 * Hetzner Cloud API client
 */
export class HetznerService {
  private readonly token: string;
  private readonly defaultLocation: string;
  private readonly defaultServerType: ServerType;

  constructor(options: {
    token: string;
    defaultLocation?: string;
    defaultServerType?: ServerType;
  }) {
    if (!options.token) {
      throw new Error("Hetzner API token is required");
    }
    this.token = options.token;
    this.defaultLocation = options.defaultLocation || "nbg1";
    this.defaultServerType = options.defaultServerType || "cpx11";
  }

  /**
   * Make an API request to Hetzner Cloud
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${HETZNER_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: HetznerError };
        throw new HetznerApiError(
          response.status,
          errorData.error?.code || "unknown_error",
          errorData.error?.message || `HTTP ${response.status}`
        );
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof HetznerApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Hetzner API request timed out after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Create a new server
   */
  async createServer(params: CreateServerParams): Promise<{
    server: HetznerServer;
    action: HetznerAction;
    rootPassword?: string;
  }> {
    const response = await this.request<ServerCreateResponse>(
      "POST",
      "/servers",
      {
        name: params.name,
        server_type: params.serverType || this.defaultServerType,
        location: params.location || this.defaultLocation,
        image: params.image || "ubuntu-22.04",
        ssh_keys: params.sshKeys,
        user_data: params.userData,
        volumes: params.volumes,
        labels: params.labels,
        start_after_create: true,
      },
      PROVISIONING_TIMEOUT_MS
    );

    return {
      server: response.server,
      action: response.action,
      rootPassword: response.root_password,
    };
  }

  /**
   * Get server by ID
   */
  async getServer(serverId: number): Promise<HetznerServer | null> {
    try {
      const response = await this.request<{ server: HetznerServer }>("GET", `/servers/${serverId}`);
      return response.server;
    } catch (error) {
      if (error instanceof HetznerApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a server
   */
  async deleteServer(serverId: number): Promise<HetznerAction> {
    const response = await this.request<ServerDeleteResponse>("DELETE", `/servers/${serverId}`);
    return response.action;
  }

  /**
   * Create a volume
   */
  async createVolume(params: CreateVolumeParams): Promise<{
    volume: HetznerVolume;
    action: HetznerAction;
  }> {
    const response = await this.request<VolumeCreateResponse>("POST", "/volumes", {
      name: params.name,
      size: params.size,
      location: params.location || this.defaultLocation,
      format: params.format || "ext4",
      labels: params.labels,
      automount: false,
    });

    return {
      volume: response.volume,
      action: response.action,
    };
  }

  /**
   * Get volume by ID
   */
  async getVolume(volumeId: number): Promise<HetznerVolume | null> {
    try {
      const response = await this.request<{ volume: HetznerVolume }>("GET", `/volumes/${volumeId}`);
      return response.volume;
    } catch (error) {
      if (error instanceof HetznerApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a volume
   */
  async deleteVolume(volumeId: number): Promise<void> {
    await this.request<void>("DELETE", `/volumes/${volumeId}`);
  }

  /**
   * Attach a volume to a server
   */
  async attachVolume(
    volumeId: number,
    serverId: number,
    automount = false
  ): Promise<HetznerAction> {
    const response = await this.request<VolumeActionResponse>(
      "POST",
      `/volumes/${volumeId}/actions/attach`,
      {
        server: serverId,
        automount,
      }
    );
    return response.action;
  }

  /**
   * Detach a volume from its server
   */
  async detachVolume(volumeId: number): Promise<HetznerAction> {
    const response = await this.request<VolumeActionResponse>(
      "POST",
      `/volumes/${volumeId}/actions/detach`
    );
    return response.action;
  }

  /**
   * Get an action by ID
   */
  async getAction(actionId: number): Promise<HetznerAction> {
    const response = await this.request<ActionGetResponse>("GET", `/actions/${actionId}`);
    return response.action;
  }

  /**
   * Wait for an action to complete
   */
  async waitForAction(
    actionId: number,
    options: {
      timeoutMs?: number;
      pollIntervalMs?: number;
    } = {}
  ): Promise<HetznerAction> {
    const { timeoutMs = PROVISIONING_TIMEOUT_MS, pollIntervalMs = 2000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const action = await this.getAction(actionId);

      if (action.status === "success") {
        return action;
      }

      if (action.status === "error") {
        throw new HetznerApiError(
          500,
          action.error?.code || "action_failed",
          action.error?.message || "Action failed"
        );
      }

      // Still running, wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new HetznerTimeoutError(
      actionId,
      `Action ${actionId} did not complete within ${timeoutMs}ms`
    );
  }

  /**
   * Wait for a server to reach a specific status
   */
  async waitForServerStatus(
    serverId: number,
    targetStatus: HetznerServer["status"],
    options: {
      timeoutMs?: number;
      pollIntervalMs?: number;
    } = {}
  ): Promise<HetznerServer> {
    const { timeoutMs = PROVISIONING_TIMEOUT_MS, pollIntervalMs = 3000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const server = await this.getServer(serverId);

      if (!server) {
        throw new Error(`Server ${serverId} not found`);
      }

      if (server.status === targetStatus) {
        return server;
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new HetznerTimeoutError(
      serverId,
      `Server ${serverId} did not reach status "${targetStatus}" within ${timeoutMs}ms`
    );
  }
}

/**
 * Create a HetznerService instance from environment variables
 */
export function createHetznerService(): HetznerService {
  const token = process.env["HETZNER_API_TOKEN"];
  if (!token) {
    throw new Error("HETZNER_API_TOKEN environment variable is required");
  }

  return new HetznerService({
    token,
    defaultLocation: process.env["HETZNER_LOCATION"] || "nbg1",
    defaultServerType: (process.env["HETZNER_SERVER_TYPE"] as ServerType) || "cpx11",
  });
}
