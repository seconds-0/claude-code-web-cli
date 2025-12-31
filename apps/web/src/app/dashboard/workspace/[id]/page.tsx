import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import WorkspaceActions from "./WorkspaceActions";
import Terminal from "@/components/Terminal";
import StatusBadge from "@/components/StatusBadge";
import { PanelStat } from "@/components/Panel";
import WorkspaceStatusPoller from "@/components/WorkspaceStatusPoller";
import { getApiUrl } from "@/lib/config";

interface Workspace {
  id: string;
  name: string;
  status: "pending" | "provisioning" | "ready" | "suspended";
  createdAt: string;
  updatedAt: string;
  volume?: {
    id: string;
    sizeGb: number;
    status: string;
  };
  instance?: {
    id: string;
    status: "pending" | "starting" | "running" | "stopping" | "stopped";
    ipAddress?: string;
  };
}

async function getWorkspace(id: string, token: string): Promise<Workspace | null> {
  try {
    const res = await fetch(`${getApiUrl()}/api/v1/workspaces/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      console.error("Failed to fetch workspace:", res.status);
      return null;
    }

    const data = await res.json();
    return data.workspace;
  } catch (error) {
    console.error("Error fetching workspace:", error);
    return null;
  }
}

export default async function WorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    notFound();
  }

  const workspace = await getWorkspace(id, token);

  if (!workspace) {
    notFound();
  }

  const canStart =
    workspace.status === "pending" ||
    workspace.status === "suspended" ||
    workspace.instance?.status === "stopped" ||
    (workspace.status === "ready" && !workspace.instance);
  const canStop = workspace.instance?.status === "running";
  const canSuspend = workspace.status === "ready" && workspace.instance?.status === "running";
  const isTerminalReady = workspace.instance?.status === "running";

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Status poller for automatic updates during provisioning */}
      <WorkspaceStatusPoller
        workspaceStatus={workspace.status}
        instanceStatus={workspace.instance?.status}
      />

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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "2rem",
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
            WS.{workspace.id.slice(0, 8).toUpperCase()} / CONTROL_PANEL
          </div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              marginBottom: "0.75rem",
            }}
          >
            {workspace.name}
          </h1>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <StatusBadge status={workspace.status} />
            {workspace.instance && (
              <StatusBadge
                status={workspace.instance.status}
                label={`VM:${workspace.instance.status}`}
              />
            )}
          </div>
        </div>

        <WorkspaceActions
          workspaceId={workspace.id}
          canStart={canStart}
          canStop={canStop}
          canSuspend={canSuspend}
        />
      </div>

      {/* Terminal Section */}
      <div className="terminal-container" style={{ marginBottom: "2rem" }}>
        <div className="terminal-header">
          <span>TERMINAL.01 / {workspace.name.toUpperCase().replace(/\s+/g, "_")}</span>
          {isTerminalReady && workspace.instance?.ipAddress ? (
            <span style={{ color: "var(--success)" }}>● CONNECTED</span>
          ) : (
            <span style={{ color: "var(--muted)" }}>○ OFFLINE</span>
          )}
        </div>
        <div className="terminal-screen" style={{ height: "400px" }}>
          {isTerminalReady && workspace.instance?.ipAddress ? (
            <Terminal workspaceId={workspace.id} ipAddress={workspace.instance.ipAddress} />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  color: "var(--muted)",
                  marginBottom: "1rem",
                }}
              >
                AWAITING_CONNECTION
              </div>
              <p style={{ color: "var(--muted)", marginBottom: "0.5rem" }}>
                Workspace is not running
              </p>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  color: "var(--muted)",
                }}
              >
                Start the workspace to access terminal
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Info Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1px",
          background: "var(--border)",
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ background: "var(--surface)" }}>
          <PanelStat
            label="STORAGE"
            value={`${workspace.volume?.sizeGb || 20} GB`}
            subValue={workspace.volume?.status || "pending"}
          />
        </div>

        <div style={{ background: "var(--surface)" }}>
          <PanelStat
            label="CREATED"
            value={new Date(workspace.createdAt).toLocaleDateString()}
            subValue={new Date(workspace.createdAt).toLocaleTimeString()}
          />
        </div>

        <div style={{ background: "var(--surface)" }}>
          <PanelStat
            label="LAST_UPDATED"
            value={new Date(workspace.updatedAt).toLocaleDateString()}
            subValue={new Date(workspace.updatedAt).toLocaleTimeString()}
          />
        </div>

        <div style={{ background: "var(--surface)" }}>
          <div style={{ padding: "1rem" }}>
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
              WORKSPACE_ID
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                wordBreak: "break-all",
                color: "var(--foreground)",
              }}
            >
              {workspace.id}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: "2rem",
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: "0.625rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--muted)",
        }}
      >
        <span>IP: {workspace.instance?.ipAddress || "NOT_ASSIGNED"}</span>
        <span>INSTANCE: {workspace.instance?.id?.slice(0, 8) || "NONE"}</span>
      </div>
    </div>
  );
}
