import { describe, expect, it } from "vitest";
import { calculateDeltaType } from "../calculateDeltaType";

describe("calculateDeltaType", () => {
  it("returns unchanged for a zero delta", () => {
    expect(calculateDeltaType(0)).toBe("unchanged");
  });

  it("distinguishes moderate from strong increases at the 10 boundary", () => {
    expect(calculateDeltaType(0.5)).toBe("moderateIncrease");
    expect(calculateDeltaType(10)).toBe("moderateIncrease");
    expect(calculateDeltaType(10.1)).toBe("increase");
  });

  it("distinguishes moderate from strong decreases at the -10 boundary", () => {
    expect(calculateDeltaType(-0.5)).toBe("moderateDecrease");
    expect(calculateDeltaType(-10)).toBe("moderateDecrease");
    expect(calculateDeltaType(-10.1)).toBe("decrease");
  });
});
