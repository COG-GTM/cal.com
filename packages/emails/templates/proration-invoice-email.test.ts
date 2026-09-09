import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import type { ProrationInvoiceEmailParams } from "./proration-invoice-email";
import ProrationInvoiceEmail from "./proration-invoice-email";

const t = createTranslator({
  proration_invoice_subject: "Invoice for {{teamName}}: ${{amount}}",
  proration_invoice_text: "${{amount}} for {{seats}} seats on {{teamName}}",
});

const buildParams = (overrides: Partial<ProrationInvoiceEmailParams> = {}): ProrationInvoiceEmailParams => ({
  user: { name: "Anna", email: "anna@example.com", t },
  team: { id: 1, name: "Acme" },
  proration: { monthKey: "2024-06", netSeatIncrease: 3, proratedAmount: 4599 },
  isAutoCharge: false,
  ...overrides,
});

describe("ProrationInvoiceEmail", () => {
  it("formats the prorated amount in the subject and body", async () => {
    const payload = await getPayload(new ProrationInvoiceEmail(buildParams()));

    expect(payload.to).toBe("anna@example.com");
    expect(payload.subject).toBe("Invoice for Acme: $45.99");
    expect(payload.text).toBe("$45.99 for 3 seats on Acme");
  });

  it("offers a pay-invoice link when the charge is not automatic", async () => {
    const payload = await getPayload(
      new ProrationInvoiceEmail(buildParams({ invoiceUrl: "https://invoice.stripe.com/i/1" }))
    );

    expect(String(payload.html)).toContain("https://invoice.stripe.com/i/1");
  });

  it("hides the pay-invoice link when the team is charged automatically", async () => {
    const payload = await getPayload(
      new ProrationInvoiceEmail(
        buildParams({ invoiceUrl: "https://invoice.stripe.com/i/1", isAutoCharge: true })
      )
    );

    expect(String(payload.html)).not.toContain("https://invoice.stripe.com/i/1");
    expect(String(payload.html)).toContain("/settings/teams/1/billing");
  });

  it("defaults empty user and team names", async () => {
    const payload = await getPayload(
      new ProrationInvoiceEmail(
        buildParams({ user: { name: null, email: "anna@example.com", t }, team: { id: 1, name: null } })
      )
    );

    expect(payload.subject).toBe("Invoice for : $45.99");
  });
});
