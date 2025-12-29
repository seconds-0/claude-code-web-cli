"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton, useUser } from "@clerk/nextjs";

export default function Header() {
  const pathname = usePathname();
  const { user } = useUser();

  const isDashboard = pathname?.startsWith("/dashboard");

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1.5rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      {/* Logo */}
      <Link href={isDashboard ? "/dashboard" : "/"}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.625rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--muted)",
            }}
          >
            SYS.001
          </span>
          <span
            style={{
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Claude Code Cloud
          </span>
        </div>
      </Link>

      {/* Navigation */}
      <nav style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {isDashboard && user ? (
          <>
            <Link href="/dashboard">
              <button className="ghost" style={{ padding: "0.5rem 0.75rem" }}>
                Workspaces
              </button>
            </Link>
            <div
              style={{
                width: "1px",
                height: "1.5rem",
                background: "var(--border)",
                margin: "0 0.25rem",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.625rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--muted)",
                }}
              >
                {user.primaryEmailAddress?.emailAddress || "USER"}
              </span>
              <SignOutButton>
                <button className="ghost" style={{ padding: "0.5rem 0.75rem" }}>
                  Sign Out
                </button>
              </SignOutButton>
            </div>
          </>
        ) : (
          <>
            <Link href="/sign-in">
              <button className="ghost">Sign In</button>
            </Link>
            <Link href="/sign-up">
              <button className="primary">Get Started</button>
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
