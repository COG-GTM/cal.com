import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTraceUpdate } from "./useTraceUpdate";

describe("useTraceUpdate", () => {
  it("does not throw on the initial render", () => {
    expect(() => renderHook(() => useTraceUpdate({ a: 1 }))).not.toThrow();
  });

  it("handles changed, unchanged and added props across rerenders", () => {
    const { rerender } = renderHook(({ props }) => useTraceUpdate(props), {
      initialProps: { props: { a: 1, b: "same" } as Record<string, unknown> },
    });

    expect(() => rerender({ props: { a: 2, b: "same", c: true } })).not.toThrow();
  });

  it("accepts array-like props", () => {
    expect(() => renderHook(() => useTraceUpdate([1, 2, 3]))).not.toThrow();
  });
});
