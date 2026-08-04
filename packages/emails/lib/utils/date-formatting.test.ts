import type { TFunction } from "i18next";
import { describe, expect, test } from "vitest";

import { buildCalendarEvent, buildPerson } from "@calcom/lib/test/builder";
import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";

import { getFormattedDate } from "./date-formatting";

const buildEvent = ({ timeFormat }: { timeFormat?: TimeFormat } = {}): CalendarEvent =>
  buildCalendarEvent({
    startTime: "2024-03-15T14:30:00.000Z",
    endTime: "2024-03-15T15:00:00.000Z",
    organizer: buildPerson({ timeFormat }),
  });

const buildAttendee = ({ timeZone, locale = "en" }: { timeZone: string; locale?: string }): Person =>
  buildPerson({ timeZone, language: { locale, translate: ((key: string) => key) as TFunction } });

describe("getFormattedDate", () => {
  test("formats the range in the attendee timezone with the organizer's 12 hour format", () => {
    const formatted = getFormattedDate(
      buildEvent({ timeFormat: TimeFormat.TWELVE_HOUR }),
      buildAttendee({ timeZone: "America/New_York" })
    );

    expect(formatted).toEqual("10:30am - 11:00am, friday, march 15, 2024");
  });

  test("uses the organizer's 24 hour format", () => {
    const formatted = getFormattedDate(
      buildEvent({ timeFormat: TimeFormat.TWENTY_FOUR_HOUR }),
      buildAttendee({ timeZone: "America/New_York" })
    );

    expect(formatted).toEqual("10:30 - 11:00, friday, march 15, 2024");
  });

  test("defaults to the 12 hour format when the organizer has no preference", () => {
    const formatted = getFormattedDate(buildEvent(), buildAttendee({ timeZone: "America/New_York" }));

    expect(formatted).toEqual("10:30am - 11:00am, friday, march 15, 2024");
  });

  test("shifts the date when the attendee timezone crosses a day boundary", () => {
    const formatted = getFormattedDate(
      buildEvent({ timeFormat: TimeFormat.TWENTY_FOUR_HOUR }),
      buildAttendee({ timeZone: "Asia/Tokyo" })
    );

    expect(formatted).toEqual("23:30 - 00:00, friday, march 15, 2024");
  });

  test("passes the weekday and month through the attendee's translate function", () => {
    const translated: string[] = [];
    const attendee = buildPerson({
      timeZone: "Europe/Berlin",
      language: {
        locale: "en",
        translate: ((key: string) => {
          translated.push(key);
          return key.toUpperCase();
        }) as TFunction,
      },
    });

    const formatted = getFormattedDate(buildEvent({ timeFormat: TimeFormat.TWENTY_FOUR_HOUR }), attendee);

    expect(translated).toEqual(["friday", "march"]);
    expect(formatted).toEqual("15:30 - 16:00, FRIDAY, MARCH 15, 2024");
  });
});
