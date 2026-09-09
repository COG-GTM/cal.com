import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeCancelledSeatEmail from "./attendee-cancelled-seat-email";

describe("AttendeeCancelledSeatEmail", () => {
  it("confirms the attendee is no longer attending", async () => {
    const attendee = buildPerson({
      language: {
        locale: "en",
        translate: createTranslator({ event_no_longer_attending_subject: "Not attending {{title}}" }),
      },
    });
    const calEvent = buildCalEvent({
      attendees: [attendee],
      title: "Group class",
      seatsPerTimeSlot: 10,
      seatsShowAttendees: false,
    });

    const payload = await getPayload(new AttendeeCancelledSeatEmail(calEvent, attendee));

    expect(payload.subject).toBe("Not attending Group class");
    expect(payload.to).toBe("Anna Attendee <anna@example.com>");
    expect(payload.text).toContain("event_request_cancelled");
    expect(payload.icalEvent).toBeUndefined();
  });
});
