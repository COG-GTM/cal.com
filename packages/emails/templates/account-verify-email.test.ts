import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import type { EmailVerifyLink } from "./account-verify-email";
import AccountVerifyEmail from "./account-verify-email";

const buildInput = (overrides: Partial<EmailVerifyLink> = {}): EmailVerifyLink => ({
  language: createTranslator({
    verify_email_subject: "Verify your {{appName}} email",
    verify_email_email_header: "Verify your email address",
    hi_user_name: "Hi {{name}}",
  }),
  user: { name: "Anna", email: "anna@example.com" },
  verificationEmailLink: "https://cal.com/verify?token=abc",
  ...overrides,
});

describe("AccountVerifyEmail", () => {
  it("uses the verification subject and addresses the user by name", async () => {
    const payload = await getPayload(new AccountVerifyEmail(buildInput()));

    expect(payload.to).toBe("Anna <anna@example.com>");
    expect(payload.subject).toBe("Verify your Cal.com email");
    expect(payload.text).toContain("Hi Anna");
    expect(payload.text).toContain("https://cal.com/verify?token=abc");
  });

  it("uses the header copy as subject for secondary email verification", async () => {
    const payload = await getPayload(
      new AccountVerifyEmail(buildInput({ isSecondaryEmailVerification: true }))
    );

    expect(payload.subject).toBe("Verify your email address");
  });
});
