import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import useResponsive from "./useResponsive";

const originalInnerWidth = window.innerWidth;

function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
}

describe("useResponsive", () => {
  afterEach(() => {
    setWindowWidth(originalInnerWidth);
  });

  it.each([
    [500, "isSm"],
    [700, "isMd"],
    [900, "isLg"],
    [1200, "isXl"],
    [1400, "is2xl"],
  ] as const)("reports %ipx as %s", (width, expectedFlag) => {
    setWindowWidth(width);

    const { result } = renderHook(() => useResponsive());

    const activeFlags = Object.entries(result.current)
      .filter(([, isActive]) => isActive)
      .map(([flag]) => flag);
    expect(activeFlags).toEqual([expectedFlag]);
  });

  it("reports no breakpoint at or above 1536px", () => {
    setWindowWidth(1536);

    const { result } = renderHook(() => useResponsive());

    expect(Object.values(result.current).every((isActive) => !isActive)).toBe(true);
  });

  it("updates on window resize", () => {
    setWindowWidth(1200);
    const { result } = renderHook(() => useResponsive());
    expect(result.current.isXl).toBe(true);

    act(() => {
      setWindowWidth(500);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.isSm).toBe(true);
    expect(result.current.isXl).toBe(false);
  });

  it("stops listening after unmount", () => {
    setWindowWidth(1200);
    const { result, unmount } = renderHook(() => useResponsive());
    unmount();

    act(() => {
      setWindowWidth(500);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.isXl).toBe(true);
  });
});
