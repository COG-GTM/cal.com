import dayjs from "@calcom/dayjs";
import type { EventBusyDetails } from "@calcom/types/Calendar";
import { describe, expect, it } from "vitest";
import { ascendingLimitKeys, descendingLimitKeys, intervalLimitKeyToUnit } from "./intervalLimit";
import { intervalLimitsType } from "./intervalLimitSchema";
import { isBookingLimit, parseBookingLimit } from "./isBookingLimits";
import { isDurationLimit, parseDurationLimit } from "./isDurationLimits";
import LimitManager, { LimitSources } from "./limitManager";
import { extractDateParameters, getUnitFromBusyTime, isBookingWithinPeriod } from "./utils";
import { getPeriodStartDatesBetween } from "./utils/getPeriodStartDatesBetween";
import { validateIntervalLimitOrder } from "./validateIntervalLimitOrder";

function buildBusyDetails(start: string, end: string): EventBusyDetails {
  return { start, end, title: "busy", source: "test" };
}

describe("intervalLimit", () => {
  it("orders limit keys from smallest to largest unit", () => {
    expect(ascendingLimitKeys).toEqual(["PER_DAY", "PER_WEEK", "PER_MONTH", "PER_YEAR"]);
    expect(descendingLimitKeys).toEqual(["PER_YEAR", "PER_MONTH", "PER_WEEK", "PER_DAY"]);
  });

  it("converts a limit key to its unit", () => {
    expect(intervalLimitKeyToUnit("PER_DAY")).toBe("day");
    expect(intervalLimitKeyToUnit("PER_WEEK")).toBe("week");
    expect(intervalLimitKeyToUnit("PER_MONTH")).toBe("month");
    expect(intervalLimitKeyToUnit("PER_YEAR")).toBe("year");
  });

  it("throws on a key that does not map to a unit", () => {
    expect(() => intervalLimitKeyToUnit("PER_DECADE" as never)).toThrow(
      "Invalid interval limit key: PER_DECADE"
    );
  });
});

describe("intervalLimitsType", () => {
  it("accepts partial limits and null", () => {
    expect(intervalLimitsType.safeParse({ PER_DAY: 1 }).success).toBe(true);
    expect(intervalLimitsType.safeParse(null).success).toBe(true);
  });

  it("rejects non numeric limits", () => {
    expect(intervalLimitsType.safeParse({ PER_DAY: "1" }).success).toBe(false);
  });
});

describe("isBookingLimits", () => {
  it("detects valid booking limits", () => {
    expect(isBookingLimit({ PER_DAY: 2, PER_WEEK: 5 })).toBe(true);
    expect(isBookingLimit(null)).toBe(true);
    expect(isBookingLimit({ PER_DAY: "2" })).toBe(false);
  });

  it("returns the parsed limit or null", () => {
    expect(parseBookingLimit({ PER_MONTH: 10 })).toEqual({ PER_MONTH: 10 });
    expect(parseBookingLimit("not-a-limit")).toBeNull();
  });
});

describe("isDurationLimits", () => {
  it("detects valid duration limits", () => {
    expect(isDurationLimit({ PER_YEAR: 60 })).toBe(true);
    expect(isDurationLimit(42)).toBe(false);
  });

  it("returns the parsed limit or null", () => {
    expect(parseDurationLimit({ PER_WEEK: 120 })).toEqual({ PER_WEEK: 120 });
    expect(parseDurationLimit(undefined)).toBeNull();
  });
});

describe("validateIntervalLimitOrder", () => {
  it("accepts limits that grow with the interval", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 1, PER_WEEK: 2, PER_MONTH: 3, PER_YEAR: 4 })).toBe(true);
  });

  it("accepts limits with gaps in the interval keys", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 1, PER_YEAR: 4 })).toBe(true);
  });

  it("rejects a smaller interval with a bigger limit", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 10, PER_WEEK: 2 })).toBe(false);
  });

  it("accepts an empty limit", () => {
    expect(validateIntervalLimitOrder({})).toBe(true);
  });
});

describe("LimitSources", () => {
  it("builds titles and debug sources per limit type", () => {
    expect(LimitSources.eventBookingLimit({ limit: 2, unit: "day" })).toEqual({
      title: "busy_time.event_booking_limit",
      source: "Event Booking Limit for User: 2 per day",
    });
    expect(LimitSources.eventDurationLimit({ limit: 60, unit: "week" })).toEqual({
      title: "busy_time.event_duration_limit",
      source: "Event Duration Limit for User: 60 minutes per week",
    });
    expect(LimitSources.teamBookingLimit({ limit: 5, unit: "month" })).toEqual({
      title: "busy_time.team_booking_limit",
      source: "Team Booking Limit: 5 per month",
    });
  });
});

