import { describe, expect, it } from "vitest";
import {
  buildCalEvent,
  buildOrganizer,
  buildPerson,
  createTranslator,
  getPayload,
} from "../test-utils/fixtures";
import OrganizerAddGuestsEmail from "./organizer-add-guests-email";

const organizer = buildOrganizer({
  language: {
    locale: "en",
    translate: createTranslator({ guests_added_event_type_subject: "Guests added to {{eventType}}" }),
  },
});

describe("OrganizerAddGuestsEmail", () => {
  it("tells the organizer guests were added", async () => {
    const calEvent = buildCalEvent({ organizer, type: "30min" });

    const payload = await getPayload(new OrganizerAddGuestsEmail({ calEvent }));

    expect(payload.subject).toBe("Guests added to 30min");
    expect(payload.to).toBe("oliver@example.com");
    expect(payload.text).toContain("new_guests_added");
  });

  it("routes the email to the team member when present", async () => {
    const calEvent = buildCalEvent({ organizer });
    const teamMember = buildPerson({ id: 9, name: "Tina", email: "tina@example.com" });

    const payload = await getPayload(new OrganizerAddGuestsEmail({ calEvent, teamMember }));

    expect(payload.to).toBe("tina@example.com");
  });
});
