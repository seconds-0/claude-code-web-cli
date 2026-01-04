"use client";

import { useState, useCallback, useRef } from "react";

interface MobileToolbarProps {
  onKeyPress: (key: string) => void;
  onPaste?: () => void;
}

type Modifier = "ctrl" | "alt";

interface ModifierState {
  active: boolean;
  locked: boolean;
}

/**
 * Mobile command toolbar with special keys for terminal control.
 * Features:
 * - Sticky modifiers (Ctrl, Alt) - tap to toggle, double-tap to lock
 * - Arrow keys for navigation
 * - Esc and Tab for common terminal operations
 * - Paste button for iOS clipboard quirks
 */
export default function MobileToolbar({ onKeyPress, onPaste }: MobileToolbarProps) {
  const [modifiers, setModifiers] = useState<Record<Modifier, ModifierState>>({
    ctrl: { active: false, locked: false },
    alt: { active: false, locked: false },
  });

  const lastTapRef = useRef<Record<Modifier, number>>({
    ctrl: 0,
    alt: 0,
  });

  const DOUBLE_TAP_THRESHOLD = 300; // ms

  // Handle modifier key tap (toggle on single tap, lock on double tap)
  const handleModifierTap = useCallback((mod: Modifier) => {
    const now = Date.now();
    const lastTap = lastTapRef.current[mod];
    const isDoubleTap = now - lastTap < DOUBLE_TAP_THRESHOLD;
    lastTapRef.current[mod] = now;

    setModifiers((prev) => {
      const current = prev[mod];

      if (isDoubleTap) {
        // Double tap: toggle lock state
        return {
          ...prev,
          [mod]: {
            active: !current.locked, // Turn on if not locked, off if locked
            locked: !current.locked,
          },
        };
      }

      if (current.locked) {
        // If locked, unlock on single tap
        return {
          ...prev,
          [mod]: { active: false, locked: false },
        };
      }

      // Single tap: toggle active state
      return {
        ...prev,
        [mod]: { active: !current.active, locked: false },
      };
    });
  }, []);

  // Handle key press with modifier combination
  const handleKeyPress = useCallback(
    (key: string) => {
      let modifiedKey = key;

      // Build the key sequence with modifiers
      if (modifiers.ctrl.active) {
        // Ctrl sequences use ASCII control codes
        if (key.length === 1 && key >= "a" && key <= "z") {
          // Ctrl+letter = ASCII 1-26
          modifiedKey = String.fromCharCode(key.charCodeAt(0) - 96);
        } else if (key === "c") {
          modifiedKey = "\x03"; // Ctrl+C (ETX)
        } else if (key === "d") {
          modifiedKey = "\x04"; // Ctrl+D (EOT)
        } else if (key === "z") {
          modifiedKey = "\x1a"; // Ctrl+Z (SUB)
        }
      }

      if (modifiers.alt.active) {
        // Alt sequences use ESC prefix
        modifiedKey = "\x1b" + key;
      }

      onKeyPress(modifiedKey);

      // Clear non-locked modifiers after key press
      setModifiers((prev) => ({
        ctrl: prev.ctrl.locked ? prev.ctrl : { active: false, locked: false },
        alt: prev.alt.locked ? prev.alt : { active: false, locked: false },
      }));
    },
    [modifiers, onKeyPress]
  );

  // Special key handlers
  const handleEsc = useCallback(() => {
    onKeyPress("\x1b"); // ESC
  }, [onKeyPress]);

  const handleTab = useCallback(() => {
    onKeyPress("\t"); // Tab
  }, [onKeyPress]);

  const handleArrow = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      const arrows: Record<string, string> = {
        up: "\x1b[A",
        down: "\x1b[B",
        right: "\x1b[C",
        left: "\x1b[D",
      };
      handleKeyPress(arrows[direction]);
    },
    [handleKeyPress]
  );

  const handlePaste = useCallback(async () => {
    if (onPaste) {
      onPaste();
    } else {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          onKeyPress(text);
        }
      } catch (err) {
        console.warn("[MobileToolbar] Clipboard read failed:", err);
      }
    }
  }, [onKeyPress, onPaste]);

  const buttonStyle = {
    minWidth: "48px",
    minHeight: "48px",
    padding: "0.5rem",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--foreground)",
    fontFamily: "var(--font-mono)",
    fontSize: "0.75rem",
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "manipulation", // Prevents double-tap zoom
    userSelect: "none" as const,
    WebkitUserSelect: "none" as const,
  };

  const activeButtonStyle = {
    ...buttonStyle,
    background: "var(--primary)",
    borderColor: "var(--primary)",
    color: "#fff",
  };

  const lockedButtonStyle = {
    ...activeButtonStyle,
    boxShadow: "inset 0 0 0 2px rgba(255, 255, 255, 0.3)",
  };

  const getModifierStyle = (mod: Modifier) => {
    if (modifiers[mod].locked) return lockedButtonStyle;
    if (modifiers[mod].active) return activeButtonStyle;
    return buttonStyle;
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        padding: "8px",
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        justifyContent: "center",
        flexWrap: "wrap",
      }}
    >
      {/* Modifier keys */}
      <button
        style={getModifierStyle("ctrl")}
        onClick={() => handleModifierTap("ctrl")}
        title={modifiers.ctrl.locked ? "Ctrl (locked)" : "Ctrl"}
      >
        CTRL
      </button>
      <button
        style={getModifierStyle("alt")}
        onClick={() => handleModifierTap("alt")}
        title={modifiers.alt.locked ? "Alt (locked)" : "Alt"}
      >
        ALT
      </button>

      {/* Function keys */}
      <button style={buttonStyle} onClick={handleEsc} title="Escape">
        ESC
      </button>
      <button style={buttonStyle} onClick={handleTab} title="Tab">
        TAB
      </button>

      {/* Separator */}
      <div style={{ width: "8px" }} />

      {/* Arrow keys */}
      <button style={buttonStyle} onClick={() => handleArrow("left")} title="Left arrow">
        ←
      </button>
      <button style={buttonStyle} onClick={() => handleArrow("down")} title="Down arrow">
        ↓
      </button>
      <button style={buttonStyle} onClick={() => handleArrow("up")} title="Up arrow">
        ↑
      </button>
      <button style={buttonStyle} onClick={() => handleArrow("right")} title="Right arrow">
        →
      </button>

      {/* Separator */}
      <div style={{ width: "8px" }} />

      {/* Paste button */}
      <button style={buttonStyle} onClick={handlePaste} title="Paste from clipboard">
        PASTE
      </button>
    </div>
  );
}
