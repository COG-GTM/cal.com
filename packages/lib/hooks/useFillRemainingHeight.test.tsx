import { render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFillRemainingHeight } from "./useFillRemainingHeight";

function TestComponent({ offset }: { offset?: number }) {
  const ref = useFillRemainingHeight<HTMLDivElement>(offset);
  return <div data-testid="filled" ref={ref} />;
}

describe("useFillRemainingHeight", () => {
  it("sets the height from the element position", () => {
    const { getByTestId } = render(<TestComponent />);

    expect(getByTestId("filled").style.height).toBe("calc(100dvh - 0px)");
  });

  it("accounts for the offset", () => {
    const { getByTestId } = render(<TestComponent offset={24} />);

    expect(getByTestId("filled").style.height).toBe("calc(100dvh - 24px)");
  });

  it("recomputes when the offset changes", () => {
    const { getByTestId, rerender } = render(<TestComponent offset={10} />);
    expect(getByTestId("filled").style.height).toBe("calc(100dvh - 10px)");

    rerender(<TestComponent offset={40} />);

    expect(getByTestId("filled").style.height).toBe("calc(100dvh - 40px)");
  });

  it("observes the body and disconnects on unmount", () => {
    const observe = vi.spyOn(globalThis.ResizeObserver.prototype, "observe");
    const disconnect = vi.spyOn(globalThis.ResizeObserver.prototype, "disconnect");

    try {
      const { unmount } = render(<TestComponent />);
      expect(observe).toHaveBeenCalledWith(document.body);

      unmount();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      observe.mockRestore();
      disconnect.mockRestore();
    }
  });

  it("does nothing while the ref is unattached", () => {
    expect(() => renderHook(() => useFillRemainingHeight())).not.toThrow();
  });
});
