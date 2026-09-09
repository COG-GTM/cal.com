import { describe, expect, it } from "vitest";
import { buildCalEvent } from "../test-utils/fixtures";
import generateIcsFile, { GenerateIcsRole } from "./generateIcsFile";

describe("generateIcsFile", () => {
  it("builds an ics attachment for the attendee", () => {
    const file = generateIcsFile({
      calEvent: buildCalEvent(),
      role: GenerateIcsRole.ATTENDEE,
      status: "CONFIRMED",
    });

    expect(file).toMatchObject({ filename: "event.ics", method: "REQUEST" });
    expect(file?.content).toContain("BEGIN:VCALENDAR");
    expect(file?.content).toContain("STATUS:CONFIRMED");
  });

  it("skips the attachment for organizers with an Office 365 destination calendar", () => {
    const calEvent = buildCalEvent({
      destinationCalendar: [
        {
          id: 1,
          integration: "office365_calendar",
          externalId: "cal-1",
          primaryEmail: null,
          userId: 1,
          eventTypeId: null,
          credentialId: null,
          domainWideDelegationCredentialId: null,
          delegationCredentialId: null,
          createdAt: null,
          updatedAt: null,
          customCalendarReminder: null,
        },
      ],
    });

    expect(generateIcsFile({ calEvent, role: GenerateIcsRole.ORGANIZER, status: "CONFIRMED" })).toBeNull();
  });

  it("still attaches the ics for attendees on Office 365 destination calendars", () => {
    const calEvent = buildCalEvent({
      destinationCalendar: [
        {
          id: 1,
          integration: "office365_calendar",
          externalId: "cal-1",
          primaryEmail: null,
          userId: 1,
          eventTypeId: null,
          credentialId: null,
          domainWideDelegationCredentialId: null,
          delegationCredentialId: null,
          createdAt: null,
          updatedAt: null,
          customCalendarReminder: null,
        },
      ],
    });

    expect(generateIcsFile({ calEvent, role: GenerateIcsRole.ATTENDEE, status: "CANCELLED" })).not.toBeNull();
  });
});
