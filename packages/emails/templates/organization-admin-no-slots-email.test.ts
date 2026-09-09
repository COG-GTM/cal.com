import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizationAdminNoSlotsEmail from "./organization-admin-no-slots-email";

describe("OrganizationAdminNoSlotsEmail", () => {
  it("tells the org admin which member has no availability", async () => {
    const email = new OrganizationAdminNoSlotsEmail({
      language: createTranslator({ "org_admin_no_slots|heading": "{{name}} has no availability" }),
      to: { email: "admin@acme.com" },
      user: "oliver",
      slug: "30min",
      startTime: "2024-06-01",
      endTime: "2024-06-07",
      teamSlug: "acme",
      editLink: "https://cal.com/event-types/1",
    });

    const payload = await getPayload(email);

    expect(payload.to).toBe("admin@acme.com");
    expect(payload.subject).toBe("oliver has no availability");
    expect(payload.text).toContain("oliver/30min");
    expect(String(payload.html)).toContain("https://cal.com/event-types/1");
  });
});
