/**
 * Terminal WebSocket Relay
 *
 * Proxies WebSocket connections from clients to ttyd instances on user boxes.
 * Handles authentication via session tokens and workspace ownership verification.
 */

import { WebSocket, WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import { workspaces } from "@ccc/db";
import { validateSessionToken } from "../services/session.js";

// Connection tracking
const connections = new Map<
  string,
  {
    clientWs: WebSocket;
    ttydWs: WebSocket | null;
    workspaceId: string;
    userId: string;
  }
>();

// ttyd WebSocket port
const TTYD_PORT = 7681;

/**
 * Parse query parameters from URL
 */
function parseQueryParams(url: string | undefined): Record<string, string> {
  if (!url) return {};
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return {};

  const params: Record<string, string> = {};
  const queryString = url.slice(queryStart + 1);
  for (const pair of queryString.split("&")) {
    const [key, value] = pair.split("=");
    if (key) {
      params[key] = decodeURIComponent(value || "");
    }
  }
  return params;
}

/**
 * Generate a unique connection ID
 */
function generateConnectionId(): string {
  return `conn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create WebSocket connection to ttyd on the user's box
 */
async function connectToTtyd(
  tailscaleIp: string,
  onMessage: (data: Buffer) => void,
  onClose: () => void,
  onError: (error: Error) => void
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ttydUrl = `ws://${tailscaleIp}:${TTYD_PORT}/ws`;
    console.log(`[terminal] Connecting to ttyd at ${ttydUrl}`);

    const ws = new WebSocket(ttydUrl, {
      handshakeTimeout: 10000,
    });

    ws.on("open", () => {
      console.log(`[terminal] Connected to ttyd`);
      resolve(ws);
    });

    ws.on("message", (data: Buffer) => {
      onMessage(data);
    });

    ws.on("close", () => {
      console.log(`[terminal] ttyd connection closed`);
      onClose();
    });

    ws.on("error", (error) => {
      console.error(`[terminal] ttyd connection error:`, error);
      onError(error);
      reject(error);
    });
  });
}

/**
 * Handle incoming WebSocket connection
 */
async function handleConnection(clientWs: WebSocket, request: IncomingMessage): Promise<void> {
  const connectionId = generateConnectionId();
  const params = parseQueryParams(request.url);
  const token = params["token"];

  console.log(`[terminal] New connection ${connectionId}`);

  // Validate session token
  if (!token) {
    console.log(`[terminal] Connection ${connectionId} - no token provided`);
    clientWs.close(4001, "Missing session token");
    return;
  }

  const session = await validateSessionToken(token);
  if (!session.valid) {
    console.log(`[terminal] Connection ${connectionId} - invalid token: ${session.error}`);
    clientWs.close(4002, session.error || "Invalid session token");
    return;
  }

  const { workspaceId, userId } = session;
  if (!workspaceId || !userId) {
    clientWs.close(4002, "Invalid session");
    return;
  }

  console.log(`[terminal] Connection ${connectionId} - workspace ${workspaceId}`);

  // Get workspace instance to find tailscale IP
  const db = getDb();
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    with: { instance: true },
  });

  if (!workspace) {
    console.log(`[terminal] Connection ${connectionId} - workspace not found`);
    clientWs.close(4003, "Workspace not found");
    return;
  }

  if (workspace.userId !== userId) {
    console.log(`[terminal] Connection ${connectionId} - not authorized`);
    clientWs.close(4004, "Not authorized");
    return;
  }

  if (workspace.instance?.status !== "running") {
    console.log(`[terminal] Connection ${connectionId} - workspace not running`);
    clientWs.close(4005, "Workspace is not running");
    return;
  }

  const tailscaleIp = workspace.instance.tailscaleIp;
  if (!tailscaleIp) {
    console.log(`[terminal] Connection ${connectionId} - no Tailscale IP`);
    clientWs.close(4006, "Workspace has no Tailscale IP");
    return;
  }

  // Store connection info
  connections.set(connectionId, {
    clientWs,
    ttydWs: null,
    workspaceId,
    userId,
  });

  // Connect to ttyd
  try {
    const ttydWs = await connectToTtyd(
      tailscaleIp,
      // Forward ttyd messages to client
      (data) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data);
        }
      },
      // Handle ttyd close
      () => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1000, "Terminal connection closed");
        }
        connections.delete(connectionId);
      },
      // Handle ttyd error
      (error) => {
        console.error(`[terminal] ttyd error for ${connectionId}:`, error);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1011, "Terminal connection error");
        }
        connections.delete(connectionId);
      }
    );

    // Update connection with ttyd WebSocket
    const conn = connections.get(connectionId);
    if (conn) {
      conn.ttydWs = ttydWs;
    }

    // Forward client messages to ttyd
    clientWs.on("message", (data: Buffer) => {
      if (ttydWs.readyState === WebSocket.OPEN) {
        ttydWs.send(data);
      }
    });

    // Handle client close
    clientWs.on("close", () => {
      console.log(`[terminal] Client ${connectionId} disconnected`);
      if (ttydWs.readyState === WebSocket.OPEN) {
        ttydWs.close();
      }
      connections.delete(connectionId);
    });

    // Handle client error
    clientWs.on("error", (error) => {
      console.error(`[terminal] Client error for ${connectionId}:`, error);
      if (ttydWs.readyState === WebSocket.OPEN) {
        ttydWs.close();
      }
      connections.delete(connectionId);
    });

    // Send ready message to client
    clientWs.send(JSON.stringify({ type: "ready", workspaceId }));
  } catch (error) {
    console.error(`[terminal] Failed to connect to ttyd for ${connectionId}:`, error);
    clientWs.close(4007, "Failed to connect to terminal");
    connections.delete(connectionId);
  }
}

/**
 * Create and attach WebSocket server for terminal connections
 */
export function createTerminalWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: "/ws/terminal",
  });

  wss.on("connection", (ws, request) => {
    handleConnection(ws, request).catch((error) => {
      console.error("[terminal] Unhandled error in connection handler:", error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, "Internal server error");
      }
    });
  });

  wss.on("error", (error) => {
    console.error("[terminal] WebSocket server error:", error);
  });

  console.log("[terminal] WebSocket server initialized on /ws/terminal");

  return wss;
}

/**
 * Get connection stats
 */
export function getConnectionStats(): {
  activeConnections: number;
  connectionsByWorkspace: Record<string, number>;
} {
  const stats: Record<string, number> = {};

  for (const conn of connections.values()) {
    stats[conn.workspaceId] = (stats[conn.workspaceId] || 0) + 1;
  }

  return {
    activeConnections: connections.size,
    connectionsByWorkspace: stats,
  };
}

/**
 * Close all connections for a workspace
 */
export function closeWorkspaceConnections(workspaceId: string): number {
  let closed = 0;

  for (const [id, conn] of connections.entries()) {
    if (conn.workspaceId === workspaceId) {
      if (conn.ttydWs?.readyState === WebSocket.OPEN) {
        conn.ttydWs.close();
      }
      if (conn.clientWs.readyState === WebSocket.OPEN) {
        conn.clientWs.close(1000, "Workspace stopping");
      }
      connections.delete(id);
      closed++;
    }
  }

  return closed;
}
