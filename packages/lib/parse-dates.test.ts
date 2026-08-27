import { TimeFormat } from "@calcom/lib/timeFormat";
import { Frequency } from "rrule";
import { describe, expect, it } from "vitest";
import { parseDate, parseDateTimeWithTimeZone, parseRecurringDates } from "./parse-dates";

const START = "2023-06-12T09:00:00Z";

describe("parseDate", () => {
  it("returns ['No date'] for falsy input", () => {
    expect(parseDate(null, "en", "UTC")).toEqual(["No date"]);
  });

  it("returns 'Invalid date' for unparseable input", () => {
    expect(parseDate("not-a-date", "en", "UTC")).toBe("Invalid date");
  });

  it("formats with the default 12h time format", () => {
    const result = parseDate(START, "en", "UTC", { withDefaultTimeFormat: true });
    expect(result).toBe("9:00am, Monday, June 12, 2023");
  });

  it("formats with a selected 24h time format", () => {
    const result = parseDate(START, "en", "UTC", { selectedTimeFormat: TimeFormat.TWENTY_FOUR_HOUR });
    expect(result).toBe("09:00, Monday, June 12, 2023");
  });
});

describe("parseDateTimeWithTimeZone", () => {
  const date = new Date(START);

  it("formats with default 12h format", () => {
    const result = parseDateTimeWithTimeZone(date, "en", "UTC", { withDefaultTimeFormat: true });
    expect(result).toBe("9:00am, Monday, June 12, 2023");
  });

  it("formats with selected 24h format", () => {
    const result = parseDateTimeWithTimeZone(date, "en", "UTC", {
      selectedTimeFormat: TimeFormat.TWENTY_FOUR_HOUR,
    });
    expect(result).toBe("09:00, Monday, June 12, 2023");
  });

  it("formats with selected 12h format", () => {
    const result = parseDateTimeWithTimeZone(date, "en", "UTC", {
      selectedTimeFormat: TimeFormat.TWELVE_HOUR,
    });
    expect(result).toBe("9:00am, Monday, June 12, 2023");
  });

  it("converts to the given timezone", () => {
    const result = parseDateTimeWithTimeZone(date, "en", "Asia/Dubai", { withDefaultTimeFormat: true });
    expect(result).toBe("1:00pm, Monday, June 12, 2023");
  });
});

describe("parseRecurringDates", () => {
  it("expands a weekly recurring event into the requested count", () => {
    const [dateStrings, dates] = parseRecurringDates(
      {
        startDate: START,
        timeZone: "UTC",
        recurringEvent: { freq: Frequency.WEEKLY, count: 10, interval: 1 },
        recurringCount: 3,
        withDefaultTimeFormat: true,
      },
      "en"
    );
    expect(dateStrings).toHaveLength(3);
    expect(dates).toHaveLength(3);
    expect(dateStrings[0]).toBe("9:00am, Monday, June 12, 2023");
    expect(dateStrings[1]).toBe("9:00am, Monday, June 19, 2023");
    expect(dates[2].toISOString()).toBe("2023-06-26T09:00:00.000Z");
  });

  it("handles a null recurringEvent by using only the count", () => {
    const [dateStrings, dates] = parseRecurringDates(
      {
        startDate: START,
        timeZone: "UTC",
        recurringEvent: null,
        recurringCount: 1,
        withDefaultTimeFormat: true,
      },
      "en"
    );
    expect(dateStrings).toEqual(["9:00am, Monday, June 12, 2023"]);
    expect(dates).toHaveLength(1);
  });
});
