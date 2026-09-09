import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import AdminOrganizationNotification from "./admin-organization-notification";

describe("AdminOrganizationNotification", () => {
  it("notifies every instance admin about the new organization", async () => {
    const email = new AdminOrganizationNotification({
      t: createTranslator({
        admin_org_notification_email_subject: "New organization created",
        hi_admin: "Hi admin",
        admin_org_notification_email_title: "An Organization Was Created",
      }),
      instanceAdmins: [{ email: "admin1@example.com" }, { email: "admin2@example.com" }],
      ownerEmail: "owner@acme.com",
      orgSlug: "acme",
      webappIPAddress: "10.0.0.1",
    });

    const payload = await getPayload(email);

    expect(payload.to).toBe("admin1@example.com,admin2@example.com");
    expect(payload.subject).toBe("New organization created");
    expect(payload.text).toContain("Hi admin, an organization was created");
    expect(String(payload.html)).toContain("acme");
    expect(String(payload.html)).toContain("10.0.0.1");
  });
});
