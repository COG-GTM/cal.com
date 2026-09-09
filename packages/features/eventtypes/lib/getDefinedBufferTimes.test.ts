import { describe, expect, it } from "vitest";
import { getDefinedBufferTimes } from "./getDefinedBufferTimes";

describe("getDefinedBufferTimes", () => {
  it("returns the supported buffer times in ascending order", () => {
    expect(getDefinedBufferTimes()).toEqual([5, 10, 15, 20, 30, 45, 60, 90, 120]);
  });

  it("returns a fresh array so callers cannot mutate the shared list", () => {
    const first = getDefinedBufferTimes();
    first.push(240);

    expect(getDefinedBufferTimes()).not.toContain(240);
  });
});
