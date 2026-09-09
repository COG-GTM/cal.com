import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizationEmailVerification from "./organization-email-verification";

describe("OrganizationEmailVerification", () => {
  it("emails the verification code to the organization owner", async () => {
    const email = new OrganizationEmailVerification({
      language: createTranslator({ verify_email_organization: "Verify your organization email" }),
      user: { email: "owner@acme.com" },
      code: "998877",
    });

    const payload = await getPayload(email);

    expect(payload.to).toBe("owner@acme.com");
    expect(payload.subject).toBe("Verify your organization email");
    expect(payload.text).toBe("<b>Code:</b> 998877");
    expect(String(payload.html)).toContain("998877");
  });
});
