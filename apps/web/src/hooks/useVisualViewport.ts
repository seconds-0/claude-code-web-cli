"use client";

import { useState, useEffect, useCallback } from "react";

interface VisualViewportState {
  height: number;
  width: number;
  isKeyboardOpen: boolean;
  keyboardHeight: number;
}

/**
 * Hook to track Visual Viewport changes, particularly for virtual keyboard handling.
 * Safari doesn't resize the layout viewport when the keyboard opens, only the visual viewport.
 * This hook provides the actual visible area dimensions.
 */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>({
    height: typeof window !== "undefined" ? window.innerHeight : 0,
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    isKeyboardOpen: false,
    keyboardHeight: 0,
  });

  const updateViewport = useCallback(() => {
    if (typeof window === "undefined") return;

    const vv = window.visualViewport;
    if (!vv) {
      // Fallback for browsers without Visual Viewport API
      setState({
        height: window.innerHeight,
        width: window.innerWidth,
        isKeyboardOpen: false,
        keyboardHeight: 0,
      });
      return;
    }

    const heightDiff = window.innerHeight - vv.height;
    // Consider keyboard "open" if visual viewport is significantly smaller than window
    // 150px threshold accounts for browser chrome variations
    const isKeyboardOpen = heightDiff > 150;

    setState({
      height: vv.height,
      width: vv.width,
      isKeyboardOpen,
      keyboardHeight: isKeyboardOpen ? heightDiff : 0,
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const vv = window.visualViewport;

    // Initial measurement
    updateViewport();

    if (vv) {
      // Visual Viewport API available
      vv.addEventListener("resize", updateViewport);
      vv.addEventListener("scroll", updateViewport);

      return () => {
        vv.removeEventListener("resize", updateViewport);
        vv.removeEventListener("scroll", updateViewport);
      };
    } else {
      // Fallback to window resize
      window.addEventListener("resize", updateViewport);
      return () => window.removeEventListener("resize", updateViewport);
    }
  }, [updateViewport]);

  return state;
}

export default useVisualViewport;
