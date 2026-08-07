import { buildCalendarEvent } from "@calcom/lib/test/builder";
import type { DestinationCalendar } from "@calcom/prisma/client";
import { describe, expect, it } from "vitest";
import generateIcsFile, { GenerateIcsRole } from "./generateIcsFile";

const buildDestinationCalendar = (integration: string) =>
  [{ integration }] as unknown as DestinationCalendar[];

describe("generateIcsFile", () => {
  it("returns an ics attachment with the event content", () => {
    const calEvent = buildCalendarEvent({ title: "Quick sync" });

    const file = generateIcsFile({ calEvent, role: GenerateIcsRole.ORGANIZER, status: "CONFIRMED" });

    expect(file).not.toBeNull();
    expect(file?.filename).toBe("event.ics");
    expect(file?.method).toBe("REQUEST");
    expect(file?.content).toContain("BEGIN:VCALENDAR");
    expect(file?.content).toContain(`UID:${calEvent.iCalUID}`);
    expect(file?.content).toContain("STATUS:CONFIRMED");
  });

  it("skips the attachment for organizers on Office 365 destination calendars", () => {
    const calEvent = buildCalendarEvent({
      destinationCalendar: buildDestinationCalendar("office365_calendar"),
    });

    expect(generateIcsFile({ calEvent, role: GenerateIcsRole.ORGANIZER, status: "CONFIRMED" })).toBeNull();
  });

  it("still attaches the ics for attendees on Office 365 destination calendars", () => {
    const calEvent = buildCalendarEvent({
      destinationCalendar: buildDestinationCalendar("office365_calendar"),
    });

    expect(generateIcsFile({ calEvent, role: GenerateIcsRole.ATTENDEE, status: "CONFIRMED" })).not.toBeNull();
  });

  it("attaches the ics for organizers on other destination calendars", () => {
    const calEvent = buildCalendarEvent({
      destinationCalendar: buildDestinationCalendar("google_calendar"),
    });

    expect(
      generateIcsFile({ calEvent, role: GenerateIcsRole.ORGANIZER, status: "CONFIRMED" })
    ).not.toBeNull();
  });

  it("propagates the requested status", () => {
    const calEvent = buildCalendarEvent();

    const file = generateIcsFile({ calEvent, role: GenerateIcsRole.ATTENDEE, status: "CANCELLED" });

    expect(file?.content).toContain("STATUS:CANCELLED");
  });
});
