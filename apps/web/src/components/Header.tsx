"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton, useUser } from "@clerk/nextjs";
import { useState } from "react";

export default function Header() {
  const pathname = usePathname();
  const { user } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isDashboard = pathname?.startsWith("/dashboard");

  return (
    <header className="header">
      {/* Logo - Stacked */}
      <Link href={isDashboard ? "/dashboard" : "/"} onClick={() => setMobileMenuOpen(false)}>
        <div className="logo-stacked">
          <span className="logo-line">
            untethered<span className="logo-accent">.</span>
          </span>
          <span className="logo-line">
            computer<span className="logo-accent">_</span>
          </span>
        </div>
      </Link>

      {/* Desktop Navigation */}
      <nav className="nav-desktop">
        {isDashboard && user ? (
          <>
            <Link href="/dashboard">
              <button className="ghost">Workspaces</button>
            </Link>
            <div className="nav-divider" />
            <span className="nav-email">{user.primaryEmailAddress?.emailAddress || "USER"}</span>
            <SignOutButton>
              <button className="ghost">Sign Out</button>
            </SignOutButton>
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

      {/* Mobile Hamburger */}
      <button
        className="hamburger"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label="Toggle menu"
        aria-expanded={mobileMenuOpen}
      >
        <span className={`hamburger-line ${mobileMenuOpen ? "open" : ""}`} />
        <span className={`hamburger-line ${mobileMenuOpen ? "open" : ""}`} />
        <span className={`hamburger-line ${mobileMenuOpen ? "open" : ""}`} />
      </button>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="mobile-menu">
          {isDashboard && user ? (
            <>
              <div className="mobile-menu-email">
                {user.primaryEmailAddress?.emailAddress || "USER"}
              </div>
              <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                <div className="mobile-menu-item">
                  <span className="mobile-menu-icon">◫</span>
                  Workspaces
                </div>
              </Link>
              <SignOutButton>
                <div className="mobile-menu-item" onClick={() => setMobileMenuOpen(false)}>
                  <span className="mobile-menu-icon">→</span>
                  Sign Out
                </div>
              </SignOutButton>
            </>
          ) : (
            <>
              <Link href="/sign-in" onClick={() => setMobileMenuOpen(false)}>
                <div className="mobile-menu-item">Sign In</div>
              </Link>
              <Link href="/sign-up" onClick={() => setMobileMenuOpen(false)}>
                <div className="mobile-menu-item mobile-menu-item-primary">Get Started</div>
              </Link>
            </>
          )}
        </div>
      )}

      <style jsx>{`
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.625rem 1rem;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          position: relative;
          min-height: 52px;
        }

        /* Stacked Logo */
        .logo-stacked {
          display: flex;
          flex-direction: column;
          line-height: 1.1;
          cursor: pointer;
        }

        .logo-line {
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 0.8125rem;
          letter-spacing: -0.02em;
          color: var(--foreground);
        }

        .logo-accent {
          color: var(--primary);
        }

        /* Desktop Navigation */
        .nav-desktop {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .nav-divider {
          width: 1px;
          height: 1.25rem;
          background: var(--border);
          margin: 0 0.25rem;
        }

        .nav-email {
          font-family: var(--font-mono);
          font-size: 0.625rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--muted);
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Hamburger Button */
        .hamburger {
          display: none;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 5px;
          width: 44px;
          height: 44px;
          background: transparent;
          border: 1px solid var(--border);
          cursor: pointer;
          padding: 0;
        }

        .hamburger-line {
          display: block;
          width: 18px;
          height: 2px;
          background: var(--foreground);
          transition:
            transform 0.2s,
            opacity 0.2s;
        }

        .hamburger-line.open:nth-child(1) {
          transform: translateY(7px) rotate(45deg);
        }

        .hamburger-line.open:nth-child(2) {
          opacity: 0;
        }

        .hamburger-line.open:nth-child(3) {
          transform: translateY(-7px) rotate(-45deg);
        }

        /* Mobile Menu */
        .mobile-menu {
          display: none;
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          padding: 0.5rem;
          z-index: 100;
        }

        .mobile-menu-email {
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          color: var(--muted);
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border);
          margin-bottom: 0.5rem;
          word-break: break-all;
        }

        .mobile-menu-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1rem;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--foreground);
          border: 1px solid var(--border);
          margin-bottom: 0.25rem;
          cursor: pointer;
          min-height: 44px;
        }

        .mobile-menu-item:hover {
          background: var(--background);
        }

        .mobile-menu-item-primary {
          background: var(--primary);
          border-color: var(--primary);
          color: white;
        }

        .mobile-menu-item-primary:hover {
          background: var(--primary);
          opacity: 0.9;
        }

        .mobile-menu-icon {
          width: 1.25rem;
          text-align: center;
        }

        /* Mobile Breakpoint */
        @media (max-width: 768px) {
          .nav-desktop {
            display: none;
          }

          .hamburger {
            display: flex;
          }

          .mobile-menu {
            display: block;
          }

          .logo-line {
            font-size: 0.75rem;
          }
        }
      `}</style>
    </header>
  );
}
