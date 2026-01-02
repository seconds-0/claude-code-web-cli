import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getApiUrl } from "@/lib/config";

// Skip prerendering - requires auth at runtime
export const dynamic = "force-dynamic";

interface CostSummary {
  currentHourlyBurn: number;
  currentHourlyBurnFormatted: string;
  runningServers: number;
  runningVolumes: number;
  todayCost: number;
  todayCostFormatted: string;
  monthCost: number;
  monthCostFormatted: string;
  projectedMonthCost: number;
  projectedMonthCostFormatted: string;
}

interface CostEvent {
  id: string;
  workspaceId: string | null;
  resourceType: string;
  resourceId: string;
  serverType: string | null;
  sizeGb: number | null;
  eventType: string;
  hourlyRate: number;
  hourlyRateFormatted: string;
  timestamp: string;
}

async function getCurrentCosts(token: string): Promise<CostSummary | null> {
  try {
    const res = await fetch(`${getApiUrl()}/api/v1/costs/current`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("Failed to fetch costs:", res.status);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error("Error fetching costs:", error);
    return null;
  }
}

async function getRecentEvents(token: string): Promise<CostEvent[]> {
  try {
    const res = await fetch(`${getApiUrl()}/api/v1/costs/events?limit=10`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("Failed to fetch events:", res.status);
      return [];
    }

    const data = await res.json();
    return data.events || [];
  } catch (error) {
    console.error("Error fetching events:", error);
    return [];
  }
}

export default async function CostsAdminPage() {
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    redirect("/sign-in");
  }

  const [costs, events] = await Promise.all([getCurrentCosts(token), getRecentEvents(token)]);

  const cardStyle = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "1.5rem",
  };

  const labelStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: "0.625rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    color: "var(--muted)",
    marginBottom: "0.5rem",
  };

  const valueStyle = {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "var(--foreground)",
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{ marginBottom: "2rem" }}>
        <Link
          href="/dashboard"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--muted)",
            textDecoration: "none",
            marginBottom: "1rem",
            display: "inline-block",
          }}
        >
          &larr; Back to Dashboard
        </Link>
        <div style={labelStyle}>ADMIN / COST_TRACKING</div>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--foreground)",
            margin: 0,
          }}
        >
          Hetzner Costs
        </h1>
      </div>

      {/* Current Costs Summary */}
      {costs && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <div style={cardStyle}>
              <div style={labelStyle}>Current Hourly Burn</div>
              <div style={valueStyle}>{costs.currentHourlyBurnFormatted}</div>
            </div>

            <div style={cardStyle}>
              <div style={labelStyle}>Running Servers</div>
              <div style={valueStyle}>{costs.runningServers}</div>
            </div>

            <div style={cardStyle}>
              <div style={labelStyle}>Running Volumes</div>
              <div style={valueStyle}>{costs.runningVolumes}</div>
            </div>

            <div style={cardStyle}>
              <div style={labelStyle}>Projected Monthly</div>
              <div style={valueStyle}>{costs.projectedMonthCostFormatted}</div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <div style={cardStyle}>
              <div style={labelStyle}>Today&apos;s Cost</div>
              <div style={valueStyle}>{costs.todayCostFormatted}</div>
            </div>

            <div style={cardStyle}>
              <div style={labelStyle}>This Month</div>
              <div style={valueStyle}>{costs.monthCostFormatted}</div>
            </div>
          </div>
        </>
      )}

      {!costs && (
        <div
          style={{
            ...cardStyle,
            marginBottom: "2rem",
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          Unable to load cost data. Make sure the API is running.
        </div>
      )}

      {/* Pricing Reference */}
      <div style={{ ...cardStyle, marginBottom: "2rem" }}>
        <div style={labelStyle}>Hetzner Pricing Reference (EUR)</div>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "1rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.875rem",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Resource</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Type</th>
              <th style={{ textAlign: "right", padding: "0.5rem 0" }}>Hourly</th>
              <th style={{ textAlign: "right", padding: "0.5rem 0" }}>Monthly</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "0.5rem 0" }}>Server</td>
              <td style={{ padding: "0.5rem 0" }}>cpx11 (2vCPU, 2GB)</td>
              <td style={{ textAlign: "right", padding: "0.5rem 0" }}>&euro;0.0053</td>
              <td style={{ textAlign: "right", padding: "0.5rem 0" }}>&euro;3.85</td>
            </tr>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "0.5rem 0" }}>Server</td>
              <td style={{ padding: "0.5rem 0" }}>cpx21 (3vCPU, 4GB)</td>
              <td style={{ textAlign: "right", padding: "0.5rem 0" }}>&euro;0.0097</td>
              <td style={{ textAlign: "right", padding: "0.5rem 0" }}>&euro;7.05</td>
            </tr>
            <tr>
              <td style={{ padding: "0.5rem 0" }}>Volume</td>
              <td style={{ padding: "0.5rem 0" }}>Per GB</td>
              <td style={{ textAlign: "right", padding: "0.5rem 0" }}>&euro;0.000055</td>
              <td style={{ textAlign: "right", padding: "0.5rem 0" }}>&euro;0.04</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Recent Events */}
      <div style={cardStyle}>
        <div style={labelStyle}>Recent Cost Events</div>
        {events.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--muted)",
              padding: "2rem",
            }}
          >
            No cost events recorded yet.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: "1rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Time</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Type</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Resource</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Event</th>
                <th style={{ textAlign: "right", padding: "0.5rem 0" }}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem 0" }}>
                    {new Date(event.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: "0.5rem 0" }}>{event.resourceType}</td>
                  <td style={{ padding: "0.5rem 0" }}>
                    {event.resourceId}
                    {event.serverType && ` (${event.serverType})`}
                    {event.sizeGb && ` (${event.sizeGb}GB)`}
                  </td>
                  <td style={{ padding: "0.5rem 0" }}>
                    <span
                      style={{
                        color:
                          event.eventType === "start" || event.eventType === "create"
                            ? "#22c55e"
                            : "#ef4444",
                      }}
                    >
                      {event.eventType}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", padding: "0.5rem 0" }}>
                    {event.hourlyRateFormatted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
