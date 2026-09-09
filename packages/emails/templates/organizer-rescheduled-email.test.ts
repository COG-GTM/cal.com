import { describe, expect, it } from "vitest";
import { buildCalEvent, buildOrganizer, createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizerRescheduledEmail from "./organizer-rescheduled-email";

describe("OrganizerRescheduledEmail", () => {
  it("announces the new time to the organizer", async () => {
    const organizer = buildOrganizer({
      language: {
        locale: "en",
        translate: createTranslator({
          event_type_has_been_rescheduled_on_time_date: "{{title}} moved to {{date}}",
        }),
      },
    });
    const calEvent = buildCalEvent({ organizer, title: "Intro call", attendeeSeatId: "seat-1" });

    const payload = await getPayload(new OrganizerRescheduledEmail({ calEvent }));

    expect(payload.subject).toBe("Intro call moved to 6:00am - 6:30am, saturday, june 1, 2024");
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics" });
    expect(payload.text).toContain("event_has_been_rescheduled");
  });
});
