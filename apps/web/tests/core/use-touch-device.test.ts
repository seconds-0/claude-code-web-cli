import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTouchDevice } from "@/hooks/useTouchDevice";

describe("useTouchDevice hook", () => {
  let mockMatchMedia: ReturnType<typeof vi.fn>;
  let changeListeners: ((e: { matches: boolean }) => void)[];

  beforeEach(() => {
    changeListeners = [];

    mockMatchMedia = vi.fn().mockImplementation((query: string) => {
      const mediaQueryList = {
        matches: false,
        media: query,
        onchange: null,
        // Modern API
        addEventListener: vi.fn((event: string, listener: (e: { matches: boolean }) => void) => {
          if (event === "change") {
            changeListeners.push(listener);
          }
        }),
        removeEventListener: vi.fn(),
        // Legacy API for iOS 13 fallback
        addListener: vi.fn((listener: (e: { matches: boolean }) => void) => {
          changeListeners.push(listener);
        }),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
      return mediaQueryList;
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: mockMatchMedia,
    });
  });

  it("returns false initially (SSR-safe default)", () => {
    const { result } = renderHook(() => useTouchDevice());
    // Initial state should be false (safe for SSR)
    expect(result.current).toBe(false);
  });

  it("queries for coarse pointer media", () => {
    renderHook(() => useTouchDevice());
    expect(mockMatchMedia).toHaveBeenCalledWith("(pointer: coarse)");
  });

  it("returns true when pointer is coarse (touch device)", () => {
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: true, // Touch device
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));

    const { result } = renderHook(() => useTouchDevice());
    // After useEffect runs, should reflect touch device
    expect(result.current).toBe(true);
  });

  it("returns false when pointer is fine (mouse/trackpad)", () => {
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: false, // Desktop with mouse
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));

    const { result } = renderHook(() => useTouchDevice());
    expect(result.current).toBe(false);
  });

  it("updates when media query changes", () => {
    const { result } = renderHook(() => useTouchDevice());

    // Initial state
    expect(result.current).toBe(false);

    // Simulate device mode change (e.g., tablet switching modes)
    act(() => {
      changeListeners.forEach((listener) => listener({ matches: true }));
    });

    expect(result.current).toBe(true);
  });

  it("cleans up event listener on unmount", () => {
    const removeEventListener = vi.fn();
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));

    const { unmount } = renderHook(() => useTouchDevice());
    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  describe("iOS 13 fallback (legacy API)", () => {
    it("uses addListener when addEventListener is not available", () => {
      const addListener = vi.fn();
      const removeListener = vi.fn();

      mockMatchMedia.mockImplementation((query: string) => ({
        matches: false,
        media: query,
        // Simulate iOS 13 - no addEventListener
        addEventListener: undefined,
        removeEventListener: undefined,
        addListener,
        removeListener,
      }));

      renderHook(() => useTouchDevice());
      expect(addListener).toHaveBeenCalled();
    });

    it("uses removeListener for cleanup when addEventListener is not available", () => {
      const addListener = vi.fn();
      const removeListener = vi.fn();

      mockMatchMedia.mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: undefined,
        removeEventListener: undefined,
        addListener,
        removeListener,
      }));

      const { unmount } = renderHook(() => useTouchDevice());
      unmount();

      expect(removeListener).toHaveBeenCalled();
    });
  });
});
