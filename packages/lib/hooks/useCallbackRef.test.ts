import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCallbackRef } from "./useCallbackRef";

describe("useCallbackRef", () => {
  it("returns a ref holding the initial callback", () => {
    const callback = () => "initial";

    const { result } = renderHook(() => useCallbackRef(callback));

    expect(result.current.current).toBe(callback);
  });

  it("keeps the ref identity stable while updating the stored callback", () => {
    const first = () => "first";
    const second = () => "second";

    const { result, rerender } = renderHook(({ cb }) => useCallbackRef(cb), {
      initialProps: { cb: first },
    });
    const refObject = result.current;

    rerender({ cb: second });

    expect(result.current).toBe(refObject);
    expect(result.current.current).toBe(second);
  });
});
