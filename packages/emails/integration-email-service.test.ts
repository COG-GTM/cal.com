import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendBrokenIntegrationEmail,
  sendDelegationCredentialDisabledEmail,
  sendDisabledAppEmail,
  sendSlugReplacementEmail,
} from "./integration-email-service";
import BaseEmail from "./templates/_base-email";
import BrokenIntegrationEmail from "./templates/broken-integration-email";
import DelegationCredentialDisabledEmail from "./templates/delegation-credential-disabled-email";
import DisabledAppEmail from "./templates/disabled-app-email";
import SlugReplacementEmail from "./templates/slug-replacement-email";
import { buildCalEvent, createTranslator } from "./test-utils/fixtures";

const sendEmail = vi.spyOn(BaseEmail.prototype, "sendEmail");
const t = createTranslator();

describe("integration-email-service", () => {
  beforeEach(() => {
    sendEmail.mockResolvedValue("sent");
  });

  afterEach(() => {
    sendEmail.mockClear();
  });

  it("tells the organizer that the video integration broke", async () => {
    await sendBrokenIntegrationEmail(buildCalEvent(), "video");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.instances[0]).toBeInstanceOf(BrokenIntegrationEmail);
  });

  it("tells the user an app was disabled", async () => {
    await sendDisabledAppEmail({
      email: "anna@example.com",
      appName: "Zoom",
      appType: ["conferencing"],
      t,
      title: "30min",
      eventTypeId: 7,
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(DisabledAppEmail);
  });

  it("tells the user their slug was replaced", async () => {
    await sendSlugReplacementEmail({
      email: "anna@example.com",
      name: "Anna",
      teamName: "Acme",
      t,
      slug: "30min",
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(SlugReplacementEmail);
  });

  it("tells the admin delegation credentials were disabled", async () => {
    await sendDelegationCredentialDisabledEmail({
      recipientEmail: "admin@acme.com",
      recipientName: "Admin",
      calendarAppName: "Google Calendar",
      conferencingAppName: "Google Meet",
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(DelegationCredentialDisabledEmail);
  });
});
