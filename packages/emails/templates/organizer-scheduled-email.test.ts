import { describe, expect, it } from "vitest";
import {
  buildCalEvent,
  buildOrganizer,
  buildPerson,
  createTranslator,
  getPayload,
} from "../test-utils/fixtures";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

describe("OrganizerScheduledEmail", () => {
  it("sends to the organizer with the event title as subject", async () => {
    const calEvent = buildCalEvent({ title: "Intro call" });

    const payload = await getPayload(new OrganizerScheduledEmail({ calEvent }));

    expect(payload.to).toBe("oliver@example.com");
    expect(payload.subject).toBe("Intro call");
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics" });
  });

  it("sends to the team member instead of the organizer when one is given", async () => {
    const teamMember = buildPerson({ id: 9, name: "Tina", email: "tina@example.com" });
    const calEvent = buildCalEvent();

    const payload = await getPayload(new OrganizerScheduledEmail({ calEvent, teamMember }));

    expect(payload.to).toBe("tina@example.com");
  });

  it("prefixes the subject when the booking is a new seat", async () => {
    const organizer = buildOrganizer({
      language: { locale: "en", translate: createTranslator({ new_attendee: "New attendee" }) },
    });
    const calEvent = buildCalEvent({ organizer, title: "Group class" });

    const payload = await getPayload(new OrganizerScheduledEmail({ calEvent, newSeat: true }));

    expect(payload.subject).toBe("New attendee: Group class");
  });

  it("uses the recurring copy in the text body for recurring events", async () => {
    const calEvent = buildCalEvent({ recurringEvent: { count: 2, freq: 0, interval: 1 } });

    const payload = await getPayload(new OrganizerScheduledEmail({ calEvent }));

    expect(payload.text).toContain("new_event_scheduled_recurring");
  });

  it("renders reassignment details when the booking was reassigned", async () => {
    const calEvent = buildCalEvent();
    const reassigned = { name: "Rita", email: "rita@example.com", reason: "PTO" };

    const payload = await getPayload(new OrganizerScheduledEmail({ calEvent, reassigned }));
    const html = String(payload.html);

    expect(html).toContain("Rita");
    expect(html).toContain("PTO");
  });

  it("formats the date in the organizer timezone", async () => {
    const calEvent = buildCalEvent();
    const email = new OrganizerScheduledEmail({ calEvent });

    const payload = await getPayload(email);

    expect(String(payload.html)).toContain("America/New_York");
    expect(String(payload.html)).toContain("6:00am - 6:30am");
  });
});
