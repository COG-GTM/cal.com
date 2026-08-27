import { describe, expect, it } from "vitest";
import { currencyOptions, currencySymbols, isAcceptedCurrencyCode } from "../currencyOptions";

describe("currencyOptions", () => {
  it("exposes a symbol for every selectable currency", () => {
    for (const option of currencyOptions) {
      expect(currencySymbols[option.value]).toBeTruthy();
    }
    expect(Object.keys(currencySymbols)).toHaveLength(currencyOptions.length);
  });

  it("narrows accepted currency codes", () => {
    expect(isAcceptedCurrencyCode("USD")).toBe(true);
    expect(isAcceptedCurrencyCode("usd")).toBe(false);
    expect(isAcceptedCurrencyCode("XYZ")).toBe(false);
  });
});
