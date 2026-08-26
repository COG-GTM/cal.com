import dayjs from "@calcom/dayjs";
import type { EventBusyDetails } from "@calcom/types/Calendar";
import { describe, expect, it } from "vitest";
import { ascendingLimitKeys, descendingLimitKeys, intervalLimitKeyToUnit } from "./intervalLimit";
import { intervalLimitsType } from "./intervalLimitSchema";
import { isBookingLimit, parseBookingLimit } from "./isBookingLimits";
import { isDurationLimit, parseDurationLimit } from "./isDurationLimits";
import { extractDateParameters, getUnitFromBusyTime, isBookingWithinPeriod } from "./utils";
import { getPeriodStartDatesBetween } from "./utils/getPeriodStartDatesBetween";
import { validateIntervalLimitOrder } from "./validateIntervalLimitOrder";

describe("intervalLimit", () => {
  it("exposes ascending and descending limit keys", () => {
    expect(ascendingLimitKeys).toEqual(["PER_DAY", "PER_WEEK", "PER_MONTH", "PER_YEAR"]);
    expect(descendingLimitKeys).toEqual(["PER_YEAR", "PER_MONTH", "PER_WEEK", "PER_DAY"]);
  });

  it.each([
    ["PER_DAY", "day"],
    ["PER_WEEK", "week"],
    ["PER_MONTH", "month"],
    ["PER_YEAR", "year"],
  ] as const)("converts %s to %s", (key, unit) => {
    expect(intervalLimitKeyToUnit(key)).toBe(unit);
  });

  it("throws for an invalid key", () => {
    // @ts-expect-error testing invalid input
    expect(() => intervalLimitKeyToUnit("PER_DECADE")).toThrow("Invalid interval limit key: PER_DECADE");
  });
});

describe("intervalLimitsType", () => {
  it("accepts a valid limit object", () => {
    expect(intervalLimitsType.safeParse({ PER_DAY: 1, PER_WEEK: 2 }).success).toBe(true);
  });

  it("accepts null", () => {
    expect(intervalLimitsType.safeParse(null).success).toBe(true);
  });

  it("rejects non-numeric values", () => {
    expect(intervalLimitsType.safeParse({ PER_DAY: "1" }).success).toBe(false);
  });
});

describe("isBookingLimits / isDurationLimits", () => {
  it("identifies valid limits", () => {
    expect(isBookingLimit({ PER_DAY: 1 })).toBe(true);
    expect(isDurationLimit({ PER_MONTH: 60 })).toBe(true);
  });

  it("rejects invalid limits", () => {
    expect(isBookingLimit("nope")).toBe(false);
    expect(isDurationLimit(42)).toBe(false);
  });

  it("parses valid limits and returns null otherwise", () => {
    expect(parseBookingLimit({ PER_WEEK: 5 })).toEqual({ PER_WEEK: 5 });
    expect(parseBookingLimit("invalid")).toBeNull();
    expect(parseDurationLimit({ PER_YEAR: 100 })).toEqual({ PER_YEAR: 100 });
    expect(parseDurationLimit("invalid")).toBeNull();
  });
});

describe("validateIntervalLimitOrder", () => {
  it("returns true for ascending values", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 1, PER_WEEK: 2, PER_MONTH: 3, PER_YEAR: 4 })).toBe(true);
  });

  it("returns true when only some limits are set in order", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 2, PER_MONTH: 10 })).toBe(true);
  });

  it("returns false when a smaller unit has a bigger value", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 5, PER_WEEK: 2 })).toBe(false);
  });

  it("returns true for an empty object", () => {
    expect(validateIntervalLimitOrder({})).toBe(true);
  });
});

