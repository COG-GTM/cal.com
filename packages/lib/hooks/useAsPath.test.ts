import { renderHook } from "@testing-library/react";
import { usePathname, useSearchParams } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { useAsPath } from "./useAsPath";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

const usePathnameMock = vi.mocked(usePathname);
const useSearchParamsMock = vi.mocked(useSearchParams);

describe("useAsPath", () => {
  it("appends the serialized search params to the pathname", () => {
    usePathnameMock.mockReturnValue("/event-types");
    useSearchParamsMock.mockReturnValue(new URLSearchParams("a=1&b=2") as ReturnType<typeof useSearchParams>);

    const { result } = renderHook(() => useAsPath());

    expect(result.current).toBe("/event-types?a=1&b=2");
  });

  it("appends an empty query string when search params are empty", () => {
    usePathnameMock.mockReturnValue("/bookings");
    useSearchParamsMock.mockReturnValue(new URLSearchParams() as ReturnType<typeof useSearchParams>);

    const { result } = renderHook(() => useAsPath());

    expect(result.current).toBe("/bookings?");
  });

  it("returns only the pathname when search params are unavailable", () => {
    usePathnameMock.mockReturnValue("/bookings");
    useSearchParamsMock.mockReturnValue(null as unknown as ReturnType<typeof useSearchParams>);

    const { result } = renderHook(() => useAsPath());

    expect(result.current).toBe("/bookings");
  });

  it("recomputes when the pathname changes", () => {
    usePathnameMock.mockReturnValue("/first");
    useSearchParamsMock.mockReturnValue(new URLSearchParams("a=1") as ReturnType<typeof useSearchParams>);

    const { result, rerender } = renderHook(() => useAsPath());
    expect(result.current).toBe("/first?a=1");

    usePathnameMock.mockReturnValue("/second");
    rerender();

    expect(result.current).toBe("/second?a=1");
  });
});
