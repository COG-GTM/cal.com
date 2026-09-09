import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendAdminOAuthClientNotification,
  sendOAuthClientApprovedNotification,
  sendOAuthClientRejectedNotification,
} from "./oauth-email-service";
import BaseEmail from "./templates/_base-email";
import AdminOAuthClientNotification from "./templates/admin-oauth-client-notification";
import OAuthClientApprovedEmail from "./templates/oauth-client-approved-notification";
import OAuthClientRejectedEmail from "./templates/oauth-client-rejected-notification";
import { createTranslator } from "./test-utils/fixtures";

const sendEmail = vi.spyOn(BaseEmail.prototype, "sendEmail");
const t = createTranslator();

const notification = {
  t,
  clientName: "Acme App",
  purpose: "Scheduling integration",
  clientId: "client-1",
  redirectUri: "https://acme.com/callback",
  submitterEmail: "owner@acme.com",
  submitterName: "Owner",
};

describe("oauth-email-service", () => {
  beforeEach(() => {
    sendEmail.mockResolvedValue("sent");
  });

  afterEach(() => {
    sendEmail.mockClear();
  });

  it("notifies the admin of a new oauth client request", async () => {
    await sendAdminOAuthClientNotification(notification);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.instances[0]).toBeInstanceOf(AdminOAuthClientNotification);
  });

  it("notifies the owner that the client was approved", async () => {
    await sendOAuthClientApprovedNotification({
      t,
      userEmail: "owner@acme.com",
      userName: "Owner",
      clientName: "Acme App",
      clientId: "client-1",
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(OAuthClientApprovedEmail);
  });

  it("notifies the owner that the client was rejected", async () => {
    await sendOAuthClientRejectedNotification({
      t,
      userEmail: "owner@acme.com",
      userName: null,
      clientName: "Acme App",
      clientId: "client-1",
      rejectionReason: "Incomplete application",
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(OAuthClientRejectedEmail);
  });

  it("logs and rethrows when sending fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendEmail.mockRejectedValue(new Error("smtp down"));

    await expect(sendAdminOAuthClientNotification(notification)).rejects.toThrow("smtp down");
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
