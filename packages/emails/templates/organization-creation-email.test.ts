import { describe, expect, it } from "vitest";
import type { OrganizationCreation } from "../lib/types/email-types";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizationCreationEmail from "./organization-creation-email";

const buildInput = (overrides: Partial<OrganizationCreation> = {}): OrganizationCreation => ({
  language: createTranslator({ "email_organization_created|subject": "Your organization is ready" }),
  from: "Cal.com",
  to: "owner@acme.com",
  ownerNewUsername: "owner",
  ownerOldUsername: "owner-old",
  orgDomain: "acme.cal.com",
  orgName: "Acme",
  prevLink: "https://cal.com/owner-old",
  newLink: "https://acme.cal.com/owner",
  ...overrides,
});

describe("OrganizationCreationEmail", () => {
  it("emails the owner with the org creation subject", async () => {
    const payload = await getPayload(new OrganizationCreationEmail(buildInput()));

    expect(payload.to).toBe("owner@acme.com");
    expect(payload.subject).toBe("Your organization is ready");
    expect(String(payload.html)).toContain("You have created Acme organization.");
    expect(payload.text).toBe("");
  });

  it("links to the new organization profile for a brand new owner", async () => {
    const payload = await getPayload(new OrganizationCreationEmail(buildInput({ ownerOldUsername: null })));

    expect(String(payload.html)).toContain("https://acme.cal.com/owner");
    expect(String(payload.html)).toContain("acme.cal.com/owner<");
  });
});
