import { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  label?: string;
  title?: string;
  headerRight?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function Panel({
  children,
  label,
  title,
  headerRight,
  className,
  style,
}: PanelProps) {
  return (
    <div
      className={className}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        ...style,
      }}
    >
      {(label || title || headerRight) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {label && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.625rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--primary)",
                }}
              >
                {label}
              </span>
            )}
            {title && (
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "0.875rem",
                }}
              >
                {title}
              </span>
            )}
          </div>
          {headerRight}
        </div>
      )}
      {children}
    </div>
  );
}

interface PanelContentProps {
  children: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export function PanelContent({ children, style, className }: PanelContentProps) {
  return (
    <div className={className} style={{ padding: "1rem", ...style }}>
      {children}
    </div>
  );
}

interface PanelStatProps {
  label: string;
  value: string | number;
  subValue?: string;
}

export function PanelStat({ label, value, subValue }: PanelStatProps) {
  return (
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
        {label}
      </div>
      <div
        style={{
          fontSize: "1.25rem",
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {subValue && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--muted)",
            marginTop: "0.25rem",
          }}
        >
          {subValue}
        </div>
      )}
    </div>
  );
}
