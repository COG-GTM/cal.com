import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeAwaitingPaymentEmail from "./attendee-awaiting-payment-email";

describe("AttendeeAwaitingPaymentEmail", () => {
  it("asks the attendee to complete the booking and sends no ics attachment", async () => {
    const attendee = buildPerson({
      language: {
        locale: "en",
        translate: createTranslator({ complete_your_booking_subject: "Pay for {{title}} on {{date}}" }),
      },
    });
    const calEvent = buildCalEvent({ attendees: [attendee], title: "Paid consult" });

    const payload = await getPayload(new AttendeeAwaitingPaymentEmail(calEvent, attendee));

    expect(payload.subject).toBe("Pay for Paid consult on 11:00am - 11:30am, saturday, june 1, 2024");
    expect(payload.to).toBe("Anna Attendee <anna@example.com>");
    expect(payload.icalEvent).toBeUndefined();
    expect(payload.text).toContain("meeting_awaiting_payment");
    expect(String(payload.html)).toContain("Paid consult");
  });
});
