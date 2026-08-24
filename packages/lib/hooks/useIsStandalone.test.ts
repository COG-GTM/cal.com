import { renderHook } from "@testing-library/react";
import { useSearchParams } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { useIsStandalone } from "./useIsStandalone";

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));

const useSearchParamsMock = vi.mocked(useSearchParams);

function mockSearchParams(query: string | null): void {
  useSearchParamsMock.mockReturnValue(
    (query === null ? null : new URLSearchParams(query)) as unknown as ReturnType<typeof useSearchParams>
  );
}

describe("useIsStandalone", () => {
  it("is true when standalone=true", () => {
    mockSearchParams("standalone=true");

    const { result } = renderHook(() => useIsStandalone());

    expect(result.current).toBe(true);
  });

  it("is false for any other value", () => {
    mockSearchParams("standalone=false");

    const { result } = renderHook(() => useIsStandalone());

    expect(result.current).toBe(false);
  });

  it("is false when the param is absent", () => {
    mockSearchParams("");

    const { result } = renderHook(() => useIsStandalone());

    expect(result.current).toBe(false);
  });

  it("is false when there are no search params at all", () => {
    mockSearchParams(null);

    const { result } = renderHook(() => useIsStandalone());

    expect(result.current).toBe(false);
  });
});
