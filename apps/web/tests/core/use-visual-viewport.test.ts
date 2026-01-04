import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVisualViewport } from "@/hooks/useVisualViewport";

describe("useVisualViewport hook", () => {
  let resizeListeners: (() => void)[];

  beforeEach(() => {
    resizeListeners = [];

    // Reset the mock on window.visualViewport (set up in tests/setup.ts)
    const vv = window.visualViewport as unknown as {
      width: number;
      height: number;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
    };
    vv.width = 375;
    vv.height = 667; // iPhone SE height
    vv.addEventListener = vi.fn((event: string, listener: () => void) => {
      if (event === "resize") {
        resizeListeners.push(listener);
      }
    });
    vv.removeEventListener = vi.fn();

    // Reset innerHeight
    vi.stubGlobal("innerHeight", 667);
  });

  it("returns initial viewport height", () => {
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current.height).toBe(667);
  });

  it("detects keyboard is closed when heights match", () => {
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current.isKeyboardOpen).toBe(false);
  });

  it("detects keyboard is open when visual viewport is smaller", () => {
    // Simulate keyboard open - visual viewport shrinks
    const vv = window.visualViewport as { height: number };
    vv.height = 350; // Keyboard takes ~half the screen

    const { result } = renderHook(() => useVisualViewport());

    // After initial render with keyboard "open"
    expect(result.current.height).toBe(350);
    expect(result.current.isKeyboardOpen).toBe(true);
  });

  it("updates height when viewport resizes", () => {
    const { result } = renderHook(() => useVisualViewport());
    const vv = window.visualViewport as { height: number };

    // Simulate keyboard opening
    act(() => {
      vv.height = 300;
      resizeListeners.forEach((listener) => listener());
    });

    expect(result.current.height).toBe(300);
    expect(result.current.isKeyboardOpen).toBe(true);
  });

  it("detects keyboard closing", () => {
    // Start with keyboard open
    const vv = window.visualViewport as { height: number };
    vv.height = 300;

    const { result } = renderHook(() => useVisualViewport());
    expect(result.current.isKeyboardOpen).toBe(true);

    // Simulate keyboard closing
    act(() => {
      vv.height = 667;
      resizeListeners.forEach((listener) => listener());
    });

    expect(result.current.height).toBe(667);
    expect(result.current.isKeyboardOpen).toBe(false);
  });

  it("uses threshold of 150px for keyboard detection", () => {
    const { result } = renderHook(() => useVisualViewport());
    const vv = window.visualViewport as { height: number };

    // 149px difference - should NOT be considered keyboard open
    act(() => {
      vv.height = 667 - 149;
      resizeListeners.forEach((listener) => listener());
    });
    expect(result.current.isKeyboardOpen).toBe(false);

    // 151px difference - should be considered keyboard open
    act(() => {
      vv.height = 667 - 151;
      resizeListeners.forEach((listener) => listener());
    });
    expect(result.current.isKeyboardOpen).toBe(true);
  });

  it("cleans up event listener on unmount", () => {
    const vv = window.visualViewport as unknown as {
      removeEventListener: ReturnType<typeof vi.fn>;
    };
    const { unmount } = renderHook(() => useVisualViewport());
    unmount();

    expect(vv.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  // Note: Testing missing visualViewport requires isolating the test
  // which is complex in JSDOM. The hook handles this case with a guard:
  // if (!window.visualViewport) return;
});
