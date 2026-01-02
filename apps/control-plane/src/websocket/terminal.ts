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

// Flow control constants - must match client's watermarks
const MAX_BUFFER_SIZE = 2_000_000; // 2MB max buffer before dropping data

// Connection tracking with flow control state
const connections = new Map<
  string,
  {
    clientWs: WebSocket;
    ttydWs: WebSocket | null;
    workspaceId: string;
    userId: string;
    // Flow control state
    flowPaused: boolean;
    buffer: Buffer[];
    bufferSize: number;
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

    const ws = new WebSocket(ttydUrl, ["tty"], {
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

  // Buffer for messages received before ttyd connection is established
  const pendingMessages: Buffer[] = [];

  // Set up early message handler to buffer messages until ttyd is connected
  const earlyMessageHandler = (data: Buffer) => {
    pendingMessages.push(data);
  };
  clientWs.on("message", earlyMessageHandler);

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

  // Use public IP for direct connection, fallback to Tailscale IP for legacy workspaces
  const publicIp = workspace.instance.publicIp;
  const tailscaleIp = workspace.instance.tailscaleIp;
  const targetIp = publicIp || tailscaleIp;

  if (!targetIp) {
    console.log(`[terminal] Connection ${connectionId} - no IP address available`);
    clientWs.close(4006, "Workspace has no IP address");
    return;
  }

  if (!publicIp && tailscaleIp) {
    console.log(`[terminal] Connection ${connectionId} - using Tailscale IP (legacy fallback)`);
  }

  // Store connection info with flow control state
  connections.set(connectionId, {
    clientWs,
    ttydWs: null,
    workspaceId,
    userId,
    flowPaused: false,
    buffer: [],
    bufferSize: 0,
  });

  // Connect to ttyd via public IP (or Tailscale fallback)
  try {
    const ttydWs = await connectToTtyd(
      targetIp,
      // Forward ttyd messages to client with flow control
      (data) => {
        const conn = connections.get(connectionId);
        if (!conn || clientWs.readyState !== WebSocket.OPEN) return;

        if (conn.flowPaused) {
          // Client requested pause - buffer the data
          if (conn.bufferSize < MAX_BUFFER_SIZE) {
            conn.buffer.push(data);
            conn.bufferSize += data.length;
          } else {
            // Buffer full - drop oldest data to prevent memory explosion
            while (conn.bufferSize > MAX_BUFFER_SIZE / 2 && conn.buffer.length > 0) {
              const dropped = conn.buffer.shift();
              if (dropped) conn.bufferSize -= dropped.length;
            }
            conn.buffer.push(data);
            conn.bufferSize += data.length;
            console.warn(`[terminal] Connection ${connectionId} buffer full, dropping old data`);
          }
        } else {
          // Normal flow - forward directly
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

    // Remove early message handler and set up the real one
    clientWs.removeListener("message", earlyMessageHandler);

    // Forward client messages to ttyd (with flow control handling)
    clientWs.on("message", (data: Buffer) => {
      // Check if this is a flow control message (JSON string)
      const str = data.toString();
      if (str.startsWith("{")) {
        try {
          const msg = JSON.parse(str);
          if (msg.type === "flow") {
            const conn = connections.get(connectionId);
            if (!conn) return;

            if (msg.ready) {
              // Client ready to receive - flush buffer with chunking to avoid flooding
              console.log(
                `[terminal] Connection ${connectionId} flow resumed, flushing ${conn.buffer.length} buffered messages`
              );
              conn.flowPaused = false;

              // Flush in chunks to avoid overwhelming client
              const bufferedData = conn.buffer;
              conn.buffer = [];
              conn.bufferSize = 0;

              const CHUNK_SIZE = 10; // Messages per tick
              let index = 0;

              const flushChunk = () => {
                const end = Math.min(index + CHUNK_SIZE, bufferedData.length);
                while (index < end) {
                  if (clientWs.readyState !== WebSocket.OPEN) return;
                  const chunk = bufferedData[index];
                  if (chunk) clientWs.send(chunk);
                  index++;
                }
                if (index < bufferedData.length) {
                  setImmediate(flushChunk); // Yield to event loop
                }
              };
              flushChunk();
            } else {
              // Client requested pause
              console.log(`[terminal] Connection ${connectionId} flow paused by client`);
              conn.flowPaused = true;
            }
            return; // Don't forward flow control messages to ttyd
          }
        } catch {
          // Not JSON, forward to ttyd
        }
      }

      if (ttydWs.readyState === WebSocket.OPEN) {
        ttydWs.send(data);
      }
    });

    // Flush any buffered messages
    if (pendingMessages.length > 0) {
      for (const msg of pendingMessages) {
        if (ttydWs.readyState === WebSocket.OPEN) {
          ttydWs.send(msg);
        }
      }
      pendingMessages.length = 0;
    }

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
