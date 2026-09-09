import { describe, expect, it } from "vitest";
import { buildCalEvent, buildOrganizer, createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizerPaymentRefundFailedEmail from "./organizer-payment-refund-failed-email";

const organizer = buildOrganizer({
  language: {
    locale: "en",
    translate: createTranslator({
      refund_failed_subject: "Refund failed for {{eventType}} with {{name}}",
      check_with_provider_and_user: "Check with your payment provider and {{user}}",
      error_message: "Error: {{errorMessage}}",
    }),
  },
});

describe("OrganizerPaymentRefundFailedEmail", () => {
  it("reports the failure without a payment reason when there is no payment info", async () => {
    const calEvent = buildCalEvent({ organizer, type: "30min" });

    const payload = await getPayload(new OrganizerPaymentRefundFailedEmail({ calEvent }));

    expect(payload.subject).toBe("Refund failed for 30min with Anna Attendee");
    expect(payload.text).toContain("Check with your payment provider and Anna Attendee");
    expect(payload.text).not.toContain("Error:");
  });

  it("includes the payment provider error message when payment info is present", async () => {
    const calEvent = buildCalEvent({
      organizer,
      paymentInfo: { reason: "card_declined", link: null, id: null, paymentOption: null, amount: 1000 },
    });

    const payload = await getPayload(new OrganizerPaymentRefundFailedEmail({ calEvent }));

    expect(payload.text).toContain("Error: card_declined");
  });
});
