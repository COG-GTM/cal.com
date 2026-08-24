import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useClientOnly } from "./useClientOnly";

describe("useClientOnly", () => {
  it("runs the callback once after mount", () => {
    const callback = vi.fn();

    renderHook(() => useClientOnly(callback));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not re-run the callback on rerenders", () => {
    const callback = vi.fn();

    const { rerender } = renderHook(() => useClientOnly(callback));
    rerender();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
