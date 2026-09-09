import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendChangeOfEmailVerificationLink,
  sendEmailVerificationCode,
  sendEmailVerificationLink,
  sendPasswordResetEmail,
} from "./auth-email-service";
import BaseEmail from "./templates/_base-email";
import AccountVerifyEmail from "./templates/account-verify-email";
import AttendeeVerifyEmail from "./templates/attendee-verify-email";
import ChangeOfEmailVerifyEmail from "./templates/change-account-email-verify";
import ForgotPasswordEmail from "./templates/forgot-password-email";
import { createTranslator } from "./test-utils/fixtures";

const sendEmail = vi.spyOn(BaseEmail.prototype, "sendEmail");
const t = createTranslator();

describe("auth-email-service", () => {
  beforeEach(() => {
    sendEmail.mockResolvedValue("sent");
  });

  afterEach(() => {
    sendEmail.mockClear();
  });

  const sent = () => sendEmail.mock.instances[0];

  it("sends the password reset email", async () => {
    await sendPasswordResetEmail({
      language: t,
      user: { name: "Anna", email: "anna@example.com" },
      resetLink: "https://cal.com/reset",
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sent()).toBeInstanceOf(ForgotPasswordEmail);
  });

  it("sends the account verification link", async () => {
    await sendEmailVerificationLink({
      language: t,
      user: { name: "Anna", email: "anna@example.com" },
      verificationEmailLink: "https://cal.com/verify",
    });

    expect(sent()).toBeInstanceOf(AccountVerifyEmail);
  });

  it("sends the attendee verification code", async () => {
    await sendEmailVerificationCode({
      language: t,
      user: { email: "anna@example.com" },
      verificationEmailCode: "123456",
    });

    expect(sent()).toBeInstanceOf(AttendeeVerifyEmail);
  });

  it("sends the change of email verification link", async () => {
    await sendChangeOfEmailVerificationLink({
      language: t,
      user: { name: "Anna", emailFrom: "old@example.com", emailTo: "new@example.com" },
      verificationEmailLink: "https://cal.com/verify-change",
    });

    expect(sent()).toBeInstanceOf(ChangeOfEmailVerifyEmail);
  });

  it("swallows a failure while preparing the email", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendEmail.mockRejectedValue(new Error("smtp down"));

    await expect(
      sendPasswordResetEmail({
        language: t,
        user: { name: "Anna", email: "anna@example.com" },
        resetLink: "https://cal.com/reset",
      })
    ).rejects.toThrow("smtp down");

    consoleError.mockRestore();
  });
});
