import { TimeFormat } from "@calcom/lib/timeFormat";
import { describe, expect, it } from "vitest";
import { buildCalEvent, buildOrganizer, buildPerson, createTranslator } from "../../test-utils/fixtures";
import { getFormattedDate } from "./date-formatting";

describe("getFormattedDate", () => {
  it("formats the range in the attendee timezone with 12h organizer preference", () => {
    const attendee = buildPerson({ timeZone: "Europe/London" });
    const calEvent = buildCalEvent({ attendees: [attendee] });

    expect(getFormattedDate(calEvent, attendee)).toBe("11:00am - 11:30am, saturday, june 1, 2024");
  });

  it("honours the organizer 24h time format", () => {
    const attendee = buildPerson({ timeZone: "Europe/London" });
    const calEvent = buildCalEvent({
      attendees: [attendee],
      organizer: buildOrganizer({ timeFormat: TimeFormat.TWENTY_FOUR_HOUR }),
    });

    expect(getFormattedDate(calEvent, attendee)).toBe("11:00 - 11:30, saturday, june 1, 2024");
  });

  it("shifts the date when the attendee is in a timezone across the date line", () => {
    const attendee = buildPerson({ timeZone: "Pacific/Auckland" });
    const calEvent = buildCalEvent({ attendees: [attendee] });

    expect(getFormattedDate(calEvent, attendee)).toBe("10:00pm - 10:30pm, saturday, june 1, 2024");
  });

  it("translates the weekday and month through the attendee translator", () => {
    const attendee = buildPerson({
      timeZone: "UTC",
      language: {
        locale: "en",
        translate: createTranslator({ saturday: "Samstag", june: "Juni" }),
      },
    });
    const calEvent = buildCalEvent({ attendees: [attendee] });

    expect(getFormattedDate(calEvent, attendee)).toBe("10:00am - 10:30am, Samstag, Juni 1, 2024");
  });
});
