import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeAddGuestsEmail from "./attendee-add-guests-email";

const translate = createTranslator({
  guests_added_event_type_subject: "Guests added: {{eventType}} with {{name}} on {{date}}",
});

describe("AttendeeAddGuestsEmail", () => {
  it("tells the attendee guests were added and keeps the ics attachment", async () => {
    const attendee = buildPerson({ language: { locale: "en", translate } });
    const calEvent = buildCalEvent({ attendees: [attendee], type: "30min" });

    const payload = await getPayload(new AttendeeAddGuestsEmail(calEvent, attendee));

    expect(payload.to).toBe("Anna Attendee <anna@example.com>");
    expect(payload.subject).toBe(
      "Guests added: 30min with Oliver Organizer on 11:00am - 11:30am, saturday, june 1, 2024"
    );
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics" });
    expect(payload.text).toContain("new_guests_added");
  });

  it("prefers the team name over the organizer name in the subject", async () => {
    const attendee = buildPerson({ language: { locale: "en", translate } });
    const calEvent = buildCalEvent({
      attendees: [attendee],
      team: { name: "Sales", members: [], id: 7 },
    });

    const payload = await getPayload(new AttendeeAddGuestsEmail(calEvent, attendee));

    expect(payload.subject).toContain("with Sales on");
  });
});
