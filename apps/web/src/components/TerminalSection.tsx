"use client";

import { useRef, useState, useCallback } from "react";
import Terminal from "./Terminal";
import TerminalAccessoryBar from "./TerminalAccessoryBar";

interface TerminalSectionProps {
  workspaceId: string;
  workspaceName: string;
  ipAddress?: string;
  isReady: boolean;
}

export default function TerminalSection({
  workspaceId,
  workspaceName,
  ipAddress,
  isReady,
}: TerminalSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  }, []);

  // Listen for fullscreen changes (e.g., user presses Escape)
  const handleFullscreenChange = useCallback(() => {
    setIsFullscreen(!!document.fullscreenElement);
  }, []);

  const handleMenuPress = useCallback(() => {
    setShowMobileMenu(!showMobileMenu);
  }, [showMobileMenu]);

  return (
    <div
      ref={containerRef}
      className={`terminal-wrapper ${isFullscreen ? "fullscreen" : ""}`}
      onTransitionEnd={handleFullscreenChange}
    >
      {/* Terminal Header */}
      <div className="terminal-header">
        <span className="terminal-label">
          TERMINAL.01 / {workspaceName.toUpperCase().replace(/\s+/g, "_")}
        </span>
        <div className="terminal-header-right">
          <span className={`status ${isReady && ipAddress ? "connected" : "offline"}`}>
            {isReady && ipAddress ? "● CONNECTED" : "○ OFFLINE"}
          </span>
          <button
            onClick={toggleFullscreen}
            className="fullscreen-btn"
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
          >
            {isFullscreen ? "EXIT" : "MAXIMIZE"}
          </button>
        </div>
      </div>

      {/* Terminal Screen */}
      <div className={`terminal-screen ${isFullscreen ? "fullscreen" : ""}`}>
        {isReady && ipAddress ? (
          <Terminal workspaceId={workspaceId} ipAddress={ipAddress} />
        ) : (
          <div className="terminal-placeholder">
            <div className="placeholder-status">AWAITING_CONNECTION</div>
            <p className="placeholder-text">Workspace is not running</p>
            <p className="placeholder-hint">Start the workspace to access terminal</p>
          </div>
        )}
      </div>

      {/* Mobile Accessory Bar */}
      <TerminalAccessoryBar
        workspaceId={workspaceId}
        onMenuPress={handleMenuPress}
        disabled={!isReady || !ipAddress}
      />

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <div className="mobile-overlay" onClick={() => setShowMobileMenu(false)}>
          <div className="mobile-menu" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">Settings</div>
            <button className="mobile-menu-item" onClick={toggleFullscreen}>
              {isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            </button>
            <button className="mobile-menu-item" onClick={() => setShowMobileMenu(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .terminal-wrapper {
          margin-bottom: 2rem;
          display: flex;
          flex-direction: column;
        }

        .terminal-wrapper.fullscreen {
          margin-bottom: 0;
          background: #0d0d0d;
          position: fixed;
          inset: 0;
          z-index: 1000;
        }

        .terminal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-bottom: none;
          font-family: var(--font-mono);
          font-size: 0.625rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--muted);
        }

        .terminal-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .terminal-header-right {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-shrink: 0;
        }

        .status {
          white-space: nowrap;
        }

        .status.connected {
          color: var(--success);
        }

        .status.offline {
          color: var(--muted);
        }

        .fullscreen-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--muted);
          padding: 0.25rem 0.5rem;
          font-family: var(--font-mono);
          font-size: 0.625rem;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .fullscreen-btn:hover {
          color: var(--foreground);
          border-color: var(--foreground);
        }

        .terminal-screen {
          height: calc(100vh - 320px);
          min-height: 400px;
          background: #0d0d0d;
          border: 1px solid var(--border);
        }

        .terminal-screen.fullscreen {
          height: calc(100vh - 40px);
          min-height: unset;
          border: none;
          flex: 1;
        }

        .terminal-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
        }

        .placeholder-status {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--muted);
          margin-bottom: 1rem;
        }

        .placeholder-text {
          color: var(--muted);
          margin-bottom: 0.5rem;
        }

        .placeholder-hint {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--muted);
        }

        .mobile-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          z-index: 1001;
          align-items: flex-end;
          justify-content: center;
        }

        .mobile-menu {
          background: var(--surface);
          border: 1px solid var(--border);
          width: 100%;
          max-width: 400px;
          padding: 1rem;
          margin-bottom: env(safe-area-inset-bottom, 0);
        }

        .mobile-menu-header {
          font-family: var(--font-mono);
          font-size: 0.625rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--muted);
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid var(--border);
        }

        .mobile-menu-item {
          display: block;
          width: 100%;
          padding: 1rem;
          font-size: 0.875rem;
          background: var(--background);
          border: 1px solid var(--border);
          color: var(--foreground);
          cursor: pointer;
          text-align: left;
          margin-bottom: 0.5rem;
        }

        .mobile-menu-item:hover {
          background: var(--surface);
        }

        /* Mobile Styles */
        @media (max-width: 768px) {
          .terminal-wrapper {
            margin-bottom: 0;
          }

          .terminal-header {
            padding: 0.5rem 0.75rem;
          }

          .terminal-label {
            font-size: 0.5625rem;
            max-width: 120px;
          }

          .terminal-header-right {
            gap: 0.5rem;
          }

          .fullscreen-btn {
            display: none;
          }

          .terminal-screen {
            height: calc(100vh - 220px);
            min-height: 300px;
          }

          .mobile-overlay {
            display: flex;
          }
        }
      `}</style>
    </div>
  );
}
