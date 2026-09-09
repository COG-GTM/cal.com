import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeLocationChangeEmail from "./attendee-location-change-email";

describe("AttendeeLocationChangeEmail", () => {
  it("announces the new location and attaches an updated ics file", async () => {
    const attendee = buildPerson({
      language: {
        locale: "en",
        translate: createTranslator({
          location_changed_event_type_subject: "Location changed for {{eventType}} with {{name}}",
        }),
      },
    });
    const calEvent = buildCalEvent({
      attendees: [attendee],
      type: "30min",
      location: "https://meet.example.com/room",
    });

    const payload = await getPayload(new AttendeeLocationChangeEmail(calEvent, attendee));

    expect(payload.subject).toBe("Location changed for 30min with Oliver Organizer");
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics", method: "REQUEST" });
    expect(payload.text).toContain("event_location_changed");
    expect(String(payload.html)).toContain("https://meet.example.com/room");
  });
});
