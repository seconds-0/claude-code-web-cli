"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { getApiUrl } from "@/lib/config";

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

export default function Terminal({ workspaceId, ipAddress }: TerminalProps) {
  const { getToken } = useAuth();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch session token from API
  const fetchSessionToken = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get Clerk auth token
      const authToken = await getToken();
      if (!authToken) {
        throw new Error("Not authenticated");
      }

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
      setSessionToken(data.token);
    } catch (err) {
      console.error("Failed to fetch session token:", err);
      setError(err instanceof Error ? err.message : "Failed to connect to terminal");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, getToken]);

  useEffect(() => {
    if (ipAddress) {
      fetchSessionToken();
    }
  }, [ipAddress, fetchSessionToken]);

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
          onClick={fetchSessionToken}
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

  if (!sessionToken) {
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
        No session token available
      </div>
    );
  }

  return (
    <XTerminal
      workspaceId={workspaceId}
      sessionToken={sessionToken}
      onConnect={() => console.log("Terminal connected")}
      onDisconnect={() => console.log("Terminal disconnected")}
      onError={(err) => setError(err)}
    />
  );
}
