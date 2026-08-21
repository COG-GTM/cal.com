import { describe, expect, it } from "vitest";
import { getDefinedBufferTimes } from "./getDefinedBufferTimes";

describe("getDefinedBufferTimes", () => {
  it("returns the supported buffer durations in order", () => {
    expect(getDefinedBufferTimes()).toEqual([5, 10, 15, 20, 30, 45, 60, 90, 120]);
  });
});
