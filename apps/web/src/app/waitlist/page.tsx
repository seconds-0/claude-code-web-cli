"use client";

import { Waitlist } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

export default function WaitlistPage() {
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const measureSpan = measureRef.current;
    if (!measureSpan) return;

    // Map to track cursor elements for each input
    const cursors = new Map<HTMLInputElement, HTMLSpanElement>();

    const updateCursor = (input: HTMLInputElement) => {
      let cursor = cursors.get(input);

      // Create cursor element if it doesn't exist
      if (!cursor) {
        cursor = document.createElement("span");
        cursor.className = "terminal-cursor";
        cursor.textContent = "_";
        input.parentElement?.appendChild(cursor);
        cursors.set(input, cursor);
      }

      // Get text up to cursor position
      // Note: selectionStart is null for type="email" inputs in browsers
      const cursorPos = input.selectionStart ?? input.value.length;
      const text = input.value.substring(0, cursorPos);

      // Copy input styles to measure span
      const style = window.getComputedStyle(input);
      measureSpan.style.font = style.font;
      measureSpan.style.letterSpacing = style.letterSpacing;
      measureSpan.textContent = text || "";

      // Calculate position
      const textWidth = measureSpan.offsetWidth;
      const paddingLeft = parseFloat(style.paddingLeft);

      cursor.style.left = `${paddingLeft + textWidth}px`;
      cursor.style.display = document.activeElement === input ? "block" : "none";
    };

    const handleFocus = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.closest(".cl-formFieldRoot")) {
        updateCursor(e.target);
      }
    };

    const handleBlur = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement) {
        const cursor = cursors.get(e.target);
        if (cursor) cursor.style.display = "none";
      }
    };

    const handleInput = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.closest(".cl-formFieldRoot")) {
        updateCursor(e.target);
      }
    };

    // Use capture phase to catch events before they bubble
    document.addEventListener("focus", handleFocus, true);
    document.addEventListener("blur", handleBlur, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("click", handleInput, true);
    document.addEventListener("keyup", handleInput, true);

    return () => {
      document.removeEventListener("focus", handleFocus, true);
      document.removeEventListener("blur", handleBlur, true);
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("click", handleInput, true);
      document.removeEventListener("keyup", handleInput, true);

      // Clean up cursor elements
      cursors.forEach((cursor) => cursor.remove());
      cursors.clear();
    };
  }, []);

  return (
    <div className="waitlist-container">
      {/* Hidden span for measuring text width */}
      <span
        ref={measureRef}
        style={{
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "pre",
          pointerEvents: "none",
        }}
      />
      <div className="waitlist-header">
        <span className="waitlist-label">WAIT.01 / JOIN_WAITLIST</span>
        <h1>Join the Waitlist</h1>
        <p>Get early access to your cloud workspace</p>
      </div>

      <Waitlist
        appearance={{
          elements: {
            rootBox: "waitlist-root",
            card: "waitlist-card",
            headerTitle: "waitlist-title",
            headerSubtitle: "waitlist-subtitle",
            formFieldInput: "waitlist-input",
            formButtonPrimary: "waitlist-button",
            footerAction: "waitlist-footer",
          },
        }}
      />

      <style>{`
        .waitlist-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 1rem;
          background: var(--background);
        }

        .waitlist-header {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .waitlist-label {
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--muted);
          display: block;
          margin-bottom: 0.5rem;
        }

        .waitlist-header h1 {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0.5rem 0;
          color: var(--foreground);
        }

        .waitlist-header p {
          color: var(--muted);
          font-size: 0.875rem;
          margin: 0;
        }

        /* Override Clerk Waitlist component styles */
        .cl-rootBox {
          width: 100%;
          max-width: 400px;
        }

        .cl-card {
          background: var(--surface) !important;
          border: 1px solid var(--border) !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }

        .cl-headerTitle,
        .cl-headerSubtitle {
          display: none !important;
        }

        .cl-formFieldLabel {
          color: var(--foreground) !important;
          font-family: var(--font-mono) !important;
          font-size: 0.75rem !important;
          font-weight: 500 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
        }

        .cl-formFieldRoot {
          position: relative !important;
        }

        .cl-formFieldInput {
          background: var(--background) !important;
          border: 1px solid var(--border) !important;
          border-radius: 0 !important;
          color: var(--foreground) !important;
          font-family: var(--font-mono) !important;
          caret-color: transparent !important;
        }

        .cl-formFieldInput::placeholder {
          color: var(--muted) !important;
          opacity: 0.7 !important;
        }

        .cl-formFieldInput:focus {
          border-color: var(--primary) !important;
          box-shadow: none !important;
        }

        /* Terminal blinking underscore cursor */
        .terminal-cursor {
          position: absolute;
          bottom: 0.75rem;
          color: var(--primary);
          font-family: var(--font-mono);
          font-size: 0.875rem;
          font-weight: 600;
          animation: terminal-blink 1s step-end infinite;
          pointer-events: none;
          display: none;
        }

        @keyframes terminal-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        .cl-formButtonPrimary {
          background: var(--primary) !important;
          border: 1px solid var(--primary) !important;
          border-radius: 0 !important;
          font-family: var(--font-mono) !important;
          font-weight: 600 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
          box-shadow: var(--shadow) !important;
        }

        .cl-formButtonPrimary:hover {
          background: var(--primary-hover) !important;
        }

        .cl-footer {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
