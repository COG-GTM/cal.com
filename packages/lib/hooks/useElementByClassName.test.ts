import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useElementByClassName } from "./useElementByClassName";

function appendDiv(className: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  document.body.appendChild(element);
  return element;
}

describe("useElementByClassName", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves the first element matching the class name", () => {
    const first = appendDiv("target");
    appendDiv("target");

    const { result } = renderHook(() => useElementByClassName("target"));

    expect(result.current.current).toBe(first);
  });

  it("returns a null ref when no element matches", () => {
    const { result } = renderHook(() => useElementByClassName("missing"));

    expect(result.current.current).toBeNull();
  });

  it("returns a null ref when no class name is given", () => {
    appendDiv("target");

    const { result } = renderHook(() => useElementByClassName());

    expect(result.current.current).toBeNull();
  });

  it("re-resolves the element when the class name changes", () => {
    const first = appendDiv("first");
    const second = appendDiv("second");

    const { result, rerender } = renderHook(({ className }) => useElementByClassName(className), {
      initialProps: { className: "first" as string | undefined },
    });
    expect(result.current.current).toBe(first);

    rerender({ className: "second" });
    expect(result.current.current).toBe(second);

    rerender({ className: undefined });
    expect(result.current.current).toBeNull();
  });
});
