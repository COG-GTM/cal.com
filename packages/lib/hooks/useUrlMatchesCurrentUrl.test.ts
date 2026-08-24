import { renderHook } from "@testing-library/react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUrlMatchesCurrentUrl } from "./useUrlMatchesCurrentUrl";

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
  ReadonlyURLSearchParams: class extends URLSearchParams {},
}));

const useParamsMock = vi.mocked(useParams);
const usePathnameMock = vi.mocked(usePathname);
const useSearchParamsMock = vi.mocked(useSearchParams);

function mockLocation(pathname: string | null, search = ""): void {
  usePathnameMock.mockReturnValue(pathname as string);
  useSearchParamsMock.mockReturnValue(new URLSearchParams(search) as ReturnType<typeof useSearchParams>);
  useParamsMock.mockReturnValue({});
}

describe("useUrlMatchesCurrentUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches a partial pathname by default", () => {
    mockLocation("/event-types/1");

    const { result } = renderHook(() => useUrlMatchesCurrentUrl("/event-types"));

    expect(result.current).toBe(true);
  });

  it("does not match an unrelated pathname", () => {
    mockLocation("/bookings");

    const { result } = renderHook(() => useUrlMatchesCurrentUrl("/event-types"));

    expect(result.current).toBe(false);
  });

  it("appends the query string when comparing", () => {
    mockLocation("/bookings", "status=upcoming");

    const { result } = renderHook(() => useUrlMatchesCurrentUrl("/bookings?status=upcoming", true));

    expect(result.current).toBe(true);
  });

  it("requires an exact match when matchFullPath is set", () => {
    mockLocation("/event-types/1");

    const { result } = renderHook(() => useUrlMatchesCurrentUrl("/event-types", true));

    expect(result.current).toBe(false);
  });

  it("returns false when the pathname is null", () => {
    mockLocation(null);

    const { result } = renderHook(() => useUrlMatchesCurrentUrl("/bookings"));

    expect(result.current).toBe(false);
  });

  it("returns false when the pathname is null and a full match is requested", () => {
    mockLocation(null);

    const { result } = renderHook(() => useUrlMatchesCurrentUrl("/bookings", true));

    expect(result.current).toBe(false);
  });
});
