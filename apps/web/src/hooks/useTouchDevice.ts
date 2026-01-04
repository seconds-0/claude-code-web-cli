"use client";

import { useState, useEffect } from "react";

/**
 * Hook to detect if the device primarily uses touch input.
 * Uses the `pointer: coarse` media query which detects touch-primary devices.
 *
 * Note: This is more reliable than checking for touch events, as hybrid
 * devices (laptops with touchscreens) will return false (fine pointer primary).
 */
export function useTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // Check if the primary pointer is coarse (touch/stylus)
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    setIsTouchDevice(mediaQuery.matches);

    // Listen for changes (e.g., device mode changes on some tablets)
    const handleChange = (e: MediaQueryListEvent) => {
      setIsTouchDevice(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isTouchDevice;
}

export default useTouchDevice;
