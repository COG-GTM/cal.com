import type { Schedule, TimeRange } from "@calcom/types/schedule";
import { describe, expect, it } from "vitest";
import {
  availabilityAsString,
  defaultDayRange,
  getAvailabilityFromSchedule,
  getWorkingHours,
  MINUTES_DAY_END,
} from "./availability";

const range = (startHour: number, endHour: number): TimeRange => ({
  start: new Date(Date.UTC(2023, 5, 12, startHour, 0, 0)),
  end: new Date(Date.UTC(2023, 5, 12, endHour, 0, 0)),
});

describe("getAvailabilityFromSchedule", () => {
  it("returns empty array for an empty schedule", () => {
    expect(getAvailabilityFromSchedule([[], [], [], [], [], [], []])).toEqual([]);
  });

  it("groups days sharing the same time range into a single availability", () => {
    const schedule: Schedule = [[], [defaultDayRange], [defaultDayRange], [], [], [], []];
    const availability = getAvailabilityFromSchedule(schedule);
    expect(availability).toHaveLength(1);
    expect(availability[0].days).toEqual([1, 2]);
    expect(availability[0].startTime).toEqual(defaultDayRange.start);
    expect(availability[0].endTime).toEqual(defaultDayRange.end);
  });

  it("keeps distinct time ranges as separate availabilities", () => {
    const schedule: Schedule = [[], [range(9, 12)], [range(13, 17)], [], [], [], []];
    const availability = getAvailabilityFromSchedule(schedule);
    expect(availability).toHaveLength(2);
    expect(availability[0].days).toEqual([1]);
    expect(availability[1].days).toEqual([2]);
  });

  it("supports multiple ranges in a single day", () => {
    const schedule: Schedule = [[], [range(9, 12), range(13, 17)], [], [], [], [], []];
    const availability = getAvailabilityFromSchedule(schedule);
    expect(availability).toHaveLength(2);
    expect(availability[0].days).toEqual([1]);
    expect(availability[1].days).toEqual([1]);
  });
});

describe("getWorkingHours", () => {
  const nineToFive = {
    days: [1, 2],
    startTime: new Date(Date.UTC(2023, 5, 12, 9, 0)),
    endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)),
  };

  it("returns empty array when availability is empty", () => {
    expect(getWorkingHours({ utcOffset: 0 }, [])).toEqual([]);
  });

  it("maps UTC availability with zero offset", () => {
    expect(getWorkingHours({ utcOffset: 0 }, [nineToFive])).toEqual([
      { days: [1, 2], startTime: 540, endTime: 1020 },
    ]);
  });

  it("defaults to zero offset when neither timeZone nor utcOffset given", () => {
    expect(getWorkingHours({}, [nineToFive])).toEqual([{ days: [1, 2], startTime: 540, endTime: 1020 }]);
  });

  it("derives offset from a timeZone", () => {
    // UTC+4 all year round
    expect(getWorkingHours({ timeZone: "Asia/Dubai" }, [nineToFive])).toEqual([
      { days: [1, 2], startTime: 300, endTime: 780 },
    ]);
  });

  it("skips date overrides (empty days)", () => {
    expect(getWorkingHours({ utcOffset: 0 }, [{ ...nineToFive, days: [] }])).toEqual([]);
  });

  it("includes userId when set", () => {
    expect(getWorkingHours({ utcOffset: 0 }, [{ ...nineToFive, userId: 42 }])).toEqual([
      { days: [1, 2], startTime: 540, endTime: 1020, userId: 42 },
    ]);
  });

  it("splits into previous day when negative offset pushes times before midnight", () => {
    const earlyMorning = {
      days: [1],
      startTime: new Date(Date.UTC(2023, 5, 12, 0, 0)),
      endTime: new Date(Date.UTC(2023, 5, 12, 8, 0)),
    };
    // UTC+5:30 → local 0:00-8:00 becomes UTC -5:30 to 2:30
    const workingHours = getWorkingHours({ utcOffset: 330 }, [earlyMorning]);
    expect(workingHours).toContainEqual({ days: [0], startTime: 1110, endTime: MINUTES_DAY_END });
    expect(workingHours).toContainEqual({ days: [1], startTime: 0, endTime: 150 });
  });

  it("wraps Sunday overflow back to Saturday", () => {
    const earlyMorning = {
      days: [0],
      startTime: new Date(Date.UTC(2023, 5, 12, 0, 0)),
      endTime: new Date(Date.UTC(2023, 5, 12, 2, 0)),
    };
    const workingHours = getWorkingHours({ utcOffset: 180 }, [earlyMorning]);
    expect(workingHours).toEqual([{ days: [6], startTime: 1260, endTime: 1380 }]);
  });

  it("splits into next day when positive offset pushes times past midnight", () => {
    const lateEvening = {
      days: [6],
      startTime: new Date(Date.UTC(2023, 5, 12, 20, 0)),
      endTime: new Date(Date.UTC(2023, 5, 12, 23, 59)),
    };
    // UTC-5 → local 20:00-23:59 becomes UTC 25:00 to 28:59
    const workingHours = getWorkingHours({ utcOffset: -300 }, [lateEvening]);
    expect(workingHours).toEqual([{ days: [0], startTime: 60, endTime: 299 }]);
  });

  it("includes userId in overflow ranges", () => {
    const lateEvening = {
      days: [1],
      userId: 7,
      startTime: new Date(Date.UTC(2023, 5, 12, 22, 0)),
      endTime: new Date(Date.UTC(2023, 5, 12, 23, 0)),
    };
    const workingHours = getWorkingHours({ utcOffset: -120 }, [lateEvening]);
    expect(workingHours).toEqual([{ days: [2], startTime: 0, endTime: 60, userId: 7 }]);
  });

  it("sorts results by startTime", () => {
    const workingHours = getWorkingHours({ utcOffset: 0 }, [
      {
        days: [2],
        startTime: new Date(Date.UTC(2023, 5, 12, 13, 0)),
        endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)),
      },
      {
        days: [1],
        startTime: new Date(Date.UTC(2023, 5, 12, 9, 0)),
        endTime: new Date(Date.UTC(2023, 5, 12, 12, 0)),
      },
    ]);
    expect(workingHours.map((wh) => wh.startTime)).toEqual([540, 780]);
  });
});

describe("availabilityAsString", () => {
  const availability = {
    days: [1, 2, 3],
    startTime: new Date(Date.UTC(1970, 0, 1, 9, 0)),
    endTime: new Date(Date.UTC(1970, 0, 1, 17, 0)),
  };

  it("renders consecutive days as a range", () => {
    const result = availabilityAsString(availability, { locale: "en", hour12: true });
    expect(result).toBe("Mon - Wed, 9:00 AM - 5:00 PM");
  });

  it("renders non-consecutive days separated by commas", () => {
    const result = availabilityAsString({ ...availability, days: [1, 3, 5] }, { locale: "en", hour12: true });
    expect(result).toBe("Mon, Wed, Fri, 9:00 AM - 5:00 PM");
  });

  it("renders 24h time format when hour12 is false", () => {
    const result = availabilityAsString({ ...availability, days: [1] }, { locale: "en", hour12: false });
    expect(result).toBe("Mon, 09:00 - 17:00");
  });
});
