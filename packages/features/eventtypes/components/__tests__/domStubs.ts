import { vi } from "vitest";

type MutableElement = typeof Element.prototype & { animate?: unknown };

/**
 * jsdom implements neither the Web Animations API used by @formkit/auto-animate
 * nor IntersectionObserver, both of which are pulled in by the shared UI components.
 */
export function installBrowserApiStubs() {
  const element = Element.prototype as MutableElement;
  if (!element.animate) {
    element.animate = vi.fn(() => ({
      cancel: vi.fn(),
      finish: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onfinish: null,
    }));
  }

  if (!("IntersectionObserver" in globalThis)) {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
        takeRecords = vi.fn(() => []);
        readonly root = null;
        readonly rootMargin = "";
        readonly thresholds: number[] = [];
      }
    );
  }
}
