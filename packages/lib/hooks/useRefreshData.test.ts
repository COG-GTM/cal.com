import { renderHook } from "@testing-library/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { useRefreshData } from "./useRefreshData";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

const usePathnameMock = vi.mocked(usePathname);
const useRouterMock = vi.mocked(useRouter);
const useSearchParamsMock = vi.mocked(useSearchParams);

describe("useRefreshData", () => {
  it("refreshes the server components and replaces the current url", () => {
    const refresh = vi.fn();
    const replace = vi.fn();
    usePathnameMock.mockReturnValue("/bookings");
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("status=upcoming") as ReturnType<typeof useSearchParams>
    );
    useRouterMock.mockReturnValue({ refresh, replace } as unknown as ReturnType<typeof useRouter>);

    const { result } = renderHook(() => useRefreshData());
    result.current();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/bookings?status=upcoming");
  });

  it("only replaces when the router has no refresh method", () => {
    const replace = vi.fn();
    usePathnameMock.mockReturnValue("/bookings");
    useSearchParamsMock.mockReturnValue(new URLSearchParams() as ReturnType<typeof useSearchParams>);
    useRouterMock.mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);

    const { result } = renderHook(() => useRefreshData());
    result.current();

    expect(replace).toHaveBeenCalledWith("/bookings?");
  });
});
