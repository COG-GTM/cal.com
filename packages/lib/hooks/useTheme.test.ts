import { useEmbedTheme } from "@calcom/embed-core/embed-iframe";
import { renderHook } from "@testing-library/react";
import { useTheme as useNextTheme } from "next-themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useTheme, { useGetTheme } from "./useTheme";

vi.mock("next-themes", () => ({
  useTheme: vi.fn(),
}));

vi.mock("@calcom/embed-core/embed-iframe", () => ({
  useEmbedTheme: vi.fn(),
}));

const useNextThemeMock = vi.mocked(useNextTheme);
const useEmbedThemeMock = vi.mocked(useEmbedTheme);
const setTheme = vi.fn();

function mockNextTheme(overrides: Partial<ReturnType<typeof useNextTheme>> = {}): void {
  useNextThemeMock.mockReturnValue({
    setTheme,
    resolvedTheme: "light",
    forcedTheme: undefined,
    theme: "light",
    ...overrides,
  } as ReturnType<typeof useNextTheme>);
}

describe("useTheme", () => {
  beforeEach(() => {
    setTheme.mockClear();
    useEmbedThemeMock.mockReturnValue(undefined as unknown as ReturnType<typeof useEmbedTheme>);
    mockNextTheme();
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("applies the requested theme", () => {
    renderHook(() => useTheme("dark"));

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("does not re-apply the already active theme", () => {
    mockNextTheme({ theme: "dark" });

    renderHook(() => useTheme("dark"));

    expect(setTheme).not.toHaveBeenCalled();
  });

  it("falls back to the theme persisted in local storage", () => {
    window.localStorage.setItem("app-theme", "dark");

    renderHook(() => useTheme(null));

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("falls back to the system theme when nothing is persisted", () => {
    renderHook(() => useTheme(null));

    expect(setTheme).toHaveBeenCalledWith("system");
  });

  it("lets the embed theme take precedence", () => {
    useEmbedThemeMock.mockReturnValue("dark" as ReturnType<typeof useEmbedTheme>);

    renderHook(() => useTheme("light"));

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("maps the auto embed theme to the system theme", () => {
    useEmbedThemeMock.mockReturnValue("auto" as ReturnType<typeof useEmbedTheme>);

    renderHook(() => useTheme("light"));

    expect(setTheme).toHaveBeenCalledWith("system");
  });

  it("returns the current theme values without applying anything in getOnly mode", () => {
    mockNextTheme({ resolvedTheme: "dark", forcedTheme: "light", theme: "dark" });

    const { result } = renderHook(() => useTheme("dark", true));

    expect(result.current).toEqual({ resolvedTheme: "dark", forcedTheme: "light", activeTheme: "dark" });
    expect(setTheme).not.toHaveBeenCalled();
  });

  it("returns undefined when it is used to set a theme", () => {
    const { result } = renderHook(() => useTheme("dark"));

    expect(result.current).toBeUndefined();
  });
});

describe("useGetTheme", () => {
  beforeEach(() => {
    setTheme.mockClear();
    useEmbedThemeMock.mockReturnValue(undefined as unknown as ReturnType<typeof useEmbedTheme>);
    mockNextTheme({ resolvedTheme: "dark", theme: "dark" });
  });

  it("reads the theme without setting it", () => {
    const { result } = renderHook(() => useGetTheme());

    expect(result.current).toEqual({ resolvedTheme: "dark", forcedTheme: undefined, activeTheme: "dark" });
    expect(setTheme).not.toHaveBeenCalled();
  });
});
