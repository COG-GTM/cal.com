import { describe, expect, it } from "vitest";
import { valueFormatter } from "../valueFormatter";

describe("valueFormatter", () => {
  it("formats numbers using the runtime locale grouping", () => {
    expect(valueFormatter(1234567)).toBe(Intl.NumberFormat().format(1234567));
  });

  it("formats zero and negative numbers", () => {
    expect(valueFormatter(0)).toBe(Intl.NumberFormat().format(0));
    expect(valueFormatter(-42)).toBe(Intl.NumberFormat().format(-42));
  });

  it("returns a string", () => {
    expect(typeof valueFormatter(5)).toBe("string");
  });
});
