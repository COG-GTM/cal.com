import { describe, expect, it } from "vitest";
import {
  buildCalEvent,
  buildOrganizer,
  buildPerson,
  createTranslator,
  getPayload,
} from "../test-utils/fixtures";
import OrganizerAttendeeCancelledSeatEmail from "./organizer-attendee-cancelled-seat-email";

const organizer = buildOrganizer({
  language: {
    locale: "en",
    translate: createTranslator({ event_cancelled_subject: "Cancelled: {{title}}" }),
  },
});

describe("OrganizerAttendeeCancelledSeatEmail", () => {
  it("emails only the organizer when the event has no team", async () => {
    const calEvent = buildCalEvent({ organizer, title: "Group class" });

    const payload = await getPayload(new OrganizerAttendeeCancelledSeatEmail({ calEvent }));

    expect(payload.to).toBe("oliver@example.com");
    expect(payload.subject).toBe("Cancelled: Group class");
    expect(payload.text).toContain("event_request_cancelled");
  });

  it("also emails team members that are attendees of the booking", async () => {
    const memberAttendee = buildPerson({ id: 4, name: "Mia", email: "mia@example.com" });
    const calEvent = buildCalEvent({
      organizer,
      attendees: [buildPerson(), memberAttendee],
      team: {
        id: 1,
        name: "Sales",
        members: [
          { id: 4, name: "Mia", email: "mia@example.com", timeZone: "UTC", language: organizer.language },
          {
            id: 5,
            name: "Not an attendee",
            email: "nobody@example.com",
            timeZone: "UTC",
            language: organizer.language,
          },
        ],
      },
    });

    const payload = await getPayload(new OrganizerAttendeeCancelledSeatEmail({ calEvent }));

    expect(payload.to).toBe("oliver@example.com,mia@example.com");
  });
});
