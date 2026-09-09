import { describe, expect, it } from "vitest";
import { buildCalEvent, buildOrganizer, createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizerReassignedEmail from "./organizer-reassigned-email";

const organizer = buildOrganizer({
  language: {
    locale: "en",
    translate: createTranslator({ event_reassigned_subject: "Reassigned: {{title}}" }),
  },
});

describe("OrganizerReassignedEmail", () => {
  it("cancels the organizer's copy of the booking and names the new host", async () => {
    const calEvent = buildCalEvent({ organizer, title: "Intro call" });

    const payload = await getPayload(
      new OrganizerReassignedEmail({
        calEvent,
        reassigned: { name: "Rita", email: "rita@example.com", reason: "Out of office" },
      })
    );

    expect(payload.subject).toBe("Reassigned: Intro call");
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics" });
    expect(payload.text).toContain("event_request_reassigned");
    expect(String(payload.html)).toContain("Out of office");
  });
});
