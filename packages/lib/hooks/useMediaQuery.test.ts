import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useMediaQuery from "./useMediaQuery";

const originalMatchMedia = window.matchMedia;

type Listener = () => void;

function mockMatchMedia(initialMatches: Record<string, boolean>) {
  const matches = { ...initialMatches };
  const listeners = new Map<string, Set<Listener>>();

  window.matchMedia = vi.fn((query: string) => ({
    matches: matches[query] ?? false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: Listener) => {
      const queryListeners = listeners.get(query) ?? new Set<Listener>();
      queryListeners.add(listener);
      listeners.set(query, queryListeners);
    }),
    removeEventListener: vi.fn((_event: string, listener: Listener) => {
      listeners.get(query)?.delete(listener);
    }),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;

  return {
    setMatches(query: string, value: boolean) {
      matches[query] = value;
      listeners.get(query)?.forEach((listener) => listener());
    },
    listenerCount(query: string) {
      return listeners.get(query)?.size ?? 0;
    },
  };
}

describe("useMediaQuery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("returns the current match state of the query", () => {
    mockMatchMedia({ "(min-width: 768px)": true });

    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    expect(result.current).toBe(true);
  });

  it("returns false when the query does not match", () => {
    mockMatchMedia({ "(min-width: 768px)": false });

    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    expect(result.current).toBe(false);
  });

  it("re-renders when the media query changes", () => {
    const media = mockMatchMedia({ "(min-width: 768px)": false });
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    act(() => {
      media.setMatches("(min-width: 768px)", true);
    });

    expect(result.current).toBe(true);
  });

  it("resubscribes when the query changes", () => {
    const media = mockMatchMedia({ "(min-width: 100px)": false, "(min-width: 200px)": true });

    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: "(min-width: 100px)" },
    });
    expect(result.current).toBe(false);

    rerender({ query: "(min-width: 200px)" });

    expect(result.current).toBe(true);
    expect(media.listenerCount("(min-width: 100px)")).toBe(0);
    expect(media.listenerCount("(min-width: 200px)")).toBe(1);
  });

  it("unsubscribes on unmount", () => {
    const media = mockMatchMedia({ "(min-width: 768px)": true });

    const { unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    unmount();

    expect(media.listenerCount("(min-width: 768px)")).toBe(0);
  });
});
