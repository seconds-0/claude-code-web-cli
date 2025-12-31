"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import Panel, { PanelContent } from "@/components/Panel";
import { getApiUrl } from "@/lib/config";

export default function NewWorkspacePage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();

      const res = await fetch(`${getApiUrl()}/api/v1/workspaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name || "My Workspace" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create workspace");
      }

      const data = await res.json();
      router.push(`/dashboard/workspace/${data.workspace.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/dashboard"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--muted)",
          }}
        >
          ← WORKSPACES
        </Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
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
          INIT.01 / NEW_WORKSPACE
        </div>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          Initialize Workspace
        </h1>
      </div>

      <Panel label="CONFIG.01" title="Workspace Configuration">
        <PanelContent>
          <form onSubmit={handleSubmit}>
            {/* Name Field */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                htmlFor="name"
                style={{
                  display: "block",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.625rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--muted)",
                  marginBottom: "0.5rem",
                }}
              >
                INPUT.01 / WORKSPACE_NAME
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-workspace"
                autoFocus
              />
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.625rem",
                  color: "var(--muted)",
                  marginTop: "0.5rem",
                }}
              >
                Alphanumeric and hyphens. Defaults to &quot;My Workspace&quot; if empty.
              </div>
            </div>

            {/* Specs Preview */}
            <div
              style={{
                padding: "1rem",
                background: "var(--background)",
                border: "1px solid var(--border)",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.625rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--primary)",
                  marginBottom: "0.75rem",
                }}
              >
                SPECIFICATIONS
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                }}
              >
                <div>
                  <span style={{ color: "var(--muted)" }}>STORAGE:</span> 50 GB
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>REGION:</span> AUTO
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>TIER:</span> SUSPEND
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>NETWORK:</span> DIRECT
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>CLAUDE:</span> INCLUDED
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>LATENCY:</span> ~50MS
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  padding: "0.75rem",
                  background: "var(--background)",
                  border: "1px solid var(--error)",
                  color: "var(--error)",
                  marginBottom: "1.5rem",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                }}
              >
                ERROR: {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button type="button" onClick={() => router.back()} className="ghost">
                Cancel
              </button>
              <button type="submit" className="primary" disabled={isLoading}>
                {isLoading ? <span className="loading-text">Initializing</span> : "Initialize →"}
              </button>
            </div>
          </form>
        </PanelContent>
      </Panel>
    </div>
  );
}
