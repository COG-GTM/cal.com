import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeCancelledEmail from "./attendee-cancelled-email";

describe("AttendeeCancelledEmail", () => {
  it("announces the cancellation with a cancelled ics attachment", async () => {
    const attendee = buildPerson({
      language: {
        locale: "en",
        translate: createTranslator({ event_cancelled_subject: "Cancelled: {{title}} on {{date}}" }),
      },
    });
    const calEvent = buildCalEvent({
      attendees: [attendee],
      title: "Intro call",
      cancellationReason: "Something came up",
    });

    const payload = await getPayload(new AttendeeCancelledEmail(calEvent, attendee));

    expect(payload.subject).toBe("Cancelled: Intro call on 11:00am - 11:30am, saturday, june 1, 2024");
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics" });
    expect(payload.text).toContain("event_request_cancelled");
    expect(String(payload.html)).toContain("Something came up");
  });
});
