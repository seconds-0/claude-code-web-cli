"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Panel, { PanelContent } from "@/components/Panel";
import { getApiUrl, fetchRuntimeConfig } from "@/lib/config";

type SetupPhase = "creating" | "provisioning" | "connecting" | "ready" | "error";

interface BootLogEntry {
  timestamp: string;
  message: string;
  status: "pending" | "running" | "done" | "error";
}

export default function SetupPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [phase, setPhase] = useState<SetupPhase>("creating");
  const [error, setError] = useState<string | null>(null);
  const [bootLog, setBootLog] = useState<BootLogEntry[]>([]);
  const hasStarted = useRef(false);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Add a log entry
  const addLog = (message: string, status: BootLogEntry["status"] = "running") => {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setBootLog((prev) => [...prev, { timestamp, message, status }]);
  };

  // Update the last log entry status
  const updateLastLog = (status: BootLogEntry["status"]) => {
    setBootLog((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[updated.length - 1] = { ...updated[updated.length - 1], status };
      return updated;
    });
  };

  // Create workspace and start provisioning
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    async function setup() {
      try {
        // Fetch runtime config first (for production URL)
        await fetchRuntimeConfig();

        addLog("Initializing workspace...");
        const token = await getToken();

        // Create workspace with autoStart
        const res = await fetch(`${getApiUrl()}/api/v1/workspaces`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: "My Workspace",
            autoStart: true,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Failed to create workspace");
        }

        const data = await res.json();
        updateLastLog("done");

        // Start polling for status
        addLog("Allocating storage volume...");
        setPhase("provisioning");
        startPolling(data.workspace.id, token!);
      } catch (err) {
        updateLastLog("error");
        setError(err instanceof Error ? err.message : "Setup failed");
        setPhase("error");
      }
    }

    setup();

    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, [getToken]);

  // Poll for workspace status
  const startPolling = (wsId: string, token: string) => {
    let volumeLogged = false;
    let instanceLogged = false;
    let networkLogged = false;

    pollInterval.current = setInterval(async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/v1/workspaces/${wsId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) return;

        const data = await res.json();
        const instanceStatus = data.instance?.status;
        const workspaceStatus = data.workspace?.status;

        // Log progress based on status changes
        if (workspaceStatus === "provisioning" && !volumeLogged) {
          volumeLogged = true;
          updateLastLog("done");
          addLog("Starting cloud instance...");
        }

        if (instanceStatus === "starting" && !instanceLogged) {
          instanceLogged = true;
          updateLastLog("done");
          addLog("Configuring network...");
        }

        if (instanceStatus === "running" && !networkLogged) {
          networkLogged = true;
          updateLastLog("done");
          addLog("Establishing secure connection...");
          setPhase("connecting");
        }

        // Check if ready
        if (instanceStatus === "running" && data.instance?.tailscaleIp) {
          updateLastLog("done");
          addLog("Environment ready!", "done");
          setPhase("ready");

          if (pollInterval.current) {
            clearInterval(pollInterval.current);
          }

          // Redirect to workspace after brief delay
          setTimeout(() => {
            router.push(`/dashboard/workspace/${wsId}`);
          }, 1000);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);
  };

  return (
    <div
      style={{
        padding: "2rem",
        maxWidth: "600px",
        margin: "0 auto",
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Panel label="INIT.00" title="Setting Up Your Environment">
        <PanelContent>
          {/* Boot sequence log */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.8125rem",
              lineHeight: 1.8,
              background: "var(--background)",
              padding: "1.5rem",
              border: "1px solid var(--border)",
              minHeight: "200px",
              maxHeight: "300px",
              overflow: "auto",
            }}
          >
            {bootLog.map((entry, i) => (
              <div key={i} style={{ display: "flex", gap: "1rem" }}>
                <span style={{ color: "var(--muted)" }}>[{entry.timestamp}]</span>
                <span
                  style={{
                    color:
                      entry.status === "done"
                        ? "var(--success)"
                        : entry.status === "error"
                          ? "var(--error)"
                          : "var(--foreground)",
                  }}
                >
                  {entry.status === "running" && (
                    <span className="loading-text">{entry.message}</span>
                  )}
                  {entry.status === "done" && `${entry.message} [OK]`}
                  {entry.status === "error" && `${entry.message} [FAILED]`}
                  {entry.status === "pending" && entry.message}
                </span>
              </div>
            ))}
            {phase !== "error" && phase !== "ready" && (
              <div style={{ marginTop: "0.5rem" }}>
                <span style={{ color: "var(--primary)" }}>█</span>
              </div>
            )}
          </div>

          {/* Status indicator */}
          <div
            style={{
              marginTop: "1.5rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: "var(--font-mono)",
              fontSize: "0.625rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--muted)",
            }}
          >
            <span>
              STATUS:{" "}
              <span
                style={{
                  color:
                    phase === "ready"
                      ? "var(--success)"
                      : phase === "error"
                        ? "var(--error)"
                        : "var(--primary)",
                }}
              >
                {phase.toUpperCase()}
              </span>
            </span>
            {phase === "ready" && <span style={{ color: "var(--success)" }}>Redirecting...</span>}
          </div>

          {/* Error state */}
          {error && (
            <div
              style={{
                marginTop: "1.5rem",
                padding: "1rem",
                background: "var(--background)",
                border: "1px solid var(--error)",
                color: "var(--error)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
              }}
            >
              ERROR: {error}
              <button
                onClick={() => window.location.reload()}
                style={{ marginLeft: "1rem" }}
                className="ghost"
              >
                Retry
              </button>
            </div>
          )}
        </PanelContent>
      </Panel>
    </div>
  );
}