describe("utils", () => {
  const makeBusy = (start: string, end: string): EventBusyDetails => ({ start, end });

  describe("extractDateParameters", () => {
    it("extracts formatted day strings in the given timezone", () => {
      const booking = makeBusy("2024-06-12T10:00:00.000Z", "2024-06-12T11:00:00.000Z");
      const result = extractDateParameters(
        booking,
        dayjs.utc("2024-06-10T00:00:00.000Z"),
        dayjs.utc("2024-06-14T00:00:00.000Z"),
        "UTC"
      );
      expect(result.bookingDay).toBe("2024-06-12");
      expect(result.periodStartDay).toBe("2024-06-10");
      expect(result.periodEndDay).toBe("2024-06-14");
      expect(result.bookingStart.toISOString()).toBe("2024-06-12T10:00:00.000Z");
    });

    it("respects non-UTC timezones", () => {
      const booking = makeBusy("2024-06-12T01:00:00.000Z", "2024-06-12T02:00:00.000Z");
      const result = extractDateParameters(
        booking,
        dayjs.utc("2024-06-10T00:00:00.000Z"),
        dayjs.utc("2024-06-14T00:00:00.000Z"),
        "America/New_York"
      );
      // 01:00 UTC is still the previous day in New York
      expect(result.bookingDay).toBe("2024-06-11");
    });
  });

  describe("isBookingWithinPeriod", () => {
    const periodStart = dayjs.utc("2024-06-10T00:00:00.000Z");
    const periodEnd = dayjs.utc("2024-06-14T00:00:00.000Z");

    it("returns true when the booking is inside the period", () => {
      const booking = makeBusy("2024-06-12T10:00:00.000Z", "2024-06-12T11:00:00.000Z");
      expect(isBookingWithinPeriod(booking, periodStart, periodEnd, "UTC")).toBe(true);
    });

    it("returns true on period boundaries", () => {
      const booking = makeBusy("2024-06-10T00:00:00.000Z", "2024-06-10T01:00:00.000Z");
      expect(isBookingWithinPeriod(booking, periodStart, periodEnd, "UTC")).toBe(true);
    });

    it("returns false when the booking is outside the period", () => {
      const booking = makeBusy("2024-06-15T10:00:00.000Z", "2024-06-15T11:00:00.000Z");
      expect(isBookingWithinPeriod(booking, periodStart, periodEnd, "UTC")).toBe(false);
    });
  });

  describe("getUnitFromBusyTime", () => {
    it.each([
      ["2024-06-01T00:00:00.000Z", "2025-06-01T00:00:00.000Z", "year"],
      ["2024-06-01T00:00:00.000Z", "2024-07-01T00:00:00.000Z", "month"],
      ["2024-06-01T00:00:00.000Z", "2024-06-08T00:00:00.000Z", "week"],
      ["2024-06-01T00:00:00.000Z", "2024-06-01T01:00:00.000Z", "day"],
    ] as const)("maps %s - %s to %s", (start, end, unit) => {
      expect(getUnitFromBusyTime(dayjs.utc(start), dayjs.utc(end))).toBe(unit);
    });
  });

  describe("getPeriodStartDatesBetween", () => {
    it("returns the start of each day in the range", () => {
      const dates = getPeriodStartDatesBetween(
        dayjs.utc("2024-06-10T05:00:00.000Z"),
        dayjs.utc("2024-06-12T05:00:00.000Z"),
        "day"
      );
      expect(dates.map((d) => d.toISOString())).toEqual([
        "2024-06-10T00:00:00.000Z",
        "2024-06-11T00:00:00.000Z",
        "2024-06-12T00:00:00.000Z",
      ]);
    });

    it("returns the start of each month in the range", () => {
      const dates = getPeriodStartDatesBetween(
        dayjs.utc("2024-06-10T00:00:00.000Z"),
        dayjs.utc("2024-08-10T00:00:00.000Z"),
        "month"
      );
      expect(dates).toHaveLength(3);
      expect(dates[0].toISOString()).toBe("2024-06-01T00:00:00.000Z");
    });

    it("applies the given timezone", () => {
      const dates = getPeriodStartDatesBetween(
        dayjs.utc("2024-06-10T00:00:00.000Z"),
        dayjs.utc("2024-06-10T12:00:00.000Z"),
        "day",
        "America/New_York"
      );
      // 00:00 UTC on 06-10 is 20:00 on 06-09 in New York, so two day-starts are included
      expect(dates).toHaveLength(2);
      expect(dates[0].format("YYYY-MM-DD")).toBe("2024-06-09");
    });
  });
});
