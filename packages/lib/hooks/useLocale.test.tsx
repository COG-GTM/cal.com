import { useAtomsContext } from "@calcom/atoms/hooks/useAtomsContext";
import { AppRouterI18nContext } from "@calcom/web/app/AppRouterI18nProvider";
import { CustomI18nContext } from "@calcom/web/app/CustomI18nProvider";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocale } from "./useLocale";

vi.mock("react-i18next", () => ({
  useTranslation: vi.fn(),
}));

vi.mock("@calcom/atoms/hooks/useAtomsContext", () => ({
  useAtomsContext: vi.fn(),
}));

const useTranslationMock = vi.mocked(useTranslation);
const useAtomsContextMock = vi.mocked(useAtomsContext);
const clientT = vi.fn((key: string) => `client:${key}`);

function AppRouterWrapper({
  children,
  locale,
  ns,
  translations,
}: {
  children: ReactNode;
  locale: string;
  ns: string;
  translations: Record<string, string>;
}) {
  return (
    <AppRouterI18nContext.Provider value={{ locale, ns, translations }}>
      {children}
    </AppRouterI18nContext.Provider>
  );
}

describe("useLocale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAtomsContextMock.mockReturnValue(undefined as unknown as ReturnType<typeof useAtomsContext>);
    useTranslationMock.mockReturnValue({
      t: clientT,
      i18n: { language: "en" },
    } as unknown as ReturnType<typeof useTranslation>);
  });

  it("builds an i18n instance from the app router context", () => {
    const { result } = renderHook(() => useLocale(), {
      wrapper: ({ children }) => (
        <AppRouterWrapper locale="en" ns="common" translations={{ hello: "Hello" }}>
          {children}
        </AppRouterWrapper>
      ),
    });

    expect(result.current.isLocaleReady).toBe(true);
    expect(result.current.t("hello")).toBe("Hello");
    expect(result.current.i18n.language).toBe("en");
  });

  it("reuses the cached instance for the same locale and namespace", () => {
    const render = () =>
      renderHook(() => useLocale(), {
        wrapper: ({ children }) => (
          <AppRouterWrapper locale="fr" ns="common" translations={{ hello: "Bonjour" }}>
            {children}
          </AppRouterWrapper>
        ),
      });

    const first = render().result.current;
    const second = render().result.current;

    expect(second.i18n).toBe(first.i18n);
  });

  it("lets the custom i18n context override the app router context", () => {
    const { result } = renderHook(() => useLocale(), {
      wrapper: ({ children }) => (
        <AppRouterWrapper locale="en" ns="common" translations={{ hello: "Hello" }}>
          <CustomI18nContext.Provider value={{ locale: "es", ns: "common", translations: { hello: "Hola" } }}>
            {children}
          </CustomI18nContext.Provider>
        </AppRouterWrapper>
      ),
    });

    expect(result.current.t("hello")).toBe("Hola");
  });

  it("falls back to the client side i18n outside of the app router", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { result } = renderHook(() => useLocale());

    expect(warn).toHaveBeenCalled();
    expect(result.current.t("hello")).toBe("client:hello");
    expect(result.current.isLocaleReady).toBe(true);
    warn.mockRestore();
  });

  it("prefers the atoms context when a clientId is present", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const atomsT = vi.fn((key: string) => `atoms:${key}`);
    useAtomsContextMock.mockReturnValue({
      clientId: "client-id",
      t: atomsT,
      i18n: { language: "de" },
    } as unknown as ReturnType<typeof useAtomsContext>);

    const { result } = renderHook(() => useLocale());

    expect(result.current.t("hello")).toBe("atoms:hello");
    expect(result.current.i18n.language).toBe("de");
    expect(result.current.isLocaleReady).toBe(true);
  });

  it("reports the locale as not ready when i18n is empty", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useTranslationMock.mockReturnValue({ t: clientT, i18n: {} } as unknown as ReturnType<
      typeof useTranslation
    >);

    const { result } = renderHook(() => useLocale());

    expect(result.current.isLocaleReady).toBe(false);
  });
});
