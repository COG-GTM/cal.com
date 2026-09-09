import { describe, expect, it } from "vitest";
import { buildCalEvent, buildOrganizer, createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizerLocationChangeEmail from "./organizer-location-change-email";

describe("OrganizerLocationChangeEmail", () => {
  it("tells the organizer the location changed and attaches a confirmed ics file", async () => {
    const organizer = buildOrganizer({
      language: {
        locale: "en",
        translate: createTranslator({
          location_changed_event_type_subject: "New location for {{eventType}} with {{name}}",
        }),
      },
    });
    const calEvent = buildCalEvent({ organizer, type: "30min", location: "Phone call" });

    const payload = await getPayload(new OrganizerLocationChangeEmail({ calEvent }));

    expect(payload.subject).toBe("New location for 30min with Anna Attendee");
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics" });
    expect(payload.text).toContain("event_location_changed");
  });
});
