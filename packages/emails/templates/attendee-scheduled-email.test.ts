import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeScheduledEmail from "./attendee-scheduled-email";

describe("AttendeeScheduledEmail", () => {
  it("addresses the attendee and uses the event title as the subject", async () => {
    const attendee = buildPerson({ name: "Anna Attendee", email: "anna@example.com" });
    const calEvent = buildCalEvent({ title: "Intro call", attendees: [attendee] });

    const payload = await getPayload(new AttendeeScheduledEmail(calEvent, attendee));

    expect(payload.to).toBe("Anna Attendee <anna@example.com>");
    expect(payload.subject).toBe("Intro call");
    expect(payload.from).toContain("Oliver Organizer <");
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics", method: "REQUEST" });
  });

  it("keeps every attendee when the event has no seats", async () => {
    const attendee = buildPerson({ name: "Anna", email: "anna@example.com" });
    const other = buildPerson({ id: 3, name: "Bob", email: "bob@example.com" });
    const calEvent = buildCalEvent({ attendees: [attendee, other] });

    const email = new AttendeeScheduledEmail(calEvent, attendee);

    expect(email.calEvent.attendees).toHaveLength(2);
  });

  it("hides the other attendees for seated events that do not show attendees", async () => {
    const attendee = buildPerson({ name: "Anna", email: "anna@example.com" });
    const other = buildPerson({ id: 3, name: "Bob", email: "bob@example.com" });
    const calEvent = buildCalEvent({
      attendees: [attendee, other],
      seatsPerTimeSlot: 5,
      seatsShowAttendees: false,
    });

    const email = new AttendeeScheduledEmail(calEvent, attendee);

    expect(email.calEvent.attendees).toEqual([attendee]);
  });

  it("shows the other attendees for seated events when seatsShowAttendees is set", async () => {
    const attendee = buildPerson({ name: "Anna", email: "anna@example.com" });
    const other = buildPerson({ id: 3, name: "Bob", email: "bob@example.com" });
    const calEvent = buildCalEvent({
      attendees: [attendee, other],
      seatsPerTimeSlot: 5,
      seatsShowAttendees: true,
    });

    const email = new AttendeeScheduledEmail(calEvent, attendee);

    expect(email.calEvent.attendees).toHaveLength(2);
  });

  it("honours an explicit showAttendees argument over the seat settings", async () => {
    const attendee = buildPerson({ name: "Anna", email: "anna@example.com" });
    const other = buildPerson({ id: 3, name: "Bob", email: "bob@example.com" });
    const calEvent = buildCalEvent({
      attendees: [attendee, other],
      seatsPerTimeSlot: 5,
      seatsShowAttendees: true,
    });

    const email = new AttendeeScheduledEmail(calEvent, attendee, false);

    expect(email.calEvent.attendees).toEqual([attendee]);
  });

  it("formats the date in the attendee timezone", async () => {
    const attendee = buildPerson({
      timeZone: "Europe/London",
      language: { locale: "en", translate: createTranslator() },
    });
    const calEvent = buildCalEvent({
      attendees: [attendee],
      startTime: "2024-06-01T10:00:00.000Z",
      endTime: "2024-06-01T10:30:00.000Z",
    });

    const email = new AttendeeScheduledEmail(calEvent, attendee);

    expect(email.getFormattedDate()).toBe("11:00am - 11:30am, saturday, june 1, 2024");
  });

  it("renders the recurring copy in the text body when the event recurs", async () => {
    const attendee = buildPerson();
    const calEvent = buildCalEvent({
      attendees: [attendee],
      recurringEvent: { count: 3, freq: 0, interval: 1 },
    });

    const payload = await getPayload(new AttendeeScheduledEmail(calEvent, attendee));

    expect(payload.text).toContain("your_event_has_been_scheduled_recurring");
  });

  it("renders the html with the event details", async () => {
    const attendee = buildPerson();
    const calEvent = buildCalEvent({ attendees: [attendee], title: "Intro call" });

    const payload = await getPayload(new AttendeeScheduledEmail(calEvent, attendee));
    const html = String(payload.html);

    expect(html).toContain("Intro call");
    expect(html).toContain("anna@example.com");
  });
});
