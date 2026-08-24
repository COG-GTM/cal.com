import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeyPress } from "./useKeyPress";

function dispatchKey(target: Window | HTMLElement, type: "keydown" | "keyup", key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  });
}

describe("useKeyPress", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("tracks the pressed state of the target key on window", () => {
    const { result } = renderHook(() => useKeyPress("Enter"));
    expect(result.current).toBe(false);

    dispatchKey(window, "keydown", "Enter");
    expect(result.current).toBe(true);

    dispatchKey(window, "keyup", "Enter");
    expect(result.current).toBe(false);
  });

  it("ignores other keys", () => {
    const { result } = renderHook(() => useKeyPress("Enter"));

    dispatchKey(window, "keydown", "Escape");
    expect(result.current).toBe(false);

    dispatchKey(window, "keydown", "Enter");
    dispatchKey(window, "keyup", "Escape");
    expect(result.current).toBe(true);
  });

  it("invokes the handler on keydown of the target key", () => {
    const handler = vi.fn();
    renderHook(() => useKeyPress("Escape", undefined, handler));

    dispatchKey(window, "keydown", "Escape");
    dispatchKey(window, "keydown", "Enter");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("listens on the provided element instead of window", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const ref = { current: input } as RefObject<HTMLInputElement>;

    const { result } = renderHook(() => useKeyPress("a", ref));

    dispatchKey(input, "keydown", "a");
    expect(result.current).toBe(true);

    dispatchKey(input, "keyup", "a");
    expect(result.current).toBe(false);
  });

  it("falls back to window when the provided ref is empty", () => {
    const ref = { current: null } as RefObject<HTMLInputElement>;

    const { result } = renderHook(() => useKeyPress("a", ref));

    dispatchKey(window, "keydown", "a");
    expect(result.current).toBe(true);
  });

  it("removes its listeners on unmount", () => {
    const removeEventListener = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useKeyPress("Enter"));
    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("keyup", expect.any(Function));
  });

  it("removes element listeners on unmount", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const removeEventListener = vi.spyOn(input, "removeEventListener");

    const { unmount } = renderHook(() => useKeyPress("a", { current: input } as RefObject<HTMLInputElement>));
    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("keyup", expect.any(Function));
  });
});
