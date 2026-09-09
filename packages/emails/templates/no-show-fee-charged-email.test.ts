import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import NoShowFeeChargedEmail from "./no-show-fee-charged-email";

const attendee = buildPerson({
  language: {
    locale: "en",
    translate: createTranslator({
      no_show_fee_charged_email_subject: "You were charged {{amount}} for {{title}}",
    }),
  },
});

describe("NoShowFeeChargedEmail", () => {
  it("names the charged amount in the subject", async () => {
    const calEvent = buildCalEvent({
      attendees: [attendee],
      title: "Intro call",
      paymentInfo: { amount: 2500, currency: "usd", link: null, id: null, paymentOption: null },
    });

    const payload = await getPayload(new NoShowFeeChargedEmail(calEvent, attendee));

    expect(payload.to).toBe("Anna Attendee <anna@example.com>");
    expect(payload.subject).toBe("You were charged 25 for Intro call");
    expect(payload.text).toContain("no_show_fee_charged_text_body");
  });

  it("throws when the booking has no payment information", async () => {
    const calEvent = buildCalEvent({ attendees: [attendee] });

    await expect(getPayload(new NoShowFeeChargedEmail(calEvent, attendee))).rejects.toThrow(
      "No payment into"
    );
  });
});
