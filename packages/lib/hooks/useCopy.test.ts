import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCopy } from "./useCopy";

const originalClipboard = navigator.clipboard;
const originalClipboardItem = globalThis.ClipboardItem;

type ClipboardStub = { writeText: ReturnType<typeof vi.fn>; write?: ReturnType<typeof vi.fn> };

function setClipboard(clipboard: ClipboardStub | undefined): void {
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
    writable: true,
  });
}

describe("useCopy", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    setClipboard(originalClipboard as unknown as ClipboardStub);
    globalThis.ClipboardItem = originalClipboardItem;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("copyToClipboard", () => {
    it("writes the text and flags the copied state", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });
      const onSuccess = vi.fn();

      const { result } = renderHook(() => useCopy());
      act(() => {
        result.current.copyToClipboard("https://cal.com", { onSuccess });
      });

      await waitFor(() => expect(result.current.isCopied).toBe(true));
      expect(writeText).toHaveBeenCalledWith("https://cal.com");
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it("reports failures from the clipboard api", async () => {
      setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
      const onFailure = vi.fn();

      const { result } = renderHook(() => useCopy());
      act(() => {
        result.current.copyToClipboard("text", { onFailure });
      });

      await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
      expect(result.current.isCopied).toBe(false);
      expect(console.error).toHaveBeenCalled();
    });

    it("warns and fails when the clipboard api is unavailable", () => {
      setClipboard(undefined);
      const onFailure = vi.fn();

      const { result } = renderHook(() => useCopy());
      act(() => {
        result.current.copyToClipboard("text", { onFailure });
      });

      expect(console.warn).toHaveBeenCalled();
      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(result.current.isCopied).toBe(false);
    });

    it("does not throw when no callbacks are provided", () => {
      setClipboard(undefined);

      const { result } = renderHook(() => useCopy());

      expect(() => act(() => result.current.copyToClipboard("text"))).not.toThrow();
    });

    it("resets the copied state after three seconds", async () => {
      vi.useFakeTimers();
      setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });

      const { result } = renderHook(() => useCopy());
      await act(async () => {
        result.current.copyToClipboard("text");
      });
      expect(result.current.isCopied).toBe(true);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.isCopied).toBe(false);
    });

    it("exposes a manual reset", async () => {
      setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });

      const { result } = renderHook(() => useCopy());
      act(() => {
        result.current.copyToClipboard("text");
      });
      await waitFor(() => expect(result.current.isCopied).toBe(true));

      act(() => {
        result.current.resetCopyStatus();
      });

      expect(result.current.isCopied).toBe(false);
    });
  });

  describe("fetchAndCopyToClipboard", () => {
    it("wraps the promise in a ClipboardItem when the write api exists", async () => {
      const write = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText: vi.fn(), write });
      const items: Record<string, Promise<Blob | string>>[] = [];
      globalThis.ClipboardItem = vi.fn(function (this: unknown, item) {
        items.push(item);
      }) as unknown as typeof ClipboardItem;
      const onSuccess = vi.fn();

      const { result } = renderHook(() => useCopy());
      act(() => {
        result.current.fetchAndCopyToClipboard(Promise.resolve("https://cal.com"), { onSuccess });
      });

      expect(write).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
      await expect(items[0]["text/plain"]).resolves.toBeInstanceOf(Blob);
    });

    it("reports failures of the wrapped promise", async () => {
      setClipboard({ writeText: vi.fn(), write: vi.fn().mockResolvedValue(undefined) });
      const items: Record<string, Promise<Blob | string>>[] = [];
      globalThis.ClipboardItem = vi.fn(function (this: unknown, item) {
        items.push(item);
      }) as unknown as typeof ClipboardItem;
      const onFailure = vi.fn();

      const { result } = renderHook(() => useCopy());
      act(() => {
        result.current.fetchAndCopyToClipboard(Promise.reject(new Error("nope")), { onFailure });
      });

      await expect(items[0]["text/plain"]).resolves.toBe("");
      expect(onFailure).toHaveBeenCalledTimes(1);
    });

    it("falls back to writeText when the write api is missing", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });

      const { result } = renderHook(() => useCopy());
      act(() => {
        result.current.fetchAndCopyToClipboard(Promise.resolve("https://cal.com"));
      });

      await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://cal.com"));
      await waitFor(() => expect(result.current.isCopied).toBe(true));
    });

    it("reports failures of the fallback path", async () => {
      setClipboard({ writeText: vi.fn() });
      const onFailure = vi.fn();

      const { result } = renderHook(() => useCopy());
      act(() => {
        result.current.fetchAndCopyToClipboard(Promise.reject(new Error("nope")), { onFailure });
      });

      await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
    });
  });
});
