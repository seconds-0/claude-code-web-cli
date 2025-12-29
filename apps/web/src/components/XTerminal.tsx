"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface XTerminalProps {
  workspaceId: string;
  sessionToken: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

// Connection states
type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export default function XTerminal({
  workspaceId,
  sessionToken,
  onConnect,
  onDisconnect,
  onError,
}: XTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 2000;

  // Get WebSocket URL from environment or construct from current origin
  const getWsUrl = useCallback(() => {
    const baseUrl = process.env["NEXT_PUBLIC_CONTROL_PLANE_URL"] || "";
    if (baseUrl) {
      // Convert HTTP URL to WebSocket URL
      const wsProtocol = baseUrl.startsWith("https") ? "wss" : "ws";
      const wsBase = baseUrl.replace(/^https?/, wsProtocol);
      return `${wsBase}/ws/terminal?token=${encodeURIComponent(sessionToken)}`;
    }
    // Fallback to localhost for development
    return `ws://localhost:8080/ws/terminal?token=${encodeURIComponent(sessionToken)}`;
  }, [sessionToken]);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (!xtermRef.current) return;

    const wsUrl = getWsUrl();
    console.log(`[XTerminal] Connecting to ${wsUrl}`);

    setConnectionState("connecting");

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        console.log("[XTerminal] WebSocket connected");
        setConnectionState("connected");
        setReconnectAttempt(0);
        onConnect?.();
      };

      ws.onmessage = (event) => {
        if (xtermRef.current) {
          if (typeof event.data === "string") {
            // Handle JSON messages (like ready signal)
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === "ready") {
                console.log("[XTerminal] Terminal ready:", msg.workspaceId);
              }
            } catch {
              // Not JSON, treat as terminal data
              xtermRef.current.write(event.data);
            }
          } else {
            // Binary data from ttyd
            const data = new Uint8Array(event.data);
            xtermRef.current.write(data);
          }
        }
      };

      ws.onclose = (event) => {
        console.log(`[XTerminal] WebSocket closed: ${event.code} ${event.reason}`);
        wsRef.current = null;

        if (event.code !== 1000) {
          // Abnormal close, attempt reconnect
          setConnectionState("disconnected");
          onDisconnect?.();

          if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
            console.log(
              `[XTerminal] Reconnecting in ${RECONNECT_DELAY_MS}ms (attempt ${reconnectAttempt + 1})`
            );
            reconnectTimeoutRef.current = setTimeout(() => {
              setReconnectAttempt((prev) => prev + 1);
              connect();
            }, RECONNECT_DELAY_MS);
          } else {
            setConnectionState("error");
            onError?.("Failed to reconnect after multiple attempts");
          }
        } else {
          setConnectionState("disconnected");
          onDisconnect?.();
        }
      };

      ws.onerror = (event) => {
        console.error("[XTerminal] WebSocket error:", event);
        setConnectionState("error");
        onError?.("WebSocket connection error");
      };
    } catch (error) {
      console.error("[XTerminal] Failed to connect:", error);
      setConnectionState("error");
      onError?.(error instanceof Error ? error.message : "Connection failed");
    }
  }, [getWsUrl, onConnect, onDisconnect, onError, reconnectAttempt]);

  // Initialize terminal
  useEffect(() => {
    let term: Terminal | null = null;
    let fitAddon: FitAddon | null = null;

    const initTerminal = async () => {
      if (!terminalRef.current) return;

      // Dynamically import xterm modules (client-side only)
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");

      term = new Terminal({
        cursorBlink: true,
        cursorStyle: "block",
        fontSize: 14,
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        theme: {
          background: "#0d0d0d",
          foreground: "#e5e5e5",
          cursor: "#e5e5e5",
          cursorAccent: "#0d0d0d",
          selectionBackground: "#404040",
          black: "#0d0d0d",
          red: "#ff5555",
          green: "#50fa7b",
          yellow: "#f1fa8c",
          blue: "#6272a4",
          magenta: "#ff79c6",
          cyan: "#8be9fd",
          white: "#e5e5e5",
          brightBlack: "#4d4d4d",
          brightRed: "#ff6e6e",
          brightGreen: "#69ff94",
          brightYellow: "#ffffa5",
          brightBlue: "#d6acff",
          brightMagenta: "#ff92df",
          brightCyan: "#a4ffff",
          brightWhite: "#ffffff",
        },
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      term.open(terminalRef.current);
      fitAddon.fit();

      // Handle terminal input
      term.onData((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          // ttyd expects binary data
          const encoder = new TextEncoder();
          wsRef.current.send(encoder.encode(data));
        }
      });

      // Handle terminal resize
      term.onResize(({ cols, rows }) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          // ttyd resize protocol: JSON message
          wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      });

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Connect after terminal is ready
      connect();
    };

    initTerminal();

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);

      // Cleanup reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      // Close WebSocket
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounting");
        wsRef.current = null;
      }

      // Dispose terminal
      if (term) {
        term.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      }
    };
  }, [connect]);

  // Status indicator
  const getStatusColor = () => {
    switch (connectionState) {
      case "connected":
        return "var(--success)";
      case "connecting":
        return "var(--warning)";
      case "disconnected":
        return "var(--muted)";
      case "error":
        return "var(--error)";
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case "connected":
        return "Connected";
      case "connecting":
        return reconnectAttempt > 0
          ? `Reconnecting (${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`
          : "Connecting...";
      case "disconnected":
        return "Disconnected";
      case "error":
        return "Connection Error";
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#0d0d0d",
      }}
    >
      {/* Status bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.25rem 0.5rem",
          fontSize: "0.625rem",
          fontFamily: "var(--font-mono)",
          color: "var(--muted)",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <span>WS.{workspaceId.slice(0, 8).toUpperCase()}</span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: getStatusColor(),
            }}
          />
          {getStatusText()}
        </span>
      </div>

      {/* Terminal container */}
      <div
        ref={terminalRef}
        style={{
          flex: 1,
          padding: "0.5rem",
          overflow: "hidden",
        }}
      />
    </div>
  );
}
