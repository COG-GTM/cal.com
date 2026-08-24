import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePagination } from "./usePagination";

describe("usePagination", () => {
  it("falls back to the default page index and size", () => {
    const { result } = renderHook(() => usePagination({}));

    expect(result.current.pagination).toEqual({ pageIndex: 1, pageSize: 20 });
  });

  it("uses the provided defaults", () => {
    const { result } = renderHook(() => usePagination({ defaultPageIndex: 3, defaultPageSize: 50 }));

    expect(result.current.pagination).toEqual({ pageIndex: 3, pageSize: 50 });
  });

  it("updates the pagination state through setPagination", () => {
    const { result } = renderHook(() => usePagination({}));

    act(() => {
      result.current.setPagination({ pageIndex: 5, pageSize: 10 });
    });

    expect(result.current.pagination).toEqual({ pageIndex: 5, pageSize: 10 });
  });

  it("keeps the pagination object referentially stable across rerenders", () => {
    const { result, rerender } = renderHook(() => usePagination({}));
    const initialPagination = result.current.pagination;

    rerender();

    expect(result.current.pagination).toBe(initialPagination);
  });
});
