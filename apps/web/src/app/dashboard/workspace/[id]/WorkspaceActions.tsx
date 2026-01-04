"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getApiUrl, fetchRuntimeConfig } from "@/lib/config";

interface WorkspaceActionsProps {
  workspaceId: string;
  workspaceName: string;
  canStart: boolean;
  canStop: boolean;
  canSuspend: boolean;
}

export default function WorkspaceActions({
  workspaceId,
  workspaceName,
  canStart,
  canStop,
  canSuspend,
}: WorkspaceActionsProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  async function handleDelete() {
    setIsLoading("delete");

    try {
      await fetchRuntimeConfig();
      const token = await getToken();

      const res = await fetch(`${getApiUrl()}/api/v1/workspaces/${workspaceId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete workspace");
      }

      // Redirect to dashboard after successful deletion
      router.push("/dashboard");
    } catch (error) {
      console.error("Error deleting workspace:", error);
      alert(error instanceof Error ? error.message : "Failed to delete workspace");
      setIsLoading(null);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      {canStart && (
        <button
          onClick={() => performAction("start")}
          disabled={isLoading !== null}
          style={{
            background: "var(--success)",
            borderColor: "var(--success)",
            color: "var(--background)",
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

      <button
        onClick={() => setShowDeleteConfirm(true)}
        disabled={isLoading !== null}
        className="ghost"
        style={{
          color: "var(--error)",
          borderColor: "var(--error)",
        }}
      >
        🗑 Delete
      </button>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              padding: "2rem",
              maxWidth: "400px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.625rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--error)",
                marginBottom: "0.5rem",
              }}
            >
              CONFIRM_DELETE
            </div>
            <h3 style={{ marginBottom: "1rem", fontSize: "1.25rem" }}>Delete Workspace?</h3>
            <p style={{ color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
              This will permanently delete <strong>{workspaceName}</strong> and all associated
              resources including the VM and storage volume. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isLoading === "delete"}
                className="ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isLoading === "delete"}
                style={{
                  background: "var(--error)",
                  borderColor: "var(--error)",
                }}
              >
                {isLoading === "delete" ? (
                  <span className="loading-text">Deleting</span>
                ) : (
                  "Delete Workspace"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
