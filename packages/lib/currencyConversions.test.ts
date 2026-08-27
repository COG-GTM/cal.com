import { describe, expect, it, vi } from "vitest";
import {
  convertFromSmallestToPresentableCurrencyUnit,
  convertToSmallestCurrencyUnit,
  formatPrice,
  getCurrencySymbol,
} from "./currencyConversions";

describe("convertToSmallestCurrencyUnit", () => {
  it("multiplies by 100 for decimal currencies", () => {
    expect(convertToSmallestCurrencyUnit(10, "USD")).toBe(1000);
    expect(convertToSmallestCurrencyUnit(10.5, "eur")).toBe(1050);
  });

  it("rounds to the nearest integer", () => {
    expect(convertToSmallestCurrencyUnit(10.555, "USD")).toBe(1056);
  });

  it("returns the amount unchanged for zero-decimal currencies", () => {
    expect(convertToSmallestCurrencyUnit(500, "JPY")).toBe(500);
    expect(convertToSmallestCurrencyUnit(500, "krw")).toBe(500);
  });
});

describe("convertFromSmallestToPresentableCurrencyUnit", () => {
  it("divides by 100 for decimal currencies", () => {
    expect(convertFromSmallestToPresentableCurrencyUnit(1050, "USD")).toBe(10.5);
  });

  it("returns the amount unchanged for zero-decimal currencies", () => {
    expect(convertFromSmallestToPresentableCurrencyUnit(500, "vnd")).toBe(500);
  });
});

describe("getCurrencySymbol", () => {
  it("returns the symbol for known currencies", () => {
    expect(getCurrencySymbol("USD")).toBe("$");
    expect(getCurrencySymbol("EUR")).toBe("€");
    expect(getCurrencySymbol("JPY")).toBe("¥");
  });

  it("falls back to $ for invalid currency codes", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(getCurrencySymbol("NOT_A_CURRENCY")).toBe("$");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("formatPrice", () => {
  it("formats BTC as sats without conversion", () => {
    expect(formatPrice(150, "BTC")).toBe("150 sats");
  });

  it("formats decimal currencies from the smallest unit", () => {
    expect(formatPrice(1050, "USD")).toBe("$10.50");
  });

  it("formats zero-decimal currencies without dividing", () => {
    expect(formatPrice(500, "JPY")).toBe("¥500");
  });

  it("defaults to USD when currency is undefined", () => {
    expect(formatPrice(1000, undefined)).toBe("$10.00");
  });

  it("respects the locale argument", () => {
    expect(formatPrice(1050, "EUR", "de").replace(/\u00a0/g, " ")).toBe("10,50 €");
  });
});
