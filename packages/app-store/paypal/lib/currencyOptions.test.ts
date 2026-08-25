import { describe, expect, it } from "vitest";
import { currencyOptions, currencySymbols, isAcceptedCurrencyCode } from "./currencyOptions";

describe("currencyOptions", () => {
  it("has a symbol for every offered currency", () => {
    expect(Object.keys(currencySymbols).sort()).toEqual(currencyOptions.map((o) => o.value).sort());
  });

  it("has no duplicate currency codes", () => {
    const values = currencyOptions.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("isAcceptedCurrencyCode", () => {
  it("accepts supported codes", () => {
    expect(isAcceptedCurrencyCode("USD")).toBe(true);
    expect(isAcceptedCurrencyCode("THB")).toBe(true);
  });

  it("rejects unsupported codes", () => {
    expect(isAcceptedCurrencyCode("XXX")).toBe(false);
    expect(isAcceptedCurrencyCode("usd")).toBe(false);
  });
});