describe("LimitManager", () => {
  const start = dayjs.utc("2024-03-13T10:00:00Z");

  it("returns no busy times when nothing was added", () => {
    expect(new LimitManager().getBusyTimes()).toEqual([]);
  });

  it("adds a busy time spanning the given unit", () => {
    const limitManager = new LimitManager();
    limitManager.addBusyTime({
      start,
      unit: "day",
      title: "busy_time.event_booking_limit",
      source: "Event Booking Limit for User: 1 per day",
    });

    expect(limitManager.getBusyTimes()).toEqual([
      {
        start: "2024-03-13T10:00:00.000Z",
        end: "2024-03-13T23:59:59.999Z",
        title: "busy_time.event_booking_limit",
        source: "Event Booking Limit for User: 1 per day",
      },
    ]);
  });

  it("reports a day as busy once its own day is marked busy", () => {
    const limitManager = new LimitManager();
    expect(limitManager.isAlreadyBusy(start, "day")).toBe(false);

    limitManager.addBusyTime({ start: start.startOf("day"), unit: "day", title: "t", source: "s" });

    expect(limitManager.isAlreadyBusy(start, "day")).toBe(true);
  });

  it("reports smaller units as busy when an ancestor unit is busy", () => {
    const limitManager = new LimitManager();
    limitManager.addBusyTime({ start: start.startOf("year"), unit: "year", title: "t", source: "s" });

    expect(limitManager.isAlreadyBusy(start, "day")).toBe(true);
    expect(limitManager.isAlreadyBusy(start, "week")).toBe(true);
    expect(limitManager.isAlreadyBusy(start, "month")).toBe(true);
    expect(limitManager.isAlreadyBusy(start, "year")).toBe(true);
  });

  it("reports a month as busy when the month is busy", () => {
    const limitManager = new LimitManager();
    limitManager.addBusyTime({ start: start.startOf("month"), unit: "month", title: "t", source: "s" });

    expect(limitManager.isAlreadyBusy(start, "month")).toBe(true);
    expect(limitManager.isAlreadyBusy(start, "day")).toBe(true);
  });

  it("only reports a week as busy when both of its months are busy", () => {
    // this week spans February and March 2024
    const weekAcrossMonths = dayjs.utc("2024-02-28T10:00:00Z");
    const limitManager = new LimitManager();
    limitManager.addBusyTime({
      start: weekAcrossMonths.startOf("month"),
      unit: "month",
      title: "t",
      source: "s",
    });

    expect(limitManager.isAlreadyBusy(weekAcrossMonths, "week")).toBe(false);

    limitManager.addBusyTime({
      start: weekAcrossMonths.endOf("week").startOf("month"),
      unit: "month",
      title: "t",
      source: "s",
    });

    expect(limitManager.isAlreadyBusy(weekAcrossMonths, "week")).toBe(true);
  });

  it("reports a week as busy when the week itself is busy", () => {
    const limitManager = new LimitManager();
    limitManager.addBusyTime({ start: start.startOf("week"), unit: "week", title: "t", source: "s" });

    expect(limitManager.isAlreadyBusy(start, "week")).toBe(true);
    expect(limitManager.isAlreadyBusy(start, "day")).toBe(true);
    expect(limitManager.isAlreadyBusy(start, "month")).toBe(false);
  });

  it("keys busy times by the given timezone", () => {
    // 2024-03-13T02:00:00Z is still 2024-03-12 in New York
    const limitManager = new LimitManager();
    const utcStart = dayjs.utc("2024-03-13T02:00:00Z");
    limitManager.addBusyTime({
      start: utcStart.tz("America/New_York").startOf("day"),
      unit: "day",
      timeZone: "America/New_York",
      title: "t",
      source: "s",
    });

    expect(limitManager.isAlreadyBusy(utcStart, "day", "America/New_York")).toBe(true);
    expect(limitManager.isAlreadyBusy(utcStart, "day")).toBe(false);
  });

  it("merges busy times from another manager without duplicating keys", () => {
    const first = new LimitManager();
    const second = new LimitManager();
    first.addBusyTime({ start: start.startOf("day"), unit: "day", title: "first", source: "first" });
    second.addBusyTime({ start: start.startOf("day"), unit: "day", title: "second", source: "second" });
    second.addBusyTime({
      start: start.add(1, "day").startOf("day"),
      unit: "day",
      title: "other-day",
      source: "other-day",
    });

    first.mergeBusyTimes(second);

    expect(first.getBusyTimes().map((busyTime) => busyTime.title)).toEqual(["first", "other-day"]);
  });
});

