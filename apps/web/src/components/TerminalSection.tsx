"use client";

import { useRef, useState, useCallback } from "react";
import Terminal, { type XTerminalHandle } from "./Terminal";
import MobileToolbar from "./MobileToolbar";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { useTouchDevice } from "@/hooks/useTouchDevice";

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
  const [terminalHandle, setTerminalHandle] = useState<XTerminalHandle | null>(null);

  // Mobile support hooks
  const { height: viewportHeight, isKeyboardOpen } = useVisualViewport();
  const isTouchDevice = useTouchDevice();

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

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{
        marginBottom: isFullscreen ? 0 : "2rem",
        background: isFullscreen ? "#0d0d0d" : undefined,
      }}
      onTransitionEnd={handleFullscreenChange}
    >
      <div
        className="terminal-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>TERMINAL.01 / {workspaceName.toUpperCase().replace(/\s+/g, "_")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {isReady && ipAddress ? (
            <span style={{ color: "var(--success)" }}>● CONNECTED</span>
          ) : (
            <span style={{ color: "var(--muted)" }}>○ OFFLINE</span>
          )}
          <button
            onClick={toggleFullscreen}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--muted)",
              padding: "0.25rem 0.5rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.625rem",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
          >
            {isFullscreen ? "EXIT" : "MAXIMIZE"}
          </button>
        </div>
      </div>
      <div
        className="terminal-screen"
        style={{
          // Use visual viewport height for mobile keyboard support
          // Clamp to minimum 200px to prevent negative/tiny heights on small screens or landscape
          height: isFullscreen
            ? "calc(100vh - 40px)"
            : isTouchDevice && viewportHeight > 0
              ? `${Math.max(viewportHeight - 320 - 64, 200)}px` // Account for header (~40px) + toolbar (64px) + margins
              : "calc(100vh - 320px)",
          minHeight: isFullscreen ? undefined : "200px",
          transition: isKeyboardOpen ? "none" : "height 0.1s ease", // Smooth except when keyboard animating
        }}
      >
        {isReady && ipAddress ? (
          <Terminal
            workspaceId={workspaceId}
            ipAddress={ipAddress}
            onTerminalReady={setTerminalHandle}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                color: "var(--muted)",
                marginBottom: "1rem",
              }}
            >
              AWAITING_CONNECTION
            </div>
            <p style={{ color: "var(--muted)", marginBottom: "0.5rem" }}>
              Workspace is not running
            </p>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                color: "var(--muted)",
              }}
            >
              Start the workspace to access terminal
            </p>
          </div>
        )}
      </div>

      {/* Mobile command toolbar - only shown on touch devices when terminal is ready */}
      {/* Note: Don't call focus() here - it would summon the virtual keyboard on every button press,
          making it impossible to use arrow keys for navigation without the keyboard taking up half the screen.
          The buttons use onPointerDown + preventDefault to keep focus state as-is. */}
      {isTouchDevice && isReady && ipAddress && terminalHandle && (
        <MobileToolbar
          onKeyPress={(key) => terminalHandle.sendKey(key)}
          onPaste={async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (text) {
                terminalHandle.sendKey(text);
              }
            } catch (err) {
              console.warn("[TerminalSection] Clipboard read failed:", err);
            }
          }}
        />
      )}
    </div>
  );
}
