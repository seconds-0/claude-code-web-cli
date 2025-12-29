"use client";

import { useEffect, useRef, useState } from "react";

interface TerminalProps {
  workspaceId: string;
  ipAddress: string;
  sessionToken?: string;
}

export default function Terminal({ workspaceId, ipAddress, sessionToken }: TerminalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ttyd runs on the user box and is accessed through the gateway
  // The gateway proxies WebSocket connections to the user's Tailscale IP
  const gatewayUrl = process.env["NEXT_PUBLIC_GATEWAY_URL"] || "";

  useEffect(() => {
    // For now, we'll use an iframe pointing to the ttyd instance
    // In production, the gateway would proxy this connection securely
    // with session token authentication

    if (!ipAddress) {
      setError("No IP address available");
      return;
    }

    // The ttyd URL would be proxied through the gateway in production
    // Format: wss://gateway.domain/terminal/{workspaceId}?token={sessionToken}
    setIsConnected(true);
  }, [ipAddress, workspaceId, sessionToken]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--error)",
        }}
      >
        {error}
      </div>
    );
  }

  // In development, show a placeholder
  // In production, this would be an iframe to the gateway's terminal proxy
  // or we'd use xterm.js with a WebSocket connection
  const terminalUrl = gatewayUrl
    ? `${gatewayUrl}/terminal/${workspaceId}?token=${sessionToken || ""}`
    : null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#000",
        position: "relative",
      }}
    >
      {terminalUrl ? (
        <iframe
          ref={iframeRef}
          src={terminalUrl}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
          }}
          title={`Terminal for workspace ${workspaceId}`}
        />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--muted)",
            textAlign: "center",
            padding: "2rem",
          }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            <span style={{ color: "var(--success)" }}>$</span> claude-code
          </div>
          <p>Terminal connection ready</p>
          <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>Workspace: {workspaceId}</p>
          <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>IP: {ipAddress}</p>
          {isConnected && (
            <p
              style={{
                fontSize: "0.75rem",
                marginTop: "1rem",
                color: "var(--warning)",
              }}
            >
              Configure NEXT_PUBLIC_GATEWAY_URL to enable live terminal
            </p>
          )}
        </div>
      )}
    </div>
  );
}
