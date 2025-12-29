import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

interface Workspace {
  id: string;
  name: string;
  status: "pending" | "provisioning" | "ready" | "suspended";
  createdAt: string;
  instance?: {
    status: "pending" | "starting" | "running" | "stopping" | "stopped";
  };
}

async function getWorkspaces(token: string): Promise<Workspace[]> {
  const apiUrl = process.env["CONTROL_PLANE_URL"] || "http://localhost:3001";

  try {
    const res = await fetch(`${apiUrl}/api/v1/workspaces`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("Failed to fetch workspaces:", res.status);
      return [];
    }

    const data = await res.json();
    return data.workspaces || [];
  } catch (error) {
    console.error("Error fetching workspaces:", error);
    return [];
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

export default async function DashboardPage() {
  const { getToken } = await auth();
  const token = await getToken();

  const workspaces = token ? await getWorkspaces(token) : [];

  return (
    <div className="container" style={{ paddingTop: "2rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <h1 style={{ fontSize: "1.75rem" }}>Workspaces</h1>
        <Link href="/dashboard/new">
          <button>New Workspace</button>
        </Link>
      </header>

      {workspaces.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "4rem 2rem",
            background: "var(--secondary)",
            borderRadius: "0.75rem",
            border: "1px solid var(--border)",
          }}
        >
          <h2 style={{ marginBottom: "0.5rem" }}>No workspaces yet</h2>
          <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
            Create your first workspace to get started with Claude Code Cloud.
          </p>
          <Link href="/dashboard/new">
            <button>Create Workspace</button>
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "1rem",
          }}
        >
          {workspaces.map((workspace) => (
            <Link
              key={workspace.id}
              href={`/dashboard/workspace/${workspace.id}`}
              style={{ display: "block" }}
            >
              <div
                style={{
                  background: "var(--secondary)",
                  padding: "1.25rem",
                  borderRadius: "0.75rem",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  transition: "border-color 0.2s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "0.5rem",
                  }}
                >
                  <h3 style={{ fontSize: "1.125rem" }}>{workspace.name}</h3>
                  <StatusBadge status={workspace.status} />
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    color: "var(--muted)",
                    fontSize: "0.875rem",
                  }}
                >
                  <span>Created {new Date(workspace.createdAt).toLocaleDateString()}</span>
                  {workspace.instance && <span>Instance: {workspace.instance.status}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
