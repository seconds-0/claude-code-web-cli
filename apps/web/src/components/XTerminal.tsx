"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { getTerminalWsUrl } from "@/lib/config";

interface XTerminalProps {
  workspaceId: string;
  sessionToken: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

// Connection states
type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

// Flow control constants - prevents browser crash from rapid output
const HIGH_WATERMARK = 500_000; // 500KB - pause when exceeded
const LOW_WATERMARK = 50_000; // 50KB - resume when below

// Debounce utility
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

// Module-level tracking to prevent StrictMode double-init race conditions
const initializedContainers = new WeakSet<HTMLElement>();

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
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flow control state (refs to avoid re-renders on every byte)
  const pendingDataRef = useRef(0);
  const isPausedRef = useRef(false);

  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const reconnectAttemptRef = useRef(0); // Use ref to avoid triggering effect re-runs
  const [isBuffering, setIsBuffering] = useState(false); // UX indicator for flow control

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 2000;

  // Get WebSocket URL from shared config
  const wsUrl = getTerminalWsUrl(sessionToken);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (!xtermRef.current) return;

    // Log without token to avoid sensitive data in logs
    console.log(`[XTerminal] Connecting to WebSocket for workspace ${workspaceId}`);

    setConnectionState("connecting");

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        console.log("[XTerminal] WebSocket connected");
        setConnectionState("connected");
        reconnectAttemptRef.current = 0;
        onConnect?.();

