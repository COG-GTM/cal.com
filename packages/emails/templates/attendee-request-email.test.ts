import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeRequestEmail from "./attendee-request-email";

const translate = createTranslator({
  booking_submitted_subject: "Booking submitted: {{title}}",
  booking_submitted: "Booking submitted by {{name}}",
  user_needs_to_confirm_or_reject_booking: "{{user}} still needs to confirm",
});

describe("AttendeeRequestEmail", () => {
  it("sends to every attendee and explains the booking still needs confirmation", async () => {
    const first = buildPerson({ language: { locale: "en", translate } });
    const second = buildPerson({
      id: 3,
      name: "Bob",
      email: "bob@example.com",
      language: { locale: "en", translate },
    });
    const calEvent = buildCalEvent({ attendees: [first, second], title: "Intro call" });

    const payload = await getPayload(new AttendeeRequestEmail(calEvent, first));

    expect(payload.to).toBe("anna@example.com,bob@example.com");
    expect(payload.subject).toBe("Booking submitted: Intro call");
    expect(payload.text).toContain("Booking submitted by Anna Attendee");
    expect(payload.text).toContain("Oliver Organizer still needs to confirm");
  });
});
