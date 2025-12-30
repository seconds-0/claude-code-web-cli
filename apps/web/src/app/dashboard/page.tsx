import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import Panel, { PanelContent } from "@/components/Panel";
import { getApiUrl } from "@/lib/config";

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
  try {
    const res = await fetch(`${getApiUrl()}/api/v1/workspaces`, {
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

export default async function DashboardPage() {
  const { getToken } = await auth();
  const token = await getToken();

  const workspaces = token ? await getWorkspaces(token) : [];

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Page Header */}
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
            CTRL.01 / WORKSPACE_MANAGER
          </div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Workspaces
          </h1>
        </div>
        <Link href="/dashboard/new">
          <button className="primary">+ New Workspace</button>
        </Link>
      </div>

      {workspaces.length === 0 ? (
        <Panel label="INIT.00" title="No Workspaces">
          <PanelContent
            style={{
              textAlign: "center",
              padding: "3rem 2rem",
            }}
            className="dot-grid"
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                color: "var(--muted)",
                marginBottom: "1rem",
              }}
            >
              NO_INSTANCES_FOUND
            </div>
            <p style={{ marginBottom: "1.5rem", color: "var(--muted)" }}>
              Create your first workspace to initialize a cloud dev environment.
            </p>
            <Link href="/dashboard/new">
              <button className="primary">Initialize Workspace</button>
            </Link>
          </PanelContent>
        </Panel>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "1px",
            background: "var(--border)",
            border: "1px solid var(--border)",
          }}
        >
          {workspaces.map((workspace, index) => (
            <Link
              key={workspace.id}
              href={`/dashboard/workspace/${workspace.id}`}
              style={{ display: "block" }}
            >
              <div
                className="workspace-card"
                style={{
                  padding: "1.25rem",
                  cursor: "pointer",
                  transition: "background var(--transition)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.625rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          color: "var(--primary)",
                        }}
                      >
                        WS.{String(index + 1).padStart(2, "0")}
                      </span>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "1rem",
                        }}
                      >
                        {workspace.name}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.75rem",
                        color: "var(--muted)",
                      }}
                    >
                      Created {new Date(workspace.createdAt).toLocaleDateString()} •{" "}
                      <span style={{ fontFamily: "var(--font-mono)" }}>
                        {workspace.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      alignItems: "center",
                    }}
                  >
                    <StatusBadge status={workspace.status} />
                    {workspace.instance && (
                      <StatusBadge
                        status={workspace.instance.status}
                        label={`VM:${workspace.instance.status}`}
                      />
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Footer stats */}
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
        <span>
          TOTAL: {workspaces.length} WORKSPACE{workspaces.length !== 1 ? "S" : ""}
        </span>
        <span>ACTIVE: {workspaces.filter((w) => w.instance?.status === "running").length}</span>
      </div>
    </div>
  );
}
