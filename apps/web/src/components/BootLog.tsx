"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { getApiUrl, fetchRuntimeConfig } from "@/lib/config";

interface BootLogProps {
  workspaceId: string;
  canStart: boolean;
  onReady: () => void;
  isAlreadyStarting?: boolean; // True when workspace is already provisioning/starting
}

interface LogEntry {
  timestamp: string;
  message: string;
  status: "pending" | "running" | "done" | "error";
  subStatus?: string;
}

type BootPhase = "idle" | "starting" | "provisioning" | "connecting" | "ready" | "error";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export default function BootLog({
  workspaceId,
  canStart,
  onReady,
  isAlreadyStarting = false,
}: BootLogProps) {
  const { getToken } = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState<BootPhase>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const hasStarted = useRef(false);
  const isMounted = useRef(true); // Track if component is mounted
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track mounted state for cleanup
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Spinner animation
  useEffect(() => {
    if (phase !== "idle" && phase !== "ready" && phase !== "error") {
      const interval = setInterval(() => {
        setSpinnerIndex((i) => (i + 1) % SPINNER_FRAMES.length);
      }, 80);
      return () => clearInterval(interval);
    }
  }, [phase]);

  // Format timestamp
  const getTimestamp = () => {
    return new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Add log entry
  const addLog = useCallback((message: string, status: LogEntry["status"] = "running") => {
    setLogs((prev) => [...prev, { timestamp: getTimestamp(), message, status }]);
  }, []);

  // Update last log entry
  const updateLastLog = useCallback((updates: Partial<LogEntry>) => {
    setLogs((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[updated.length - 1] = { ...updated[updated.length - 1], ...updates };
      return updated;
    });
  }, []);

  // Auto-start workspace OR just poll if already starting
  useEffect(() => {
    if (hasStarted.current) return;
    if (!canStart && !isAlreadyStarting) return;
    hasStarted.current = true;

    async function startWorkspace() {
      try {
        await fetchRuntimeConfig();
        const token = await getToken();

        // If already starting, just begin polling without calling start API
        if (isAlreadyStarting && !canStart) {
          if (!isMounted.current) return; // Don't start polling if unmounted
          setPhase("provisioning");
          addLog("Resuming workspace startup...");
          setProgress(30);
          startPolling(token!);
          return;
        }

        // Otherwise, call start API
        setPhase("starting");
        addLog("Initializing workspace session...");
        setProgress(10);

        const res = await fetch(`${getApiUrl()}/api/v1/workspaces/${workspaceId}/start`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to start workspace");
        }

        if (!isMounted.current) return; // Don't continue if unmounted
        updateLastLog({ status: "done" });
        addLog("Requesting cloud instance...");
        setProgress(25);
        setPhase("provisioning");

        // Start polling for status
        if (isMounted.current) {
          startPolling(token!);
        }
      } catch (err) {
        updateLastLog({ status: "error" });
        setError(err instanceof Error ? err.message : "Failed to start");
        setPhase("error");
      }
    }

    startWorkspace();

    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, [canStart, isAlreadyStarting, workspaceId, getToken, addLog, updateLastLog]);

  // Poll for status updates
  const startPolling = useCallback(
    (token: string) => {
      let instanceStarted = false;
      let networkConfigured = false;

      pollInterval.current = setInterval(async () => {
        // Stop polling if component unmounted
        if (!isMounted.current) {
          if (pollInterval.current) {
            clearInterval(pollInterval.current);
          }
          return;
        }

        try {
          const res = await fetch(`${getApiUrl()}/api/v1/workspaces/${workspaceId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!res.ok) return;

          const data = await res.json();
          const instanceStatus = data.instance?.status;

          if (instanceStatus === "starting" && !instanceStarted) {
            instanceStarted = true;
            if (!isMounted.current) return;
            updateLastLog({ status: "done" });
            addLog("Instance allocated (region: ash)");
            updateLastLog({ status: "done" });
            addLog("Configuring network...");
            setProgress(50);
          }

          if (instanceStatus === "running" && !networkConfigured) {
            networkConfigured = true;
            if (!isMounted.current) return;
            updateLastLog({ status: "done" });
            addLog("Starting services...");
            setProgress(75);
            setPhase("connecting");
          }

          // Check for running with either tailscaleIp or ipAddress (public IP)
          const hasIpAddress = data.instance?.tailscaleIp || data.instance?.ipAddress;
          if (instanceStatus === "running" && hasIpAddress) {
            updateLastLog({ status: "done" });
            addLog("Establishing secure connection...");
            setProgress(90);

            // Brief pause then mark ready
            setTimeout(() => {
              if (!isMounted.current) return; // Don't update if unmounted
              updateLastLog({ status: "done" });
              addLog("Environment ready.", "done");
              setProgress(100);
              setPhase("ready");

              if (pollInterval.current) {
                clearInterval(pollInterval.current);
              }

              // Trigger server component refresh to update isReady prop
              router.refresh();

              // Trigger transition after brief pause
              setTimeout(() => {
                if (isMounted.current) {
                  onReady();
                }
              }, 500);
            }, 300);
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 2000);
    },
    [workspaceId, addLog, updateLastLog, onReady, router]
  );

  // Retry handler
  const handleRetry = () => {
    hasStarted.current = false;
    setLogs([]);
    setError(null);
    setPhase("idle");
    setProgress(0);
    // Re-trigger the effect
    window.location.reload();
  };

  return (
    <div className="boot-log">
      {/* Progress bar */}
      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {/* Log entries */}
      <div className="log-content">
        {logs.length === 0 && phase === "idle" && (
          <div className="log-entry idle">
            <span className="log-message">Preparing to start workspace...</span>
          </div>
        )}

        {logs.map((entry, i) => (
          <div key={i} className={`log-entry ${entry.status}`}>
            <span className="log-timestamp">[{entry.timestamp}]</span>
            <span className="log-status">
              {entry.status === "done" && <span className="status-icon done">✓</span>}
              {entry.status === "running" && (
                <span className="status-icon running">{SPINNER_FRAMES[spinnerIndex]}</span>
              )}
              {entry.status === "error" && <span className="status-icon error">✗</span>}
              {entry.status === "pending" && <span className="status-icon pending">○</span>}
            </span>
            <span className="log-message">{entry.message}</span>
          </div>
        ))}

        {/* Error state */}
        {error && (
          <div className="error-container">
            <div className="error-message">ERROR: {error}</div>
            <button onClick={handleRetry} className="retry-button">
              Retry
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .boot-log {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #0d0d0d;
          font-family: var(--font-mono);
          position: relative;
        }

        .progress-bar-container {
          height: 3px;
          background: var(--border);
          overflow: hidden;
        }

        .progress-bar {
          height: 100%;
          background: var(--primary);
          transition: width 0.3s ease-out;
        }

        .log-content {
          flex: 1;
          padding: 1.5rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .log-entry {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          font-size: 0.8125rem;
          line-height: 1.5;
        }

        .log-entry.idle {
          color: var(--muted);
          justify-content: center;
          padding-top: 2rem;
        }

        .log-timestamp {
          color: var(--muted);
          flex-shrink: 0;
        }

        .log-status {
          width: 1rem;
          text-align: center;
          flex-shrink: 0;
        }

        .status-icon.done {
          color: var(--success);
        }

        .status-icon.running {
          color: var(--primary);
        }

        .status-icon.error {
          color: var(--error);
        }

        .status-icon.pending {
          color: var(--muted);
        }

        .log-message {
          color: var(--foreground);
        }

        .log-entry.done .log-message {
          color: var(--muted);
        }

        .log-entry.running .log-message {
          color: var(--foreground);
        }

        .error-container {
          margin-top: 1.5rem;
          padding: 1rem;
          background: rgba(255, 100, 100, 0.1);
          border: 1px solid var(--error);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .error-message {
          color: var(--error);
          font-size: 0.75rem;
        }

        .retry-button {
          background: transparent;
          border: 1px solid var(--error);
          color: var(--error);
          padding: 0.5rem 1rem;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .retry-button:hover {
          background: var(--error);
          color: var(--background);
        }

        @media (max-width: 768px) {
          .log-content {
            padding: 1rem;
          }

          .log-entry {
            font-size: 0.75rem;
          }

          .log-timestamp {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
