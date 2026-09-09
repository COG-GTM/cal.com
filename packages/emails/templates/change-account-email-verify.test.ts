import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import ChangeOfEmailVerifyEmail from "./change-account-email-verify";

describe("ChangeOfEmailVerifyEmail", () => {
  it("sends to the new address and names both addresses in the body", async () => {
    const email = new ChangeOfEmailVerifyEmail({
      language: createTranslator({
        change_of_email: "Confirm your new {{appName}} email",
        old_email_address: "Old email address",
        new_email_address: "New email address",
      }),
      user: { name: "Anna", emailFrom: "old@example.com", emailTo: "new@example.com" },
      verificationEmailLink: "https://cal.com/verify?token=xyz",
    });

    const payload = await getPayload(email);

    expect(payload.to).toBe("Anna <new@example.com>");
    expect(payload.subject).toBe("Confirm your new Cal.com email");
    expect(payload.text).toContain("old@example.com");
    expect(payload.text).toContain("new@example.com");
    expect(payload.text).toContain("https://cal.com/verify?token=xyz");
  });
});
