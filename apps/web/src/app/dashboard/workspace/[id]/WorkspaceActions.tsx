"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getApiUrl, fetchRuntimeConfig } from "@/lib/config";

interface WorkspaceActionsProps {
  workspaceId: string;
  canStart: boolean;
  canStop: boolean;
  canSuspend: boolean;
}

export default function WorkspaceActions({
  workspaceId,
  canStart,
  canStop,
  canSuspend,
}: WorkspaceActionsProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  async function performAction(action: "start" | "stop" | "suspend") {
    setIsLoading(action);

    try {
      // Fetch runtime config first (for production URL)
      await fetchRuntimeConfig();

      const token = await getToken();

      const res = await fetch(`${getApiUrl()}/api/v1/workspaces/${workspaceId}/${action}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} workspace`);
      }

      // Refresh the page to show updated status
      router.refresh();
    } catch (error) {
      console.error(`Error performing ${action}:`, error);
      alert(error instanceof Error ? error.message : `Failed to ${action}`);
    } finally {
      setIsLoading(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      {canStart && (
        <button
          onClick={() => performAction("start")}
          disabled={isLoading !== null}
          className="primary"
          style={{
            background: "var(--success)",
            borderColor: "var(--success)",
          }}
        >
          {isLoading === "start" ? <span className="loading-text">Starting</span> : "▶ Start"}
        </button>
      )}

      {canStop && (
        <button
          onClick={() => performAction("stop")}
          disabled={isLoading !== null}
          style={{
            background: "var(--warning)",
            borderColor: "var(--warning)",
            color: "var(--background)",
          }}
        >
          {isLoading === "stop" ? <span className="loading-text">Stopping</span> : "■ Stop"}
        </button>
      )}

      {canSuspend && (
        <button
          onClick={() => performAction("suspend")}
          disabled={isLoading !== null}
          className="ghost"
        >
          {isLoading === "suspend" ? <span className="loading-text">Suspending</span> : "⏸ Suspend"}
        </button>
      )}
    </div>
  );
}
