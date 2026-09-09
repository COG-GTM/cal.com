import { describe, expect, it } from "vitest";
import { buildCalEvent, buildOrganizer, createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizerAddAttendeeEmail from "./organizer-add-attendee-email";

describe("OrganizerAddAttendeeEmail", () => {
  it("tells the organizer an attendee was added", async () => {
    const organizer = buildOrganizer({
      language: {
        locale: "en",
        translate: createTranslator({
          attendee_added_event_type_subject: "New attendee on {{eventType}}: {{name}}",
        }),
      },
    });
    const calEvent = buildCalEvent({ organizer, type: "30min" });

    const payload = await getPayload(new OrganizerAddAttendeeEmail({ calEvent }));

    expect(payload.to).toBe("oliver@example.com");
    expect(payload.subject).toBe("New attendee on 30min: Anna Attendee");
    expect(payload.text).toContain("new_attendee_added");
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics" });
  });
});
