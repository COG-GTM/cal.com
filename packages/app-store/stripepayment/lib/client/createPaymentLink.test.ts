import { WEBSITE_URL } from "@calcom/lib/constants";
import { describe, expect, it } from "vitest";
import { createPaymentLink } from "./createPaymentLink";

describe("createPaymentLink", () => {
  it("creates an absolute link with encoded payment details", () => {
    const link = createPaymentLink({
      paymentUid: "payment_123",
      date: "2025-01-01",
      name: "A Test User",
      email: "a+b@example.com",
    });

    expect(link.startsWith(`${WEBSITE_URL}/payment/payment_123?`)).toBe(true);
    expect(link).toContain("date=2025-01-01");
    expect(link).toContain("name=A%20Test%20User");
    expect(link).toContain("email=a%2Bb%40example.com");
  });

  it("creates a relative link and omits nullish details", () => {
    const link = createPaymentLink({ paymentUid: "payment_123", absolute: false, name: null });

    expect(link).toBe("/payment/payment_123?date=&name=&email=");
  });
});
