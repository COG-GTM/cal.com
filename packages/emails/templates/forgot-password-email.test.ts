import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import ForgotPasswordEmail from "./forgot-password-email";

describe("ForgotPasswordEmail", () => {
  it("sends the reset link to the requesting user", async () => {
    const email = new ForgotPasswordEmail({
      language: createTranslator({
        reset_password_subject: "Reset your {{appName}} password",
        change_password: "Change password",
      }),
      user: { name: "Anna", email: "anna@example.com" },
      resetLink: "https://cal.com/auth/forgot-password/abc",
    });

    const payload = await getPayload(email);

    expect(payload.to).toBe("Anna <anna@example.com>");
    expect(payload.subject).toBe("Reset your Cal.com password");
    expect(payload.text).toContain("Change password: https://cal.com/auth/forgot-password/abc");
  });
});
