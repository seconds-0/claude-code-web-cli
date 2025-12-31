"use client";

import { useState, useTransition } from "react";
import { useAuth } from "@clerk/nextjs";

interface PrivateModeToggleProps {
  workspaceId: string;
  initialValue: boolean;
}

export default function PrivateModeToggle({ workspaceId, initialValue }: PrivateModeToggleProps) {
  const [privateMode, setPrivateMode] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  const handleToggle = async () => {
    setError(null);
    const newValue = !privateMode;

    startTransition(async () => {
      try {
        const token = await getToken();
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

        const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ privateMode: newValue }),
        });

        if (!res.ok) {
          throw new Error("Failed to update setting");
        }

        setPrivateMode(newValue);
      } catch {
        setError("Failed to update setting");
      }
    });
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        padding: "1.25rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.625rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--muted)",
              marginBottom: "0.5rem",
            }}
          >
            NETWORK_MODE
          </div>
          <div
            style={{
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            {privateMode ? "Private Mode" : "Direct Connect"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              color: "var(--muted)",
              lineHeight: 1.5,
            }}
          >
            {privateMode ? (
              <>
                Tailscale-only networking. VM has no public IP.
                <br />
                Higher latency (~300ms) but maximum security.
              </>
            ) : (
              <>
                Low-latency terminal access (~50ms).
                <br />
                VM has public IP, protected by JWT + TLS.
              </>
            )}
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={isPending}
          style={{
            background: privateMode ? "var(--warning)" : "var(--surface)",
            color: privateMode ? "#000" : "var(--foreground)",
            border: "1px solid var(--border)",
            padding: "0.5rem 1rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            cursor: isPending ? "wait" : "pointer",
            opacity: isPending ? 0.5 : 1,
            minWidth: "8rem",
            transition: "all 0.15s ease",
          }}
        >
          {isPending ? "..." : privateMode ? "PRIVATE" : "DIRECT"}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.5rem",
            background: "rgba(255, 0, 0, 0.1)",
            border: "1px solid rgba(255, 0, 0, 0.3)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      )}

      {!privateMode && (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.5rem",
            background: "rgba(255, 200, 0, 0.1)",
            border: "1px solid rgba(255, 200, 0, 0.3)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.625rem",
            color: "var(--warning)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Enable Private Mode for Tailscale-only networking (adds ~250ms latency)
        </div>
      )}
    </div>
  );
}
