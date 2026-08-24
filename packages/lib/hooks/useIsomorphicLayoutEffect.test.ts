import { renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

describe("useIsomorphicLayoutEffect", () => {
  it("resolves to useLayoutEffect when document is defined", () => {
    expect(useIsomorphicLayoutEffect).toBe(useLayoutEffect);
  });

  it("runs the effect on mount", () => {
    const effect = vi.fn();

    renderHook(() => useIsomorphicLayoutEffect(effect, []));

    expect(effect).toHaveBeenCalledTimes(1);
  });
});
