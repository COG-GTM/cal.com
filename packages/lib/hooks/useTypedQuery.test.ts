import { act, renderHook } from "@testing-library/react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { queryNumberArray, queryStringArray, useTypedQuery } from "./useTypedQuery";

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
  ReadonlyURLSearchParams: class extends URLSearchParams {},
}));

const useParamsMock = vi.mocked(useParams);
const usePathnameMock = vi.mocked(usePathname);
const useRouterMock = vi.mocked(useRouter);
const useSearchParamsMock = vi.mocked(useSearchParams);
const replace = vi.fn();

const schema = z.object({
  name: z.string().optional(),
  ids: queryNumberArray.optional(),
  tags: queryStringArray.optional(),
});

function mockQuery(search: string, pathname: string | null = "/bookings"): void {
  useSearchParamsMock.mockReturnValue(new URLSearchParams(search) as ReturnType<typeof useSearchParams>);
  useParamsMock.mockReturnValue({});
  usePathnameMock.mockReturnValue(pathname as string);
  useRouterMock.mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
}

describe("queryNumberArray", () => {
  it("splits a comma separated string", () => {
    expect(queryNumberArray.parse("1,2")).toEqual([1, 2]);
  });

  it("passes an array through", () => {
    expect(queryNumberArray.parse([1, 2])).toEqual([1, 2]);
  });

  it("wraps a single number", () => {
    expect(queryNumberArray.parse(3)).toEqual([3]);
  });
});

describe("queryStringArray", () => {
  it("splits a comma separated string", () => {
    expect(queryStringArray.parse("a,b")).toEqual(["a", "b"]);
  });
});

describe("useTypedQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replace.mockClear();
  });

  it("parses the query according to the schema", () => {
    mockQuery("name=team&ids=1,2");

    const { result } = renderHook(() => useTypedQuery(schema));

    expect(result.current.data).toEqual({ name: "team", ids: [1, 2] });
  });

  it("logs and keeps an empty object when parsing fails", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockQuery("ids=notanumber");

    const { result } = renderHook(() => useTypedQuery(z.object({ ids: z.number() })));

    expect(result.current.data).toEqual({});
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("setQuery replaces the url with the merged params", () => {
    mockQuery("name=team");

    const { result } = renderHook(() => useTypedQuery(schema));
    act(() => {
      result.current.setQuery("name", "personal");
    });

    expect(replace).toHaveBeenCalledWith("/bookings?name=personal");
  });

  it("removeByKey drops the key from the url", () => {
    mockQuery("name=team&tags=a");

    const { result } = renderHook(() => useTypedQuery(schema));
    act(() => {
      result.current.removeByKey("name");
    });

    expect(replace).toHaveBeenCalledWith("/bookings?tags=a");
  });

  it("pushItemToKey appends to an existing array", () => {
    mockQuery("tags=a");

    const { result } = renderHook(() => useTypedQuery(schema));
    act(() => {
      result.current.pushItemToKey("tags", "b");
    });

    expect(replace).toHaveBeenCalledWith("/bookings?tags=a%2Cb");
  });

  it("pushItemToKey ignores values that are already present", () => {
    mockQuery("tags=a");

    const { result } = renderHook(() => useTypedQuery(schema));
    act(() => {
      result.current.pushItemToKey("tags", "a");
    });

    expect(replace).not.toHaveBeenCalled();
  });

  it("pushItemToKey creates the array when the key is missing", () => {
    mockQuery("");

    const { result } = renderHook(() => useTypedQuery(schema));
    act(() => {
      result.current.pushItemToKey("tags", "a");
    });

    expect(replace).toHaveBeenCalledWith("/bookings?tags=a");
  });

  it("removeItemByKeyAndValue keeps the remaining values", () => {
    mockQuery("tags=a,b");

    const { result } = renderHook(() => useTypedQuery(schema));
    act(() => {
      result.current.removeItemByKeyAndValue("tags", "a");
    });

    expect(replace).toHaveBeenCalledWith("/bookings?tags=b");
  });

  it("removeItemByKeyAndValue removes the key when it holds the last value", () => {
    mockQuery("tags=a&name=team");

    const { result } = renderHook(() => useTypedQuery(schema));
    act(() => {
      result.current.removeItemByKeyAndValue("tags", "a");
    });

    expect(replace).toHaveBeenCalledWith("/bookings?name=team");
  });

  it("removeAllQueryParams replaces with the bare pathname", () => {
    mockQuery("tags=a");

    const { result } = renderHook(() => useTypedQuery(schema));
    act(() => {
      result.current.removeAllQueryParams();
    });

    expect(replace).toHaveBeenCalledWith("/bookings");
  });

  it("removeAllQueryParams does nothing without a pathname", () => {
    mockQuery("tags=a", null);

    const { result } = renderHook(() => useTypedQuery(schema));
    act(() => {
      result.current.removeAllQueryParams();
    });

    expect(replace).not.toHaveBeenCalled();
  });

  it("writes schema defaults that are missing from the query to the url", () => {
    mockQuery("");

    renderHook(() => useTypedQuery(z.object({ status: z.string().default("upcoming") })));

    expect(replace).toHaveBeenCalledWith("/bookings?status=upcoming");
  });
});
