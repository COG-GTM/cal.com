import { renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useOnClickOutside from "./useOnclickOutside";

function appendDiv(): HTMLDivElement {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return element;
}

describe("useOnClickOutside", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("calls the handler when the event target is outside the ref", () => {
    const container = appendDiv();
    const outside = appendDiv();
    const handler = vi.fn();

    renderHook(() => useOnClickOutside({ current: container } as RefObject<HTMLDivElement>, handler));
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores events originating inside the ref", () => {
    const container = appendDiv();
    const child = document.createElement("span");
    container.appendChild(child);
    const handler = vi.fn();

    renderHook(() => useOnClickOutside({ current: container } as RefObject<HTMLDivElement>, handler));
    child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores events while the ref is empty", () => {
    const outside = appendDiv();
    const handler = vi.fn();

    renderHook(() => useOnClickOutside({ current: null } as RefObject<HTMLDivElement>, handler));
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("also reacts to touchstart events", () => {
    const container = appendDiv();
    const outside = appendDiv();
    const handler = vi.fn();

    renderHook(() => useOnClickOutside({ current: container } as RefObject<HTMLDivElement>, handler));
    outside.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("removes its listeners on unmount", () => {
    const container = appendDiv();
    const outside = appendDiv();
    const handler = vi.fn();

    const { unmount } = renderHook(() =>
      useOnClickOutside({ current: container } as RefObject<HTMLDivElement>, handler)
    );
    unmount();
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(handler).not.toHaveBeenCalled();
  });
});
