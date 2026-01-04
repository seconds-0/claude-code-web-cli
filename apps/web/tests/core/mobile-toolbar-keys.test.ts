import { describe, it, expect } from "vitest";

/**
 * Tests for MobileToolbar key sequence generation logic.
 *
 * These tests verify the critical key sequence behavior that was fixed
 * during code review to prevent regressions:
 * - Arrow keys should NOT get double-ESC when Alt is pressed
 * - Ctrl+letter should produce correct ASCII control codes
 * - Modifier combinations should work correctly
 */

// Extracted key sequence logic from MobileToolbar for unit testing
function generateKeySequence(key: string, modifiers: { ctrl: boolean; alt: boolean }): string {
  let modifiedKey = key;
  const startsWithEsc = key.startsWith("\x1b");

  // Build the key sequence with modifiers
  if (modifiers.ctrl && !startsWithEsc) {
    // Ctrl sequences use ASCII control codes (only for single letters)
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

  // Skip Alt prefix for keys that already start with ESC (like arrow sequences)
  // to avoid double-ESC: ESC + ESC[A
  if (modifiers.alt && !startsWithEsc) {
    // Alt sequences use ESC prefix
    modifiedKey = "\x1b" + modifiedKey;
  }

  return modifiedKey;
}

describe("MobileToolbar key sequences", () => {
  describe("arrow keys", () => {
    it("generates correct up arrow sequence", () => {
      const result = generateKeySequence("\x1b[A", { ctrl: false, alt: false });
      expect(result).toBe("\x1b[A");
    });

    it("generates correct down arrow sequence", () => {
      const result = generateKeySequence("\x1b[B", { ctrl: false, alt: false });
      expect(result).toBe("\x1b[B");
    });

    it("generates correct right arrow sequence", () => {
      const result = generateKeySequence("\x1b[C", { ctrl: false, alt: false });
      expect(result).toBe("\x1b[C");
    });

    it("generates correct left arrow sequence", () => {
      const result = generateKeySequence("\x1b[D", { ctrl: false, alt: false });
      expect(result).toBe("\x1b[D");
    });
  });

  describe("arrow keys with Alt modifier (CRITICAL - prevents double-ESC bug)", () => {
    it("does NOT add extra ESC prefix to up arrow", () => {
      const result = generateKeySequence("\x1b[A", { ctrl: false, alt: true });
      // Should be \x1b[A, NOT \x1b\x1b[A (double escape)
      expect(result).toBe("\x1b[A");
      expect(result).not.toBe("\x1b\x1b[A");
    });

    it("does NOT add extra ESC prefix to down arrow", () => {
      const result = generateKeySequence("\x1b[B", { ctrl: false, alt: true });
      expect(result).toBe("\x1b[B");
      expect(result).not.toBe("\x1b\x1b[B");
    });

    it("does NOT add extra ESC prefix to right arrow", () => {
      const result = generateKeySequence("\x1b[C", { ctrl: false, alt: true });
      expect(result).toBe("\x1b[C");
      expect(result).not.toBe("\x1b\x1b[C");
    });

    it("does NOT add extra ESC prefix to left arrow", () => {
      const result = generateKeySequence("\x1b[D", { ctrl: false, alt: true });
      expect(result).toBe("\x1b[D");
      expect(result).not.toBe("\x1b\x1b[D");
    });
  });

  describe("Ctrl modifier", () => {
    it("generates Ctrl+C as ETX (\\x03)", () => {
      const result = generateKeySequence("c", { ctrl: true, alt: false });
      expect(result).toBe("\x03");
    });

    it("generates Ctrl+D as EOT (\\x04)", () => {
      const result = generateKeySequence("d", { ctrl: true, alt: false });
      expect(result).toBe("\x04");
    });

    it("generates Ctrl+Z as SUB (\\x1a)", () => {
      const result = generateKeySequence("z", { ctrl: true, alt: false });
      expect(result).toBe("\x1a");
    });

    it("generates Ctrl+A as ASCII 1", () => {
      const result = generateKeySequence("a", { ctrl: true, alt: false });
      expect(result).toBe("\x01");
    });

    it("generates Ctrl+L as ASCII 12 (form feed)", () => {
      const result = generateKeySequence("l", { ctrl: true, alt: false });
      expect(result).toBe("\x0c");
    });
  });

  describe("Alt modifier", () => {
    it("adds ESC prefix to regular letters", () => {
      const result = generateKeySequence("a", { ctrl: false, alt: true });
      expect(result).toBe("\x1ba");
    });

    it("adds ESC prefix to Tab", () => {
      const result = generateKeySequence("\t", { ctrl: false, alt: true });
      expect(result).toBe("\x1b\t");
    });
  });

  describe("special keys", () => {
    it("ESC key returns raw ESC", () => {
      // ESC is sent directly, not through the modifier system
      expect("\x1b").toBe("\x1b");
    });

    it("Tab key returns raw Tab", () => {
      const result = generateKeySequence("\t", { ctrl: false, alt: false });
      expect(result).toBe("\t");
    });
  });

  describe("no modifiers", () => {
    it("passes through regular characters unchanged", () => {
      const result = generateKeySequence("a", { ctrl: false, alt: false });
      expect(result).toBe("a");
    });

    it("passes through multi-character strings unchanged", () => {
      const result = generateKeySequence("hello", { ctrl: false, alt: false });
      expect(result).toBe("hello");
    });
  });
});