describe("extractDateParameters", () => {
  it("formats the booking and period days in the given timezone", () => {
    const booking = buildBusyDetails("2024-03-13T02:00:00Z", "2024-03-13T03:00:00Z");

    const { bookingStart, bookingDay, periodStartDay, periodEndDay } = extractDateParameters(
      booking,
      dayjs.utc("2024-03-01T00:00:00Z"),
      dayjs.utc("2024-03-31T00:00:00Z"),
      "America/New_York"
    );

    expect(bookingDay).toBe("2024-03-12");
    expect(bookingStart.format("HH:mm")).toBe("22:00");
    expect(periodStartDay).toBe("2024-03-01");
    expect(periodEndDay).toBe("2024-03-31");
  });
});

describe("isBookingWithinPeriod", () => {
  const periodStart = dayjs.utc("2024-03-10T00:00:00Z");
  const periodEnd = dayjs.utc("2024-03-20T00:00:00Z");

  it("includes bookings on the period boundaries", () => {
    expect(
      isBookingWithinPeriod(
        buildBusyDetails("2024-03-10T08:00:00Z", "2024-03-10T09:00:00Z"),
        periodStart,
        periodEnd,
        "UTC"
      )
    ).toBe(true);
    expect(
      isBookingWithinPeriod(
        buildBusyDetails("2024-03-20T08:00:00Z", "2024-03-20T09:00:00Z"),
        periodStart,
        periodEnd,
        "UTC"
      )
    ).toBe(true);
  });

  it("excludes bookings outside the period", () => {
    expect(
      isBookingWithinPeriod(
        buildBusyDetails("2024-03-09T08:00:00Z", "2024-03-09T09:00:00Z"),
        periodStart,
        periodEnd,
        "UTC"
      )
    ).toBe(false);
    expect(
      isBookingWithinPeriod(
        buildBusyDetails("2024-03-21T08:00:00Z", "2024-03-21T09:00:00Z"),
        periodStart,
        periodEnd,
        "UTC"
      )
    ).toBe(false);
  });
});

describe("getUnitFromBusyTime", () => {
  const start = dayjs.utc("2024-01-01T00:00:00Z");

  it("returns the largest unit that fits between start and end", () => {
    expect(getUnitFromBusyTime(start, start.add(1, "year"))).toBe("year");
    expect(getUnitFromBusyTime(start, start.add(2, "month"))).toBe("month");
    expect(getUnitFromBusyTime(start, start.add(2, "week"))).toBe("week");
    expect(getUnitFromBusyTime(start, start.add(2, "hour"))).toBe("day");
  });
});

describe("getPeriodStartDatesBetween", () => {
  it("returns one date per period start", () => {
    const dates = getPeriodStartDatesBetween(
      dayjs.utc("2024-03-13T10:00:00Z"),
      dayjs.utc("2024-03-15T10:00:00Z"),
      "day"
    );

    expect(dates.map((date) => date.toISOString())).toEqual([
      "2024-03-13T00:00:00.000Z",
      "2024-03-14T00:00:00.000Z",
      "2024-03-15T00:00:00.000Z",
    ]);
  });

  it("respects the given timezone", () => {
    const dates = getPeriodStartDatesBetween(
      dayjs.utc("2024-03-13T02:00:00Z"),
      dayjs.utc("2024-03-13T03:00:00Z"),
      "day",
      "America/New_York"
    );

    expect(dates).toHaveLength(1);
    expect(dates[0].format("YYYY-MM-DD HH:mm")).toBe("2024-03-12 00:00");
  });

  it("returns a single period when the range is within one month", () => {
    const dates = getPeriodStartDatesBetween(
      dayjs.utc("2024-03-05T00:00:00Z"),
      dayjs.utc("2024-03-25T00:00:00Z"),
      "month"
    );

    expect(dates.map((date) => date.toISOString())).toEqual(["2024-03-01T00:00:00.000Z"]);
  });
});
