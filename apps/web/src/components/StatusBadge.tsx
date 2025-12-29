interface StatusBadgeProps {
  status: string;
  label?: string;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "ready":
    case "running":
    case "connected":
      return "var(--success)";
    case "provisioning":
    case "starting":
    case "connecting":
      return "var(--warning)";
    case "error":
    case "failed":
      return "var(--error)";
    case "pending":
    case "stopping":
    case "suspended":
    case "stopped":
    default:
      return "var(--muted)";
  }
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const color = getStatusColor(status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        padding: "0.25rem 0.5rem",
        fontFamily: "var(--font-mono)",
        fontSize: "0.625rem",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: color,
        border: `1px solid ${color}`,
      }}
    >
      {/* LED indicator */}
      <span
        className={
          status === "running" ||
          status === "starting" ||
          status === "provisioning" ||
          status === "connecting"
            ? "led-pulse"
            : undefined
        }
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
          boxShadow:
            status === "running" || status === "ready" || status === "connected"
              ? `0 0 4px ${color}`
              : "none",
        }}
      />
      {label || status}
    </span>
  );
}

export { getStatusColor };
