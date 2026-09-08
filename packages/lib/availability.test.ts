import type { Availability } from "@calcom/prisma/client";
import type { Schedule, TimeRange } from "@calcom/types/schedule";
import { describe, expect, it } from "vitest";
import {
  availabilityAsString,
  DEFAULT_SCHEDULE,
  defaultDayRange,
  getAvailabilityFromSchedule,
  getWorkingHours,
} from "./availability";

const utcDate = (hours: number, minutes = 0): Date => new Date(Date.UTC(2024, 0, 1, hours, minutes, 0, 0));

const nineToFive: TimeRange = { start: utcDate(9), end: utcDate(17) };
const tenToNoon: TimeRange = { start: utcDate(10), end: utcDate(12) };

describe("availability", () => {
  describe("DEFAULT_SCHEDULE", () => {
    it("is a mon-fri 9 to 5 schedule", () => {
      expect(DEFAULT_SCHEDULE.map((day) => day.length)).toEqual([0, 1, 1, 1, 1, 1, 0]);
      expect(DEFAULT_SCHEDULE[1][0]).toBe(defaultDayRange);
      expect(defaultDayRange.start.getUTCHours()).toBe(9);
      expect(defaultDayRange.end.getUTCHours()).toBe(17);
    });
  });

  describe("getAvailabilityFromSchedule", () => {
    it("returns nothing for an empty schedule", () => {
      expect(getAvailabilityFromSchedule([[], [], [], [], [], [], []])).toEqual([]);
    });

    it("groups days that share the exact same time range", () => {
      const schedule: Schedule = [[], [nineToFive], [nineToFive], [], [], [], []];

      expect(getAvailabilityFromSchedule(schedule)).toEqual([
        { days: [1, 2], startTime: nineToFive.start, endTime: nineToFive.end },
      ]);
    });

    it("keeps differing time ranges apart", () => {
      const schedule: Schedule = [[], [nineToFive], [tenToNoon], [], [], [], []];

      expect(getAvailabilityFromSchedule(schedule)).toEqual([
        { days: [1], startTime: nineToFive.start, endTime: nineToFive.end },
        { days: [2], startTime: tenToNoon.start, endTime: tenToNoon.end },
      ]);
    });

    it("supports multiple ranges on the same day", () => {
      const schedule: Schedule = [[], [nineToFive, tenToNoon], [], [], [], [], []];

      expect(getAvailabilityFromSchedule(schedule)).toEqual([
        { days: [1], startTime: nineToFive.start, endTime: nineToFive.end },
        { days: [1], startTime: tenToNoon.start, endTime: tenToNoon.end },
      ]);
    });
  });

  describe("getWorkingHours", () => {
    it("returns an empty array when there is no availability", () => {
      expect(getWorkingHours({ timeZone: "Europe/London" }, [])).toEqual([]);
    });

    it("converts utc availability to minutes without an offset", () => {
      expect(
        getWorkingHours({ utcOffset: 0 }, [{ days: [1, 2], startTime: utcDate(9), endTime: utcDate(17, 30) }])
      ).toEqual([{ days: [1, 2], startTime: 9 * 60, endTime: 17 * 60 + 30 }]);
    });

    it("shifts times by the given utc offset", () => {
      expect(
        getWorkingHours({ utcOffset: -120 }, [{ days: [3], startTime: utcDate(9), endTime: utcDate(17) }])
      ).toEqual([{ days: [3], startTime: 11 * 60, endTime: 19 * 60 }]);
    });

    it("derives the offset from a timezone when no explicit offset is given", () => {
      // Asia/Kolkata is UTC+5:30 year-round, so this stays stable regardless of DST.
      expect(
        getWorkingHours({ timeZone: "Asia/Kolkata" }, [
          { days: [1], startTime: utcDate(9), endTime: utcDate(17) },
        ])
      ).toEqual([{ days: [1], startTime: 3 * 60 + 30, endTime: 11 * 60 + 30 }]);
    });

    it("treats a missing timezone and offset as utc", () => {
      expect(getWorkingHours({}, [{ days: [1], startTime: utcDate(9), endTime: utcDate(17) }])).toEqual([
        { days: [1], startTime: 9 * 60, endTime: 17 * 60 },
      ]);
    });

    it("ignores date overrides, which have no days", () => {
      expect(
        getWorkingHours({ utcOffset: 0 }, [{ days: [], startTime: utcDate(9), endTime: utcDate(17) }])
      ).toEqual([]);
    });

    it("keeps the user id when the availability belongs to a user", () => {
      expect(
        getWorkingHours({ utcOffset: 0 }, [
          { userId: 7, days: [1], startTime: utcDate(9), endTime: utcDate(17) },
        ])
      ).toEqual([{ userId: 7, days: [1], startTime: 9 * 60, endTime: 17 * 60 }]);
    });

    it("splits availability overflowing into the previous day", () => {
      // UTC+10 pushes a 09:00-17:00 UTC range back to 23:00 (previous day) - 07:00.
      expect(
        getWorkingHours({ utcOffset: 600 }, [
          { userId: 7, days: [0, 3], startTime: utcDate(9), endTime: utcDate(17) },
        ])
      ).toEqual([
        { userId: 7, days: [0, 3], startTime: 0, endTime: 7 * 60 },
        { userId: 7, days: [6, 2], startTime: 23 * 60, endTime: 24 * 60 - 1 },
      ]);
    });

    it("splits availability overflowing into the next day", () => {
      // UTC-10 pushes a 09:00-17:00 UTC range forward to 19:00 - 03:00 (next day).
      expect(
        getWorkingHours({ utcOffset: -600 }, [
          { userId: 7, days: [6], startTime: utcDate(9), endTime: utcDate(17) },
        ])
      ).toEqual([
        { userId: 7, days: [0], startTime: 0, endTime: 3 * 60 },
        { userId: 7, days: [6], startTime: 19 * 60, endTime: 24 * 60 - 1 },
      ]);
    });

    it("omits the user id from overflowing ranges when the availability has none", () => {
      expect(
        getWorkingHours({ utcOffset: 600 }, [{ days: [0], startTime: utcDate(9), endTime: utcDate(17) }])
      ).toEqual([
        { days: [0], startTime: 0, endTime: 7 * 60 },
        { days: [6], startTime: 23 * 60, endTime: 24 * 60 - 1 },
      ]);
      expect(
        getWorkingHours({ utcOffset: -600 }, [{ days: [6], startTime: utcDate(9), endTime: utcDate(17) }])
      ).toEqual([
        { days: [0], startTime: 0, endTime: 3 * 60 },
        { days: [6], startTime: 19 * 60, endTime: 24 * 60 - 1 },
      ]);
    });

    it("drops availability whose end is before its start", () => {
      expect(
        getWorkingHours({ utcOffset: 0 }, [{ days: [1], startTime: utcDate(17), endTime: utcDate(9) }])
      ).toEqual([]);
    });

    it("drops availability that clamps to a zero-length range", () => {
      expect(
        getWorkingHours({ utcOffset: 0 }, [{ days: [1], startTime: utcDate(0), endTime: utcDate(0) }])
      ).toEqual([]);
    });

    it("sorts the resulting working hours by start time", () => {
      const workingHours = getWorkingHours({ utcOffset: 0 }, [
        { days: [1], startTime: utcDate(14), endTime: utcDate(18) },
        { days: [1], startTime: utcDate(8), endTime: utcDate(12) },
      ]);

      expect(workingHours.map((wh) => wh.startTime)).toEqual([8 * 60, 14 * 60]);
    });
  });

  describe("availabilityAsString", () => {
    const availability = (days: number[]): Pick<Availability, "days" | "startTime" | "endTime"> => ({
      days,
      startTime: utcDate(9),
      endTime: utcDate(17),
    });

    it("renders a contiguous range of days as a span", () => {
      expect(availabilityAsString(availability([1, 2, 3, 4, 5]), { locale: "en", hour12: false })).toBe(
        "Mon - Fri, 09:00 - 17:00"
      );
    });

    it("renders a single day without a span", () => {
      expect(availabilityAsString(availability([1]), { locale: "en", hour12: false })).toBe(
        "Mon, 09:00 - 17:00"
      );
    });

    it("renders two adjacent days as a span and separate days as a list", () => {
      expect(availabilityAsString(availability([1, 2]), { locale: "en", hour12: false })).toBe(
        "Mon - Tue, 09:00 - 17:00"
      );
      expect(availabilityAsString(availability([1, 3, 5]), { locale: "en", hour12: false })).toBe(
        "Mon, Wed, Fri, 09:00 - 17:00"
      );
    });

    it("renders multiple ranges", () => {
      expect(availabilityAsString(availability([1, 2, 3, 5, 6]), { locale: "en", hour12: false })).toBe(
        "Mon - Wed, Fri - Sat, 09:00 - 17:00"
      );
    });

    it("honours the 12 hour clock", () => {
      expect(availabilityAsString(availability([1]), { locale: "en", hour12: true })).toBe(
        "Mon, 9:00 AM - 5:00 PM"
      );
    });
  });
});