        // Send initial resize message so ttyd knows terminal dimensions
        if (xtermRef.current) {
          const { cols, rows } = xtermRef.current;
          ws.send(JSON.stringify({ columns: cols, rows: rows }));
        }
      };

      ws.onmessage = (event) => {
        if (!xtermRef.current) return;

        // Handle JSON messages (like ready signal or flow control)
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "ready") {
              console.log("[XTerminal] Terminal ready:", msg.workspaceId);
            }
            return;
          } catch {
            // Not JSON, treat as terminal data (shouldn't happen often)
            writeWithFlowControl(event.data, event.data.length);
            return;
          }
        }

        // Binary data from ttyd - first byte is message type (ASCII character)
        // ttyd uses ASCII: '0' (48) = output, '1' (49) = title, '2' (50) = prefs
        const data = new Uint8Array(event.data);
        if (data.length === 0) return;

        const msgType = data[0];
        const payload = data.slice(1);

        if (msgType === 48) {
          // '0' = Output message - write to terminal with flow control
          const decoder = new TextDecoder();
          const text = decoder.decode(payload);
          writeWithFlowControl(text, payload.length);
        }
        // '1' (49) = title, '2' (50) = prefs - ignored for now
      };

      // Flow control: write data with watermark-based backpressure
      function writeWithFlowControl(text: string, byteLength: number) {
        if (!xtermRef.current) return;

        pendingDataRef.current += byteLength;

        // Show buffering indicator when approaching high watermark
        if (pendingDataRef.current > HIGH_WATERMARK * 0.8 && !isBuffering) {
          setIsBuffering(true);
        }

        // Write with callback to track when data is processed
        xtermRef.current.write(text, () => {
          pendingDataRef.current -= byteLength;

          // Resume if we've dropped below low watermark
          if (isPausedRef.current && pendingDataRef.current < LOW_WATERMARK) {
            isPausedRef.current = false;
            setIsBuffering(false);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "flow", ready: true }));
            }
          }
        });

        // Pause if we've exceeded high watermark
        if (!isPausedRef.current && pendingDataRef.current > HIGH_WATERMARK) {
          isPausedRef.current = true;
          setIsBuffering(true);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "flow", ready: false }));
          }
        }
      }

      ws.onclose = (event) => {
        console.log(`[XTerminal] WebSocket closed: ${event.code} ${event.reason}`);
        wsRef.current = null;

        // Reset flow control state on disconnect
        setIsBuffering(false);
        pendingDataRef.current = 0;
        isPausedRef.current = false;

        if (event.code !== 1000) {
          // Abnormal close, attempt reconnect
          setConnectionState("disconnected");
          onDisconnect?.();

          if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptRef.current += 1;
            console.log(
              `[XTerminal] Reconnecting in ${RECONNECT_DELAY_MS}ms (attempt ${reconnectAttemptRef.current})`
            );
            reconnectTimeoutRef.current = setTimeout(() => {
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
  }, [wsUrl, onConnect, onDisconnect, onError]);

  // Initialize terminal
  useEffect(() => {
    let term: Terminal | null = null;
    let fitAddon: FitAddon | null = null;

    const initTerminal = async () => {
      if (!terminalRef.current) return;

      // Prevent double initialization from React StrictMode
      // Use module-level WeakSet for synchronous check that survives React's lifecycle
      if (initializedContainers.has(terminalRef.current)) {
        return;
      }
      initializedContainers.add(terminalRef.current);

      // Clear any existing terminal content
      terminalRef.current.innerHTML = "";

      // Dynamically import xterm modules (client-side only)
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { ClipboardAddon } = await import("@xterm/addon-clipboard");

      term = new Terminal({
        cursorBlink: false, // Saves periodic renders
        cursorStyle: "block",
        fontSize: 14,
        lineHeight: 1.2,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
        scrollback: 2000, // ~12MB memory, practical history
        logLevel: "warn", // Reduce console overhead
        drawBoldTextInBrightColors: false, // Reduce repaint cost
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

      // Clipboard addon for copy/paste support
      const clipboardAddon = new ClipboardAddon();
      term.loadAddon(clipboardAddon);

      term.open(terminalRef.current);

      // WebGL renderer with Canvas fallback (3-5x faster than DOM)
      try {
        const { WebglAddon } = await import("@xterm/addon-webgl");
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => {
          console.warn("[XTerminal] WebGL context lost, falling back to Canvas");
          webgl.dispose();
          webglAddonRef.current = null;
          // Fallback to Canvas on context loss
          import("@xterm/addon-canvas").then(({ CanvasAddon }) => {
            if (term) {
              term.loadAddon(new CanvasAddon());
            }
          });
        });
        term.loadAddon(webgl);
        webglAddonRef.current = webgl;
        console.log("[XTerminal] Using WebGL renderer");
      } catch (e) {
        console.warn("[XTerminal] WebGL not available, trying Canvas:", e);
        try {
          const { CanvasAddon } = await import("@xterm/addon-canvas");
          term.loadAddon(new CanvasAddon());
          console.log("[XTerminal] Using Canvas renderer");
        } catch (canvasError) {
          console.warn("[XTerminal] Canvas not available, using DOM renderer:", canvasError);
        }
      }

      // Web links addon for clickable URLs
      try {
        const { WebLinksAddon } = await import("@xterm/addon-web-links");
        term.loadAddon(new WebLinksAddon());
      } catch (e) {
        console.warn("[XTerminal] Web links addon not available:", e);
      }

      // Prevent browser from capturing Ctrl+W/T/N/L (critical for vim/tmux)
      term.attachCustomKeyEventHandler((event) => {
        if (event.ctrlKey && ["w", "t", "n", "l"].includes(event.key.toLowerCase())) {
          // Prevent browser from handling (e.g., Ctrl+W closing tab)
          event.preventDefault();
          // Return true to let xterm process the key
          return true;
        }
        return true;
      });

      fitAddon.fit();

      // Handle terminal input - ttyd expects '0' + data as text string
      term.onData((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          // ttyd input protocol: '0' prefix + data as text
          wsRef.current.send("0" + data);
        }
      });

      // Handle terminal resize - ttyd expects JSON text
      term.onResize(({ cols, rows }) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ columns: cols, rows: rows }));
        }
      });

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Connect after terminal is ready
      connect();
    };

    initTerminal();

    // Handle window resize with debouncing to avoid excessive fit() calls
    const debouncedFit = debounce(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }, 100);

    window.addEventListener("resize", debouncedFit);

    return () => {
      window.removeEventListener("resize", debouncedFit);

      // Cleanup reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      // Close WebSocket
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounting");
        wsRef.current = null;
      }

      // Dispose WebGL addon to free up context (browsers limit to ~16)
      // Use try-catch because addon may already be disposed by terminal or context loss
      if (webglAddonRef.current) {
        try {
          webglAddonRef.current.dispose();
        } catch {
          // Already disposed, ignore
        }
        webglAddonRef.current = null;
      }

      // Dispose terminal and clear container
      if (term) {
        term.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      }

      // Clear the container and remove from tracking
      // This allows re-initialization on the next mount cycle
      if (terminalRef.current) {
        terminalRef.current.innerHTML = "";
        initializedContainers.delete(terminalRef.current);
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
        return "Connecting...";
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
          {/* Flow control buffering indicator */}
          {isBuffering && (
            <span
              style={{
                color: "var(--warning)",
                fontSize: "0.5625rem",
                animation: "pulse 1s ease-in-out infinite",
              }}
            >
              Buffering...
            </span>
          )}
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
