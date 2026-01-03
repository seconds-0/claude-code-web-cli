"use client";

import Link from "next/link";

interface MobileContextBarProps {
  workspaceName: string;
  isConnected: boolean;
}

export default function MobileContextBar({ workspaceName, isConnected }: MobileContextBarProps) {
  return (
    <div className="context-bar">
      <div className="context-left">
        <Link href="/dashboard" className="back-btn">
          ← Back
        </Link>
        <span className="context-title">{workspaceName}</span>
      </div>
      <div className="context-status">
        <span className={`status-dot ${isConnected ? "connected" : "offline"}`}>●</span>
        <span>{isConnected ? "Connected" : "Offline"}</span>
      </div>

      <style jsx>{`
        .context-bar {
          display: none;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          min-height: 36px;
        }

        .context-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .back-btn {
          padding: 6px 10px;
          font-size: 12px;
          color: var(--muted);
          cursor: pointer;
          min-height: 32px;
          display: flex;
          align-items: center;
        }

        .back-btn:hover {
          color: var(--foreground);
        }

        .context-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--foreground);
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .context-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          color: var(--muted);
          text-transform: uppercase;
        }

        .status-dot {
          font-size: 8px;
        }

        .status-dot.connected {
          color: var(--success);
        }

        .status-dot.offline {
          color: var(--muted);
        }

        @media (max-width: 768px) {
          .context-bar {
            display: flex;
          }
        }
      `}</style>
    </div>
  );
}
