import dayjs from "@calcom/dayjs";
import { describe, expect, it, vi } from "vitest";
import {
  calculateHourSizeInPx,
  getDaysBetweenDates,
  getHoursToDisplay,
  gridCellToDateTime,
  mergeOverlappingDateRanges,
  weekdayDates,
} from "./index";

describe("weekdayDates", () => {
  it("walks back to the requested week start and spans the given length", () => {
    // 2024-01-03 is a Wednesday.
    const { startDate, endDate } = weekdayDates(0, new Date("2024-01-03T00:00:00.000Z"));

    expect(startDate.getDay()).toBe(0);
    expect(dayjs(startDate).format("YYYY-MM-DD")).toBe("2023-12-31");
    expect(dayjs(endDate).format("YYYY-MM-DD")).toBe("2024-01-06");
  });

  it("supports a monday week start and a custom length", () => {
    const { startDate, endDate } = weekdayDates(1, new Date("2024-01-03T00:00:00.000Z"), 13);

    expect(dayjs(startDate).format("YYYY-MM-DD")).toBe("2024-01-01");
    expect(dayjs(endDate).format("YYYY-MM-DD")).toBe("2024-01-14");
  });

  it("keeps the start date when it already is the week start", () => {
    const { startDate } = weekdayDates(3, new Date("2024-01-03T00:00:00.000Z"));

    expect(dayjs(startDate).format("YYYY-MM-DD")).toBe("2024-01-03");
  });
});

describe("gridCellToDateTime", () => {
  const day = dayjs("2024-01-03T00:00:00.000Z");

  it("maps the first cell to the start hour", () => {
    const result = gridCellToDateTime({
      day,
      gridCellIdx: 0,
      totalGridCells: 24,
      selectionLength: 23,
      startHour: 9,
      timezone: "UTC",
    });

    expect(result.format("YYYY-MM-DD HH:mm")).toBe("2024-01-03 09:00");
  });

  it("offsets later cells by the cell duration", () => {
    const result = gridCellToDateTime({
      day,
      gridCellIdx: 3,
      totalGridCells: 48,
      selectionLength: 23,
      startHour: 0,
      timezone: "UTC",
    });

    expect(result.format("HH:mm")).toBe("01:30");
  });

  it("resolves the cell in the given timezone", () => {
    const result = gridCellToDateTime({
      day,
      gridCellIdx: 0,
      totalGridCells: 24,
      selectionLength: 23,
      startHour: 0,
      timezone: "America/New_York",
    });

    expect(result.utcOffset()).toBe(-300);
  });
});

describe("getDaysBetweenDates", () => {
  it("returns every day in the range at midnight, inclusive of both ends", () => {
    const dates = getDaysBetweenDates(
      new Date("2024-01-01T13:45:00.000Z"),
      new Date("2024-01-04T05:00:00.000Z")
    );

    expect(dates.map((date) => date.format("YYYY-MM-DD HH:mm:ss"))).toEqual([
      "2024-01-01 00:00:00",
      "2024-01-02 00:00:00",
      "2024-01-03 00:00:00",
      "2024-01-04 00:00:00",
    ]);
  });

  it("returns a single day when both dates are on the same day", () => {
    const dates = getDaysBetweenDates(
      new Date("2024-01-01T01:00:00.000Z"),
      new Date("2024-01-01T23:00:00.000Z")
    );

    expect(dates).toHaveLength(1);
  });

  it("caps the result at seven days", () => {
    const dates = getDaysBetweenDates(
      new Date("2024-01-01T00:00:00.000Z"),
      new Date("2024-02-01T00:00:00.000Z")
    );

    expect(dates).toHaveLength(7);
  });
});

describe("getHoursToDisplay", () => {
  it("returns every hour between start and end inclusive", () => {
    const hours = getHoursToDisplay(9, 12, "UTC");

    expect(hours.map((hour) => hour.format("HH:mm"))).toEqual(["09:00", "10:00", "11:00", "12:00"]);
  });

  it("returns a single entry when start and end are equal", () => {
    expect(getHoursToDisplay(9, 9, "UTC")).toHaveLength(1);
  });
});

describe("mergeOverlappingDateRanges", () => {
  const range = (start: string, end: string) => ({ start: new Date(start), end: new Date(end) });

  it("returns an empty array for no ranges", () => {
    expect(mergeOverlappingDateRanges([])).toEqual([]);
  });

  it("merges overlapping and touching ranges and sorts by start", () => {
    const merged = mergeOverlappingDateRanges([
      range("2024-01-01T12:00:00.000Z", "2024-01-01T13:00:00.000Z"),
      range("2024-01-01T09:00:00.000Z", "2024-01-01T10:00:00.000Z"),
      range("2024-01-01T10:00:00.000Z", "2024-01-01T11:00:00.000Z"),
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0].start.toISOString()).toBe("2024-01-01T09:00:00.000Z");
    expect(merged[0].end.toISOString()).toBe("2024-01-01T11:00:00.000Z");
    expect(merged[1].start.toISOString()).toBe("2024-01-01T12:00:00.000Z");
  });

  it("keeps disjoint ranges separate", () => {
    const merged = mergeOverlappingDateRanges([
      range("2024-01-01T09:00:00.000Z", "2024-01-01T10:00:00.000Z"),
      range("2024-01-01T14:00:00.000Z", "2024-01-01T15:00:00.000Z"),
    ]);

    expect(merged).toHaveLength(2);
  });
});

describe("calculateHourSizeInPx", () => {
  it("divides the remaining viewport height by the number of hours", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(1000);
    const gridElement = {
      getBoundingClientRect: () => ({ top: 150 }),
    } as unknown as HTMLOListElement;

    expect(calculateHourSizeInPx(gridElement, 0, 10)).toBe(80);
  });

  it("falls back to a default offset when there is no grid element", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(1000);

    expect(calculateHourSizeInPx(null, 0, 10)).toBe(88.5);
  });
});
