import { describe, expect, it } from "vitest";
import type { EmailVerifyCode } from "../lib/types/email-types";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeVerifyEmail from "./attendee-verify-email";

const language = createTranslator({
  verify_email_subject: "Verify your email for {{appName}}",
  verify_email_subject_verifying_email: "Confirm your email",
  verify_email_subject_no_branding: "Verify your email",
  happy_scheduling: "Happy scheduling,",
  the_calcom_team: "The {{companyName}} team",
});

const buildInput = (overrides: Partial<EmailVerifyCode> = {}): EmailVerifyCode => ({
  language,
  user: { name: "Anna", email: "anna@example.com" },
  verificationEmailCode: "123456",
  ...overrides,
});

describe("AttendeeVerifyEmail", () => {
  it("includes the verification code and branded footer by default", async () => {
    const payload = await getPayload(new AttendeeVerifyEmail(buildInput()));

    expect(payload.subject).toBe("Verify your email for Cal.com");
    expect(payload.text).toContain("123456");
    expect(payload.text).toContain("Happy scheduling,");
  });

  it("uses the unbranded subject and drops the footer when the logo is hidden", async () => {
    const payload = await getPayload(new AttendeeVerifyEmail(buildInput({ hideLogo: true })));

    expect(payload.subject).toBe("Verify your email");
    expect(payload.text).not.toContain("Happy scheduling,");
  });

  it("uses the email-change subject when verifying an email", async () => {
    const payload = await getPayload(new AttendeeVerifyEmail(buildInput({ isVerifyingEmail: true })));

    expect(payload.subject).toBe("Confirm your email");
  });
});
