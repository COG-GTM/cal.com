import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import OrgAutoJoinEmail from "./org-auto-join-invite";

describe("OrgAutoJoinEmail", () => {
  it("builds an invite subject naming the inviter, org and entity type", async () => {
    const email = new OrgAutoJoinEmail({
      language: createTranslator({
        user_invited_you: "{{user}} invited you to {{team}} on {{appName}} ({{entity}})",
        organization: "Organization",
      }),
      from: "Oliver",
      to: "anna@example.com",
      orgName: "Acme",
      joinLink: "https://acme.cal.com/auth/join",
    });

    const payload = await getPayload(email);

    expect(payload.to).toBe("anna@example.com");
    expect(payload.subject).toBe("Oliver invited you to Acme on Cal.com (organization)");
    expect(String(payload.html)).toContain("https://acme.cal.com/auth/join");
    expect(payload.text).toBe("");
  });
});
