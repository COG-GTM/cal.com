import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import type { ProrationReminderEmailParams } from "./proration-reminder-email";
import ProrationReminderEmail from "./proration-reminder-email";

const t = createTranslator({
  proration_reminder_subject: "Upcoming charge for {{teamName}}",
  proration_reminder_text: "You will be charged ${{amount}} for {{teamName}}",
});

const buildParams = (
  overrides: Partial<ProrationReminderEmailParams> = {}
): ProrationReminderEmailParams => ({
  user: { name: "Anna", email: "anna@example.com", t },
  team: { id: 1, name: "Acme" },
  proration: { monthKey: "2024-06", netSeatIncrease: 2, proratedAmount: 1250 },
  ...overrides,
});

describe("ProrationReminderEmail", () => {
  it("reminds the billing contact of the upcoming charge", async () => {
    const payload = await getPayload(new ProrationReminderEmail(buildParams()));

    expect(payload.to).toBe("anna@example.com");
    expect(payload.subject).toBe("Upcoming charge for Acme");
    expect(payload.text).toBe("You will be charged $12.50 for Acme");
  });

  it("includes the invoice link when present", async () => {
    const payload = await getPayload(
      new ProrationReminderEmail(buildParams({ invoiceUrl: "https://invoice.stripe.com/i/2" }))
    );

    expect(String(payload.html)).toContain("https://invoice.stripe.com/i/2");
  });
});
