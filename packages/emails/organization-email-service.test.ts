import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendAdminOrganizationNotification,
  sendOrganizationAdminNoSlotsNotification,
  sendOrganizationCreationEmail,
  sendOrganizationEmailVerification,
  sendTeamInviteEmail,
} from "./organization-email-service";
import BaseEmail from "./templates/_base-email";
import AdminOrganizationNotification from "./templates/admin-organization-notification";
import OrganizationAdminNoSlotsEmail from "./templates/organization-admin-no-slots-email";
import OrganizationCreationEmail from "./templates/organization-creation-email";
import OrganizationEmailVerification from "./templates/organization-email-verification";
import TeamInviteEmail from "./templates/team-invite-email";
import { createTranslator } from "./test-utils/fixtures";

const sendEmail = vi.spyOn(BaseEmail.prototype, "sendEmail");
const language = createTranslator();

describe("organization-email-service", () => {
  beforeEach(() => {
    sendEmail.mockResolvedValue("sent");
  });

  afterEach(() => {
    sendEmail.mockClear();
  });

  it("sends a team invite", async () => {
    await sendTeamInviteEmail({
      language,
      from: "Oliver",
      to: "anna@example.com",
      teamName: "Acme",
      joinLink: "https://cal.com/join",
      isCalcomMember: true,
      isOrg: false,
      parentTeamName: undefined,
      isAutoJoin: false,
      isExistingUserMovedToOrg: false,
      prevLink: null,
      newLink: null,
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(TeamInviteEmail);
  });

  it("sends the organization creation email", async () => {
    await sendOrganizationCreationEmail({
      language,
      from: "Cal.com",
      to: "owner@acme.com",
      ownerNewUsername: "owner",
      ownerOldUsername: null,
      orgDomain: "acme.cal.com",
      orgName: "Acme",
      prevLink: null,
      newLink: "https://acme.cal.com/owner",
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(OrganizationCreationEmail);
  });

  it("warns the org admin about a member with no slots", async () => {
    await sendOrganizationAdminNoSlotsNotification({
      language,
      to: { email: "admin@acme.com" },
      user: "Anna",
      slug: "anna",
      teamSlug: "acme",
      startTime: "2024-06-01",
      endTime: "2024-06-30",
      editLink: "https://cal.com/availability",
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(OrganizationAdminNoSlotsEmail);
  });

  it("sends the organization email verification", async () => {
    await sendOrganizationEmailVerification({
      language,
      user: { email: "owner@acme.com" },
      code: "123456",
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(OrganizationEmailVerification);
  });

  it("notifies cal.com admins about a new organization", async () => {
    await sendAdminOrganizationNotification({
      t: language,
      orgSlug: "acme",
      ownerEmail: "owner@acme.com",
      webappIPAddress: "127.0.0.1",
      instanceAdmins: [{ email: "admin@cal.com" }],
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(AdminOrganizationNotification);
  });
});
