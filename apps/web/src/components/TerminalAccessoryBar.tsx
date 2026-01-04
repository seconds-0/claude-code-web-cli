"use client";

import { useCallback } from "react";

interface TerminalAccessoryBarProps {
  workspaceId: string;
  onMenuPress: () => void;
  disabled?: boolean;
}

export default function TerminalAccessoryBar({
  workspaceId,
  onMenuPress,
  disabled = false,
}: TerminalAccessoryBarProps) {
  const keys = [
    { label: "ESC", value: "\x1b" },
    { label: "TAB", value: "\t" },
    { label: "↑", value: "\x1b[A" },
    { label: "↓", value: "\x1b[B" },
    { label: "←", value: "\x1b[D" },
    { label: "→", value: "\x1b[C" },
  ];

  // Dispatch custom event to send key to terminal
  const sendKey = useCallback(
    (key: string) => {
      const event = new CustomEvent("terminal-input", {
        detail: { workspaceId, key },
      });
      window.dispatchEvent(event);
    },
    [workspaceId]
  );

  return (
    <div className="accessory-bar">
      {keys.map((key) => (
        <button
          key={key.label}
          className="accessory-btn"
          onClick={() => sendKey(key.value)}
          disabled={disabled}
          aria-label={key.label}
        >
          {key.label}
        </button>
      ))}
      <button className="accessory-btn menu-btn" onClick={onMenuPress} aria-label="Menu">
        ☰
      </button>

      <style jsx>{`
        .accessory-bar {
          display: none;
          background: var(--surface);
          border-top: 1px solid var(--border);
          padding: 8px;
          gap: 6px;
        }

        .accessory-btn {
          flex: 1;
          padding: 12px 8px;
          font-size: 12px;
          font-family: var(--font-mono);
          font-weight: 600;
          border: 1px solid var(--border);
          background: var(--background);
          color: var(--foreground);
          cursor: pointer;
          text-align: center;
          min-height: 44px;
          transition: background 0.1s;
        }

        .accessory-btn:hover:not(:disabled) {
          background: var(--surface);
        }

        .accessory-btn:active:not(:disabled) {
          background: var(--primary);
          border-color: var(--primary);
        }

        .accessory-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .menu-btn {
          flex: none;
          width: 44px;
        }

        @media (max-width: 768px) {
          .accessory-bar {
            display: flex;
          }
        }
      `}</style>
    </div>
  );
}
