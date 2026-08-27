import { Frequency } from "@calcom/prisma/zod-utils";
import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import { getEveryFreqFor, getRecurringFreq } from "./recurringStrings";

const createMockT = (): TFunction =>
  vi.fn((key: string, options?: { freq?: string; count?: number }) => {
    if (key === "every_for_freq") return `every${options?.freq}`;
    if (key === "occurrence") {
      if (options?.count && options.count > 1) return "times";
      return "time";
    }
    return key;
  }) as unknown as TFunction;

describe("getRecurringFreq", () => {
  it("returns the translated frequency for interval of 1", () => {
    const t = createMockT();
    const result = getRecurringFreq({ t, recurringEvent: { freq: Frequency.WEEKLY, interval: 1, count: 5 } });
    expect(result).toBe("every weekly");
  });

  it("includes the interval when greater than 1", () => {
    const t = createMockT();
    const result = getRecurringFreq({
      t,
      recurringEvent: { freq: Frequency.MONTHLY, interval: 3, count: 2 },
    });
    expect(result).toBe("every3 monthly");
  });

  it("returns an empty string when interval is missing", () => {
    const t = createMockT();
    expect(getRecurringFreq({ t, recurringEvent: { freq: Frequency.DAILY, interval: 0, count: 1 } })).toBe(
      ""
    );
  });
});

describe("getEveryFreqFor", () => {
  it("combines frequency, count and occurrence", () => {
    const t = createMockT();
    const result = getEveryFreqFor({
      t,
      recurringEvent: { freq: Frequency.WEEKLY, interval: 1, count: 5 },
    });
    expect(result).toBe("every weekly 5 times");
  });

  it("uses the provided recurringCount and recurringFreq overrides", () => {
    const t = createMockT();
    const result = getEveryFreqFor({
      t,
      recurringEvent: { freq: Frequency.WEEKLY, interval: 1, count: 5 },
      recurringCount: 1,
      recurringFreq: "weekly!",
    });
    expect(result).toBe("weekly! 1 time");
  });

  it("returns an empty string when freq is missing", () => {
    const t = createMockT();
    const recurringEvent = { interval: 1, count: 5 } as Parameters<
      typeof getEveryFreqFor
    >[0]["recurringEvent"];
    expect(getEveryFreqFor({ t, recurringEvent })).toBe("");
  });
});
