import { describe, expect, it } from "vitest";
import { buildCalEvent, buildOrganizer, createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizerRequestedToRescheduleEmail from "./organizer-requested-to-reschedule-email";

describe("OrganizerRequestedToRescheduleEmail", () => {
  it("tells the organizer the attendee asked to reschedule", async () => {
    const organizer = buildOrganizer({
      language: {
        locale: "en",
        translate: createTranslator({
          rescheduled_event_type_subject: "Reschedule requested for {{eventType}} with {{name}}",
          request_reschedule_title_organizer: "{{attendee}} asked to reschedule",
          request_reschedule_subtitle_organizer: "Pick a new time with {{attendee}}",
        }),
      },
    });
    const calEvent = buildCalEvent({ organizer, type: "30min" });

    const payload = await getPayload(
      new OrganizerRequestedToRescheduleEmail(calEvent, { rescheduleLink: "https://cal.com/resched" })
    );

    expect(payload.to).toBe("oliver@example.com");
    expect(payload.subject).toBe("Reschedule requested for 30min with Anna Attendee");
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics" });
    expect(payload.text).toContain("Anna Attendee asked to reschedule");
    expect(payload.text).toContain("Pick a new time with Anna Attendee");
  });
});
