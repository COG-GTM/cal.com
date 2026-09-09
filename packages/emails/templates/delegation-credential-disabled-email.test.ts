import { describe, expect, it } from "vitest";
import { getPayload } from "../test-utils/fixtures";
import DelegationCredentialDisabledEmail from "./delegation-credential-disabled-email";

describe("DelegationCredentialDisabledEmail", () => {
  it("greets the recipient by name and names both apps", async () => {
    const email = new DelegationCredentialDisabledEmail({
      recipientEmail: "anna@example.com",
      recipientName: "Anna",
      calendarAppName: "Google Calendar",
      conferencingAppName: "Google Meet",
    });

    const payload = await getPayload(email);

    expect(payload.to).toBe("anna@example.com");
    expect(payload.subject).toBe("You might need to connect your Google Calendar");
    expect(String(payload.html)).toContain("Hi Anna,");
    expect(String(payload.html)).toContain("/settings/my-account/conferencing");
    expect(payload.text).toContain("Google Meet");
  });

  it("falls back to a generic greeting when no name is known", async () => {
    const email = new DelegationCredentialDisabledEmail({
      recipientEmail: "anna@example.com",
      calendarAppName: "Google Calendar",
      conferencingAppName: "Google Meet",
    });

    const payload = await getPayload(email);

    expect(String(payload.html)).toContain("Hello,");
  });
});
