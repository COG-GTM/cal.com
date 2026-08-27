import type { Availability } from "@calcom/prisma/client";
import type { Schedule, TimeRange } from "@calcom/types/schedule";
import { describe, expect, it } from "vitest";
import {
  availabilityAsString,
  DEFAULT_SCHEDULE,
  getAvailabilityFromSchedule,
  getWorkingHours,
} from "./availability";

const range = (startHour: number, endHour: number): TimeRange => ({
  start: new Date(Date.UTC(2024, 0, 1, startHour, 0, 0)),
  end: new Date(Date.UTC(2024, 0, 1, endHour, 0, 0)),
});

describe("getAvailabilityFromSchedule", () => {
  it("returns empty availability for an empty schedule", () => {
    expect(getAvailabilityFromSchedule([[], [], [], [], [], [], []])).toEqual([]);
  });

  it("groups days sharing the same time range into one availability entry", () => {
    const nineToFive = range(9, 17);
    const schedule: Schedule = [[], [nineToFive], [nineToFive], [nineToFive], [nineToFive], [nineToFive], []];

    const availability = getAvailabilityFromSchedule(schedule);

    expect(availability).toHaveLength(1);
    expect(availability[0].days).toEqual([1, 2, 3, 4, 5]);
    expect(availability[0].startTime).toEqual(nineToFive.start);
    expect(availability[0].endTime).toEqual(nineToFive.end);
  });

  it("creates separate entries for differing time ranges", () => {
    const schedule: Schedule = [[], [range(9, 17)], [range(10, 18)], [], [], [], []];

    const availability = getAvailabilityFromSchedule(schedule);

    expect(availability).toHaveLength(2);
    expect(availability[0].days).toEqual([1]);
    expect(availability[1].days).toEqual([2]);
  });

  it("supports multiple ranges within a single day", () => {
    const schedule: Schedule = [[], [range(9, 12), range(13, 17)], [], [], [], [], []];

    const availability = getAvailabilityFromSchedule(schedule);

    expect(availability).toHaveLength(2);
    expect(availability[0].days).toEqual([1]);
    expect(availability[1].days).toEqual([1]);
  });

  it("produces a single grouped entry for DEFAULT_SCHEDULE", () => {
    const availability = getAvailabilityFromSchedule(DEFAULT_SCHEDULE);

    expect(availability).toHaveLength(1);
    expect(availability[0].days).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("getWorkingHours", () => {
  const nineToFive = {
    days: [1, 2, 3],
    startTime: new Date(Date.UTC(2024, 0, 1, 9, 0)),
    endTime: new Date(Date.UTC(2024, 0, 1, 17, 0)),
  };

  it("returns empty array when there is no availability", () => {
    expect(getWorkingHours({ utcOffset: 0 }, [])).toEqual([]);
  });

  it("converts UTC times to minutes with zero offset", () => {
    const workingHours = getWorkingHours({ utcOffset: 0 }, [nineToFive]);

    expect(workingHours).toEqual([{ days: [1, 2, 3], startTime: 540, endTime: 1020 }]);
  });

  it("skips date overrides (entries without days)", () => {
    const workingHours = getWorkingHours({ utcOffset: 0 }, [{ ...nineToFive, days: [] }]);

    expect(workingHours).toEqual([]);
  });

  it("skips entries whose end time is before their start time", () => {
    const workingHours = getWorkingHours({ utcOffset: 0 }, [
      {
        days: [1],
        startTime: new Date(Date.UTC(2024, 0, 1, 23, 0)),
        endTime: new Date(Date.UTC(2024, 0, 1, 1, 0)),
      },
    ]);

    expect(workingHours).toEqual([]);
  });

  it("includes userId when present", () => {
    const workingHours = getWorkingHours({ utcOffset: 0 }, [{ ...nineToFive, userId: 42 }]);

    expect(workingHours[0].userId).toBe(42);
  });

  it("spills into the previous day for negative local start times", () => {
    const workingHours = getWorkingHours({ utcOffset: 600 }, [
      {
        days: [1],
        startTime: new Date(Date.UTC(2024, 0, 1, 1, 0)),
        endTime: new Date(Date.UTC(2024, 0, 1, 12, 0)),
      },
    ]);

    expect(workingHours).toEqual([
      { days: [1], startTime: 0, endTime: 120 },
      { days: [0], startTime: 900, endTime: 1439 },
    ]);
  });

  it("wraps Sunday spillover back to Saturday", () => {
    const workingHours = getWorkingHours({ utcOffset: 120 }, [
      {
        days: [0],
        startTime: new Date(Date.UTC(2024, 0, 1, 1, 0)),
        endTime: new Date(Date.UTC(2024, 0, 1, 3, 0)),
      },
    ]);

    expect(workingHours).toEqual([
      { days: [0], startTime: 0, endTime: 60 },
      { days: [6], startTime: 1380, endTime: 1439 },
    ]);
  });

  it("spills into the next day for local end times past midnight", () => {
    const workingHours = getWorkingHours({ utcOffset: -180 }, [
      {
        days: [1, 6],
        startTime: new Date(Date.UTC(2024, 0, 1, 20, 0)),
        endTime: new Date(Date.UTC(2024, 0, 1, 23, 0)),
      },
    ]);

    expect(workingHours).toEqual([
      { days: [2, 0], startTime: 0, endTime: 120 },
      { days: [1, 6], startTime: 1380, endTime: 1439 },
    ]);
  });

  it("sorts results by startTime", () => {
    const workingHours = getWorkingHours({ utcOffset: 0 }, [
      {
        days: [2],
        startTime: new Date(Date.UTC(2024, 0, 1, 12, 0)),
        endTime: new Date(Date.UTC(2024, 0, 1, 14, 0)),
      },
      {
        days: [1],
        startTime: new Date(Date.UTC(2024, 0, 1, 8, 0)),
        endTime: new Date(Date.UTC(2024, 0, 1, 10, 0)),
      },
    ]);

    expect(workingHours.map((wh) => wh.startTime)).toEqual([480, 720]);
  });

  it("derives the offset from a timezone when utcOffset is not given", () => {
    const workingHours = getWorkingHours({ timeZone: "UTC" }, [nineToFive]);

    expect(workingHours).toEqual([{ days: [1, 2, 3], startTime: 540, endTime: 1020 }]);
  });
});

describe("availabilityAsString", () => {
  const buildAvailability = (days: number[]): Pick<Availability, "days" | "startTime" | "endTime"> => ({
    days,
    startTime: new Date(Date.UTC(2024, 0, 1, 9, 0)),
    endTime: new Date(Date.UTC(2024, 0, 1, 17, 0)),
  });

  it("renders a contiguous day range with a dash", () => {
    const result = availabilityAsString(buildAvailability([1, 2, 3, 4, 5]), { locale: "en", hour12: true });

    expect(result).toBe("Mon - Fri, 9:00 AM - 5:00 PM");
  });

  it("renders non-contiguous days as separate ranges", () => {
    const result = availabilityAsString(buildAvailability([1, 3, 4]), { locale: "en", hour12: true });

    expect(result).toBe("Mon, Wed - Thu, 9:00 AM - 5:00 PM");
  });

  it("renders a single day without a range", () => {
    const result = availabilityAsString(buildAvailability([2]), { locale: "en", hour12: false });

    expect(result).toBe("Tue, 09:00 - 17:00");
  });
});
