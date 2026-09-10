import { beforeEach, describe, expect, it, vi } from "vitest";
import { getScheduleListItemData } from "./getScheduleListItemData";
import {
  transformAvailabilityForAtom,
  transformDateOverridesForAtom,
  transformScheduleToAvailabilityForAtom,
  transformWorkingHoursForAtom,
} from "./index";

function utcTime(hours: number, minutes: number = 0): Date {
  return new Date(Date.UTC(1970, 0, 1, hours, minutes));
}

describe("transformWorkingHoursForAtom", () => {
  it("maps availability to working hours in the schedule timezone", () => {
    const workingHours = transformWorkingHoursForAtom({
      timeZone: "UTC",
      availability: [{ days: [1, 2], startTime: utcTime(9), endTime: utcTime(17) }],
    });

    expect(workingHours).toEqual([{ days: [1, 2], startTime: 540, endTime: 1020 }]);
  });

  it("falls back to no timezone when the schedule has none", () => {
    expect(
      transformWorkingHoursForAtom({
        timeZone: null,
        availability: [{ days: [3], startTime: utcTime(10), endTime: utcTime(11) }],
      })
    ).toEqual([{ days: [3], startTime: 600, endTime: 660 }]);
  });

  it("returns an empty list when there is no availability", () => {
    expect(transformWorkingHoursForAtom({ timeZone: "UTC", availability: [] })).toEqual([]);
    expect(
      transformWorkingHoursForAtom({
        timeZone: "UTC",
        availability: undefined as unknown as { days: number[]; startTime: Date; endTime: Date }[],
      })
    ).toEqual([]);
  });
});

describe("transformScheduleToAvailabilityForAtom", () => {
  it("buckets availability into a seven day schedule", () => {
    const schedule = transformScheduleToAvailabilityForAtom({
      availability: [{ days: [1, 3], startTime: utcTime(9), endTime: utcTime(17) }],
    });

    expect(schedule).toHaveLength(7);
    expect(schedule[0]).toEqual([]);
    expect(schedule[1]).toHaveLength(1);
    expect(schedule[3]).toHaveLength(1);
    const [range] = schedule[1];
    expect(range.start.getUTCHours()).toBe(9);
    expect(range.end.getUTCHours()).toBe(17);
  });

  it("sorts ranges within a day by start time", () => {
    const schedule = transformScheduleToAvailabilityForAtom({
      availability: [
        { days: [2], startTime: utcTime(14), endTime: utcTime(16) },
        { days: [2], startTime: utcTime(9), endTime: utcTime(11) },
      ],
    });

    expect(schedule[2].map((range) => range.start.getUTCHours())).toEqual([9, 14]);
  });
});

describe("transformAvailabilityForAtom", () => {
  it("extends end of day ranges to the last second of the day", () => {
    const [, monday] = transformAvailabilityForAtom({
      availability: [{ days: [1], startTime: utcTime(9), endTime: utcTime(23, 59) }],
    });

    expect(monday[0].end.toISOString()).toMatch(/23:59:59\.999Z$/);
  });

  it("leaves other ranges untouched", () => {
    const [, monday] = transformAvailabilityForAtom({
      availability: [{ days: [1], startTime: utcTime(9), endTime: utcTime(17) }],
    });

    expect(monday[0].end.toISOString()).toMatch(/17:00:00\.000Z$/);
  });
});

describe("transformDateOverridesForAtom", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-13T12:00:00Z"));
    return (): void => {
      vi.useRealTimers();
    };
  });

  it("keeps future overrides and applies their times to the override date", () => {
    const [dayRange] = transformDateOverridesForAtom(
      {
        availability: [
          { date: new Date("2024-03-20T00:00:00Z"), startTime: utcTime(9), endTime: utcTime(17) },
        ],
      },
      "UTC"
    );

    expect(dayRange.ranges).toHaveLength(1);
    expect(dayRange.ranges[0].start.toISOString()).toBe("2024-03-20T09:00:00.000Z");
    expect(dayRange.ranges[0].end.toISOString()).toBe("2024-03-20T17:00:00.000Z");
  });

  it("drops past overrides and overrides without a date", () => {
    expect(
      transformDateOverridesForAtom(
        {
          availability: [
            { date: new Date("2024-03-01T00:00:00Z"), startTime: utcTime(9), endTime: utcTime(17) },
            { date: null, startTime: utcTime(9), endTime: utcTime(17) },
          ],
        },
        "UTC"
      )
    ).toEqual([]);
  });

  it("groups overrides that share a date and sorts groups chronologically", () => {
    const result = transformDateOverridesForAtom(
      {
        availability: [
          { date: new Date("2024-03-25T00:00:00Z"), startTime: utcTime(9), endTime: utcTime(10) },
          { date: new Date("2024-03-20T00:00:00Z"), startTime: utcTime(9), endTime: utcTime(10) },
          { date: new Date("2024-03-20T00:00:00Z"), startTime: utcTime(14), endTime: utcTime(15) },
        ],
      },
      "UTC"
    );

    expect(result).toHaveLength(2);
    expect(result[0].ranges).toHaveLength(2);
    expect(result[0].ranges[0].start.toISOString()).toBe("2024-03-20T09:00:00.000Z");
    expect(result[1].ranges[0].start.toISOString()).toBe("2024-03-25T09:00:00.000Z");
  });
});

describe("getScheduleListItemData", () => {
  it("revives serialized dates on availability", () => {
    const result = getScheduleListItemData({
      isDefault: true,
      id: 1,
      name: "Working hours",
      timeZone: "UTC",
      availability: [
        {
          id: 10,
          userId: 5,
          startTime: "1970-01-01T09:00:00.000Z" as unknown as Date,
          endTime: "1970-01-01T17:00:00.000Z" as unknown as Date,
          eventTypeId: null,
          date: "2024-03-20T00:00:00.000Z" as unknown as Date,
          days: [1],
          scheduleId: 1,
        },
      ],
    });

    expect(result.name).toBe("Working hours");
    expect(result.availability[0].startTime).toBeInstanceOf(Date);
    expect(result.availability[0].endTime).toBeInstanceOf(Date);
    expect(result.availability[0].date).toBeInstanceOf(Date);
  });

  it("keeps a null date null", () => {
    const result = getScheduleListItemData({
      isDefault: false,
      id: 2,
      name: "No overrides",
      timeZone: null,
      availability: [
        {
          id: 11,
          userId: null,
          startTime: utcTime(9),
          endTime: utcTime(17),
          eventTypeId: null,
          date: null,
          days: [2],
          scheduleId: 2,
        },
      ],
    });

    expect(result.availability[0].date).toBeNull();
  });
});
