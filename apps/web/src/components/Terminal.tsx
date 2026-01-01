"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { getApiUrl, fetchRuntimeConfig } from "@/lib/config";

// Dynamically import XTerminal to avoid SSR issues with xterm.js
const XTerminal = dynamic(() => import("./XTerminal"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--muted)",
      }}
    >
      Loading terminal...
    </div>
  ),
});

interface TerminalProps {
  workspaceId: string;
  ipAddress: string;
}

// Connection info - either direct connect URL or relay session token
interface ConnectionInfo {
  mode: "direct" | "relay";
  url: string;
  expiresAt?: string;
}

export default function Terminal({ workspaceId, ipAddress }: TerminalProps) {
  const { getToken } = useAuth();
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch connection info - try direct connect first, fall back to relay
  const fetchConnectionInfo = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch runtime config first (for production URL)
      await fetchRuntimeConfig();

      // Get Clerk auth token
      const authToken = await getToken();
      if (!authToken) {
        throw new Error("Not authenticated");
      }

      // Step 1: Try direct connect first (low latency)
      try {
        const directResponse = await fetch(
          `${getApiUrl()}/api/v1/workspaces/${workspaceId}/direct-connect`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          }
        );

        if (directResponse.ok) {
          const directData = await directResponse.json();
          if (directData.available && directData.directUrl) {
            console.log("[Terminal] Using direct connect for low latency");
            setConnectionInfo({
              mode: "direct",
              url: directData.directUrl,
              expiresAt: directData.expiresAt,
            });
            return;
          }
          // Not available (e.g., private mode) - fall through to relay
          console.log("[Terminal] Direct connect not available:", directData.reason || "unknown");
        }
      } catch (directErr) {
        console.warn("[Terminal] Direct connect check failed, falling back to relay:", directErr);
      }

      // Step 2: Fall back to relay connection
      const response = await fetch(`${getApiUrl()}/api/v1/workspaces/${workspaceId}/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || `Failed to get session token: ${response.status}`);
      }

      const data = await response.json();
      console.log("[Terminal] Using relay connection");
      setConnectionInfo({
        mode: "relay",
        url: data.wsUrl,
        expiresAt: data.expiresAt,
      });
    } catch (err) {
      console.error("Failed to fetch connection info:", err);
      setError(err instanceof Error ? err.message : "Failed to connect to terminal");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, getToken]);

  useEffect(() => {
    if (ipAddress) {
      fetchConnectionInfo();
    }
  }, [ipAddress, fetchConnectionInfo]);

  if (!ipAddress) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--muted)",
        }}
      >
        Waiting for workspace IP...
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--muted)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              marginBottom: "0.5rem",
            }}
          >
            INITIALIZING_SESSION
          </div>
          <p>Connecting to workspace...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--error)",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            marginBottom: "0.5rem",
          }}
        >
          CONNECTION_ERROR
        </div>
        <p style={{ marginBottom: "1rem" }}>{error}</p>
        <button
          onClick={fetchConnectionInfo}
          style={{
            padding: "0.5rem 1rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          RETRY
        </button>
      </div>
    );
  }

  if (!connectionInfo) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--muted)",
        }}
      >
        No connection info available
      </div>
    );
  }

  return (
    <XTerminal
      workspaceId={workspaceId}
      wsUrl={connectionInfo.url}
      connectionMode={connectionInfo.mode}
      onConnect={() => console.log(`Terminal connected via ${connectionInfo.mode}`)}
      onDisconnect={() => console.log("Terminal disconnected")}
      onError={(err) => setError(err)}
    />
  );
}
