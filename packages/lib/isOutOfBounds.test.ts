import dayjs from "@calcom/dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingDateInPastError, isTimeOutOfBounds } from "./isOutOfBounds";

const NOW = "2026-03-10T12:00:00.000Z";

describe("isTimeOutOfBounds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws BookingDateInPastError for a time in the past", () => {
    expect(() => isTimeOutOfBounds({ time: "2026-03-10T11:59:00.000Z" })).toThrow(BookingDateInPastError);
  });

  it("returns false for a future time when there is no minimum booking notice", () => {
    expect(isTimeOutOfBounds({ time: "2026-03-10T12:01:00.000Z" })).toBe(false);
  });

  it("returns true for a time inside the minimum booking notice window", () => {
    expect(isTimeOutOfBounds({ time: "2026-03-10T12:59:00.000Z", minimumBookingNotice: 60 })).toBe(true);
  });

  it("returns false for a time exactly at the end of the minimum booking notice window", () => {
    expect(isTimeOutOfBounds({ time: "2026-03-10T13:00:00.000Z", minimumBookingNotice: 60 })).toBe(false);
  });

  it("accepts Date, timestamp and timezone-aware Dayjs inputs", () => {
    const time = dayjs.utc("2026-03-10T12:30:00.000Z");
    expect(isTimeOutOfBounds({ time: time.toDate(), minimumBookingNotice: 60 })).toBe(true);
    expect(isTimeOutOfBounds({ time: time.valueOf(), minimumBookingNotice: 60 })).toBe(true);
    expect(isTimeOutOfBounds({ time: time.tz("Asia/Kolkata"), minimumBookingNotice: 15 })).toBe(false);
  });

  it("compares the instant of a timezone-aware time in a repeated DST hour against the notice cutoff", () => {
    vi.setSystemTime(new Date("2026-11-01T05:00:00.000Z"));
    // 05:30Z and 06:30Z are both 01:30 in New York on the fall-back day; the cutoff (06:00Z) falls between them.
    const firstOccurrence = dayjs.utc("2026-11-01T05:30:00.000Z").tz("America/New_York");
    const secondOccurrence = dayjs.utc("2026-11-01T06:30:00.000Z").tz("America/New_York");
    expect(isTimeOutOfBounds({ time: firstOccurrence, minimumBookingNotice: 60 })).toBe(true);
    expect(isTimeOutOfBounds({ time: secondOccurrence, minimumBookingNotice: 60 })).toBe(false);
  });
});
