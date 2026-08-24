import { renderHook } from "@testing-library/react";
import { useParams, useSearchParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRouterQuery } from "./useRouterQuery";

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
  useSearchParams: vi.fn(),
  ReadonlyURLSearchParams: class extends URLSearchParams {},
}));

const useParamsMock = vi.mocked(useParams);
const useSearchParamsMock = vi.mocked(useSearchParams);

function mockQuery(search: string): void {
  useSearchParamsMock.mockReturnValue(new URLSearchParams(search) as ReturnType<typeof useSearchParams>);
  useParamsMock.mockReturnValue({});
}

describe("useRouterQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns single values as strings", () => {
    mockQuery("status=upcoming&page=2");

    const { result } = renderHook(() => useRouterQuery());

    expect(result.current).toEqual({ status: "upcoming", page: "2" });
  });

  it("collects duplicate keys into an array", () => {
    mockQuery("status=upcoming&status=past");

    const { result } = renderHook(() => useRouterQuery());

    expect(result.current).toEqual({ status: ["upcoming", "past"] });
  });

  it("keeps appending to an already created array", () => {
    mockQuery("status=upcoming&status=past&status=cancelled");

    const { result } = renderHook(() => useRouterQuery());

    expect(result.current).toEqual({ status: ["upcoming", "past", "cancelled"] });
  });

  it("returns an empty object when there is no query", () => {
    mockQuery("");

    const { result } = renderHook(() => useRouterQuery());

    expect(result.current).toEqual({});
  });

  it("includes route params", () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("a=1") as ReturnType<typeof useSearchParams>);
    useParamsMock.mockReturnValue({ slug: "team" });

    const { result } = renderHook(() => useRouterQuery());

    expect(result.current).toEqual({ a: "1", slug: "team" });
  });
});
