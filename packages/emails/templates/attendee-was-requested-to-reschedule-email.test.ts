import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeWasRequestedToRescheduleEmail from "./attendee-was-requested-to-reschedule-email";

const translate = createTranslator({
  requested_to_reschedule_subject_attendee: "Please reschedule {{eventType}}, {{name}}",
  request_reschedule_subtitle: "{{organizer}} asked you to pick a new time",
});

describe("AttendeeWasRequestedToRescheduleEmail", () => {
  it("emails only the first attendee with a cancelled ics file", async () => {
    const attendee = buildPerson({ language: { locale: "en", translate } });
    const other = buildPerson({ id: 3, name: "Bob", email: "bob@example.com" });
    const calEvent = buildCalEvent({ attendees: [attendee, other], type: "30min" });

    const payload = await getPayload(
      new AttendeeWasRequestedToRescheduleEmail(calEvent, { rescheduleLink: "https://cal.com/resched" })
    );

    expect(payload.to).toBe("anna@example.com");
    expect(payload.subject).toBe("Please reschedule 30min, Anna Attendee");
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics" });
    expect(String(payload.html)).toContain("https://cal.com/resched");
  });

  it("strips html from the text body while keeping the struck-through original time", async () => {
    const attendee = buildPerson({ language: { locale: "en", translate } });
    const calEvent = buildCalEvent({ attendees: [attendee] });

    const payload = await getPayload(
      new AttendeeWasRequestedToRescheduleEmail(calEvent, { rescheduleLink: "https://cal.com/resched" })
    );
    const text = String(payload.text);

    expect(text).not.toContain("<p");
    expect(text).toContain("Oliver Organizer asked you to pick a new time");
    expect(text).toContain("saturday, june 1, 2024 | 6:00am - 6:30am (America/New_York)");
  });
});
