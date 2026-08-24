import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

const instances: MockIntersectionObserver[] = [];

class MockIntersectionObserver {
  observed: Element[] = [];
  disconnected = false;

  constructor(
    public callback: ObserverCallback,
    public options: { root?: Element | Document | null }
  ) {
    instances.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  disconnect() {
    this.disconnected = true;
  }

  unobserve() {}

  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting }]);
  }
}

async function importHook() {
  return (await import("./useInViewObserver")).useInViewObserver;
}

function appendChildDiv(): HTMLDivElement {
  const parent = document.createElement("div");
  const child = document.createElement("div");
  parent.appendChild(child);
  document.body.appendChild(parent);
  return child;
}

describe("useInViewObserver", () => {
  beforeEach(() => {
    vi.resetModules();
    instances.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  describe("when IntersectionObserver is supported", () => {
    beforeEach(() => {
      vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    });

    it("invokes the callback when the observed node intersects", async () => {
      const useInViewObserver = await importHook();
      const onInView = vi.fn();
      const node = appendChildDiv();

      const { result } = renderHook(() => useInViewObserver(onInView));
      act(() => {
        result.current.ref(node);
      });

      expect(instances[0].observed).toEqual([node]);
      instances[0].trigger(true);
      expect(onInView).toHaveBeenCalledTimes(1);
    });

    it("does not invoke the callback when the node is not intersecting", async () => {
      const useInViewObserver = await importHook();
      const onInView = vi.fn();
      const node = appendChildDiv();

      const { result } = renderHook(() => useInViewObserver(onInView));
      act(() => {
        result.current.ref(node);
      });
      instances[0].trigger(false);

      expect(onInView).not.toHaveBeenCalled();
    });

    it("always calls the latest callback without re-creating the observer", async () => {
      const useInViewObserver = await importHook();
      const first = vi.fn();
      const second = vi.fn();
      const node = appendChildDiv();

      const { result, rerender } = renderHook(({ cb }) => useInViewObserver(cb), {
        initialProps: { cb: first },
      });
      act(() => {
        result.current.ref(node);
      });
      rerender({ cb: second });
      instances[0].trigger(true);

      expect(instances).toHaveLength(1);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("defaults the root to document.body and accepts an explicit null root", async () => {
      const useInViewObserver = await importHook();
      const node = appendChildDiv();

      const { result } = renderHook(() => useInViewObserver(vi.fn()));
      act(() => {
        result.current.ref(node);
      });
      expect(instances[0].options.root).toBe(document.body);

      const explicitNullRoot = renderHook(() => useInViewObserver(vi.fn(), null));
      act(() => {
        explicitNullRoot.result.current.ref(appendChildDiv());
      });
      expect(instances[1].options.root).toBeNull();
    });

    it("does not observe a node without a parent element", async () => {
      const useInViewObserver = await importHook();

      const { result } = renderHook(() => useInViewObserver(vi.fn()));
      act(() => {
        result.current.ref(document.createElement("div"));
      });

      expect(instances).toHaveLength(0);
    });

    it("disconnects the observer on unmount", async () => {
      const useInViewObserver = await importHook();
      const node = appendChildDiv();

      const { result, unmount } = renderHook(() => useInViewObserver(vi.fn()));
      act(() => {
        result.current.ref(node);
      });
      unmount();

      expect(instances[0].disconnected).toBe(true);
    });
  });

  describe("when IntersectionObserver is unsupported", () => {
    it("skips observing entirely", async () => {
      const originalIntersectionObserver = window.IntersectionObserver;
      // @ts-expect-error deleting an optional browser global to simulate an unsupported environment
      delete window.IntersectionObserver;

      try {
        const useInViewObserver = await importHook();
        const node = appendChildDiv();

        const { result } = renderHook(() => useInViewObserver(vi.fn()));
        act(() => {
          result.current.ref(node);
        });

        expect(instances).toHaveLength(0);
      } finally {
        window.IntersectionObserver = originalIntersectionObserver;
      }
    });
  });
});
