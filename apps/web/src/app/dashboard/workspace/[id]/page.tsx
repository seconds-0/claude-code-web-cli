import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import WorkspaceActions from "./WorkspaceActions";
import Terminal from "@/components/Terminal";

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
  const apiUrl = process.env["CONTROL_PLANE_URL"] || "http://localhost:3001";

  try {
    const res = await fetch(`${apiUrl}/api/v1/workspaces/${id}`, {
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

function getStatusColor(status: string): string {
  switch (status) {
    case "ready":
    case "running":
      return "var(--success)";
    case "provisioning":
    case "starting":
      return "var(--warning)";
    case "pending":
    case "stopping":
    case "suspended":
    case "stopped":
      return "var(--muted)";
    default:
      return "var(--muted)";
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.25rem 0.5rem",
        borderRadius: "0.25rem",
        fontSize: "0.75rem",
        fontWeight: 500,
        textTransform: "uppercase",
        background: `${getStatusColor(status)}20`,
        color: getStatusColor(status),
      }}
    >
      {status}
    </span>
  );
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
    workspace.instance?.status === "stopped";
  const canStop = workspace.instance?.status === "running";
  const canSuspend = workspace.status === "ready";
  const isTerminalReady = workspace.instance?.status === "running";

  return (
    <div className="container" style={{ paddingTop: "2rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/dashboard" style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
          ← Back to Workspaces
        </Link>
      </div>

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>{workspace.name}</h1>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <StatusBadge status={workspace.status} />
            {workspace.instance && <StatusBadge status={workspace.instance.status} />}
          </div>
        </div>

        <WorkspaceActions
          workspaceId={workspace.id}
          canStart={canStart}
          canStop={canStop}
          canSuspend={canSuspend}
        />
      </header>

      {/* Terminal Section */}
      <section
        style={{
          background: "var(--secondary)",
          borderRadius: "0.75rem",
          border: "1px solid var(--border)",
          marginBottom: "2rem",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "1rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ fontSize: "1rem" }}>Terminal</h2>
          {isTerminalReady && workspace.instance?.ipAddress && (
            <span style={{ color: "var(--success)", fontSize: "0.875rem" }}>Connected</span>
          )}
        </div>
        <div
          style={{
            height: "400px",
            background: "#000",
          }}
        >
          {isTerminalReady && workspace.instance?.ipAddress ? (
            <Terminal workspaceId={workspace.id} ipAddress={workspace.instance.ipAddress} />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--muted)",
                textAlign: "center",
              }}
            >
              <div>
                <p>Workspace is not running</p>
                <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
                  Start the workspace to access the terminal
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Info Section */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "1rem",
        }}
      >
        <div
          style={{
            background: "var(--secondary)",
            padding: "1.25rem",
            borderRadius: "0.75rem",
            border: "1px solid var(--border)",
          }}
        >
          <h3
            style={{
              fontSize: "0.875rem",
              color: "var(--muted)",
              marginBottom: "0.5rem",
            }}
          >
            Storage
          </h3>
          <p style={{ fontSize: "1.25rem", fontWeight: 500 }}>
            {workspace.volume?.sizeGb || 20} GB
          </p>
          <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
            {workspace.volume?.status || "pending"}
          </p>
        </div>

        <div
          style={{
            background: "var(--secondary)",
            padding: "1.25rem",
            borderRadius: "0.75rem",
            border: "1px solid var(--border)",
          }}
        >
          <h3
            style={{
              fontSize: "0.875rem",
              color: "var(--muted)",
              marginBottom: "0.5rem",
            }}
          >
            Created
          </h3>
          <p style={{ fontSize: "1.25rem", fontWeight: 500 }}>
            {new Date(workspace.createdAt).toLocaleDateString()}
          </p>
          <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
            {new Date(workspace.createdAt).toLocaleTimeString()}
          </p>
        </div>

        <div
          style={{
            background: "var(--secondary)",
            padding: "1.25rem",
            borderRadius: "0.75rem",
            border: "1px solid var(--border)",
          }}
        >
          <h3
            style={{
              fontSize: "0.875rem",
              color: "var(--muted)",
              marginBottom: "0.5rem",
            }}
          >
            Workspace ID
          </h3>
          <p
            style={{
              fontSize: "0.875rem",
              fontFamily: "monospace",
              wordBreak: "break-all",
            }}
          >
            {workspace.id}
          </p>
        </div>
      </section>
    </div>
  );
}
