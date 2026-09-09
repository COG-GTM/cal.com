import { describe, expect, it } from "vitest";
import { buildCalEvent, buildOrganizer, createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizerCancelledEmail from "./organizer-cancelled-email";

const organizer = buildOrganizer({
  language: {
    locale: "en",
    translate: createTranslator({
      event_cancelled_subject: "Cancelled: {{title}}",
      event_reassigned_subject: "Reassigned: {{title}}",
    }),
  },
});

describe("OrganizerCancelledEmail", () => {
  it("uses the cancelled subject and a cancelled ics file", async () => {
    const calEvent = buildCalEvent({ organizer, title: "Intro call" });

    const payload = await getPayload(new OrganizerCancelledEmail({ calEvent }));

    expect(payload.subject).toBe("Cancelled: Intro call");
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics" });
    expect(payload.text).toContain("event_request_cancelled");
  });

  it("switches to the reassigned subject when the booking was reassigned", async () => {
    const calEvent = buildCalEvent({ organizer, title: "Intro call" });

    const payload = await getPayload(
      new OrganizerCancelledEmail({
        calEvent,
        reassigned: { name: "Rita", email: "rita@example.com", byUser: "Oliver Organizer" },
      })
    );

    expect(payload.subject).toBe("Reassigned: Intro call");
    expect(String(payload.html)).toContain("Oliver Organizer");
  });
});
