import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeDeclinedEmail from "./attendee-declined-email";

const translate = createTranslator({ event_declined_subject: "Declined: {{title}} on {{date}}" });

describe("AttendeeDeclinedEmail", () => {
  it("announces the declined booking", async () => {
    const attendee = buildPerson({ language: { locale: "en", translate } });
    const calEvent = buildCalEvent({ attendees: [attendee], title: "Intro call" });

    const payload = await getPayload(new AttendeeDeclinedEmail(calEvent, attendee));

    expect(payload.subject).toBe("Declined: Intro call on 11:00am - 11:30am, saturday, june 1, 2024");
    expect(payload.text).toContain("event_request_declined");
    expect(payload.text).not.toContain("event_request_declined_recurring");
  });

  it("uses the recurring copy for recurring events", async () => {
    const attendee = buildPerson({ language: { locale: "en", translate } });
    const calEvent = buildCalEvent({
      attendees: [attendee],
      recurringEvent: { count: 4, freq: 0, interval: 1 },
    });

    const payload = await getPayload(new AttendeeDeclinedEmail(calEvent, attendee));

    expect(payload.text).toContain("event_request_declined_recurring");
  });
});
