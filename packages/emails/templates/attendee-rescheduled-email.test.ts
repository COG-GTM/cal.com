import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeRescheduledEmail from "./attendee-rescheduled-email";

describe("AttendeeRescheduledEmail", () => {
  it("announces the new time and attaches a confirmed ics file", async () => {
    const attendee = buildPerson({
      language: {
        locale: "en",
        translate: createTranslator({
          event_type_has_been_rescheduled_on_time_date: "{{title}} moved to {{date}}",
        }),
      },
    });
    const calEvent = buildCalEvent({ attendees: [attendee], title: "Intro call" });

    const payload = await getPayload(new AttendeeRescheduledEmail(calEvent, attendee));

    expect(payload.subject).toBe("Intro call moved to 11:00am - 11:30am, saturday, june 1, 2024");
    expect(payload.icalEvent).toMatchObject({ filename: "event.ics" });
    expect(payload.text).toContain("event_has_been_rescheduled");
  });
});
