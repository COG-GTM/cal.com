import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sgClient, sgMailMock, addHTMLStyles, setTestEmail, uuid } = vi.hoisted(() => ({
  sgClient: { setApiKey: vi.fn(), request: vi.fn() },
  sgMailMock: { setApiKey: vi.fn(), send: vi.fn() },
  addHTMLStyles: vi.fn((html?: string) => `styled:${html ?? ""}`),
  setTestEmail: vi.fn(),
  uuid: vi.fn(() => "generated-uuid"),
}));

vi.mock("@sendgrid/client", () => ({ default: sgClient }));
vi.mock("@sendgrid/mail", () => ({ default: sgMailMock }));
vi.mock("uuid", () => ({ v4: uuid }));
vi.mock("@calcom/emails/templates/workflow-email", () => ({ addHTMLStyles }));
vi.mock("@calcom/lib/testEmails", () => ({ setTestEmail }));
vi.mock("@calcom/lib/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@calcom/lib/constants")>()),
  SENDER_NAME: "Cal.com",
}));

type SendgridProvider = typeof import("./sendgridProvider");

/**
 * `testMode` and the credentials are read when the module is first evaluated, so every scenario needs a
 * fresh module instance with the env already in place.
 */
const loadProvider = async (env: Record<string, string | undefined>): Promise<SendgridProvider> => {
  vi.resetModules();
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_IS_E2E: undefined,
    INTEGRATION_TEST_MODE: undefined,
    SENDGRID_API_KEY: undefined,
    SENDGRID_EMAIL: undefined,
    ...env,
  })) {
    vi.stubEnv(key, value);
  }
  return await import("./sendgridProvider");
};

const withCredentials = {
  SENDGRID_API_KEY: "sg-key",
  SENDGRID_EMAIL: "sender@example.com",
};

describe("sendgridProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getBatchId", () => {
    it("returns a random uuid in test mode without calling sendgrid", async () => {
      const { getBatchId } = await loadProvider({ INTEGRATION_TEST_MODE: "true", ...withCredentials });

      expect(await getBatchId()).toBe("generated-uuid");
      expect(sgClient.request).not.toHaveBeenCalled();
      expect(sgClient.setApiKey).not.toHaveBeenCalled();
    });

    it("treats NEXT_PUBLIC_IS_E2E as test mode too", async () => {
      const { getBatchId } = await loadProvider({ NEXT_PUBLIC_IS_E2E: "1" });

      expect(await getBatchId()).toBe("generated-uuid");
      expect(sgClient.request).not.toHaveBeenCalled();
    });

    it("requests a batch id from sendgrid when credentials are configured", async () => {
      sgClient.request.mockResolvedValue([{ statusCode: 201 }, { batch_id: "batch-1" }]);
      const { getBatchId } = await loadProvider(withCredentials);

      expect(await getBatchId()).toBe("batch-1");
      expect(sgMailMock.setApiKey).toHaveBeenCalledWith("sg-key");
      expect(sgClient.setApiKey).toHaveBeenCalledWith("sg-key");
      expect(sgClient.request).toHaveBeenCalledWith({ url: "/v3/mail/batch", method: "POST" });
    });

    it("returns a dummy batch id and logs when the api key is missing", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const { getBatchId } = await loadProvider({ SENDGRID_EMAIL: "sender@example.com" });

      expect(await getBatchId()).toBe("DUMMY_BATCH_ID");
      expect(sgClient.request).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith("Sendgrid credentials are missing from the .env file");
      expect(infoSpy).toHaveBeenCalledWith("No sendgrid API key provided, returning DUMMY_BATCH_ID");
    });

    it("propagates sendgrid failures", async () => {
      sgClient.request.mockRejectedValue(new Error("sendgrid unavailable"));
      const { getBatchId } = await loadProvider(withCredentials);

      await expect(getBatchId()).rejects.toThrow("sendgrid unavailable");
    });
  });

  describe("sendSendgridMail", () => {
    it("records the email locally in test mode instead of sending it", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const { sendSendgridMail } = await loadProvider({
        INTEGRATION_TEST_MODE: "true",
        ...withCredentials,
      });

      await expect(
        sendSendgridMail({
          to: "attendee@example.com",
          subject: "Reminder",
          html: "<p>body</p>",
          sender: "Cal Team",
        })
      ).resolves.toBe("Skipped sendEmail for Unit Tests");
      expect(setTestEmail).toHaveBeenCalledWith({
        to: "attendee@example.com",
        from: { email: "sender@example.com", name: "Cal Team" },
        subject: "Reminder",
        html: "<p>body</p>",
      });
      expect(sgMailMock.send).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();
    });

    it("falls back to empty strings for missing fields in test mode", async () => {
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      const { sendSendgridMail } = await loadProvider({
        INTEGRATION_TEST_MODE: "true",
        ...withCredentials,
      });

      await sendSendgridMail({});

      expect(setTestEmail).toHaveBeenCalledWith({
        to: "",
        from: { email: "sender@example.com", name: "Cal.com" },
        subject: "",
        html: "",
      });
    });

    it("does not record scheduled emails in test mode", async () => {
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      const { sendSendgridMail } = await loadProvider({
        INTEGRATION_TEST_MODE: "true",
        ...withCredentials,
      });

      await sendSendgridMail({ to: "attendee@example.com", sendAt: 1700000000 });

      expect(setTestEmail).not.toHaveBeenCalled();
    });

    it("skips sending when no api key is configured", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const { sendSendgridMail } = await loadProvider({ SENDGRID_EMAIL: "sender@example.com" });

      await expect(sendSendgridMail({ to: "attendee@example.com" })).resolves.toBeUndefined();
      expect(sgMailMock.send).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith("No sendgrid API key provided, skipping email");
    });

    it("sends the styled email through sendgrid", async () => {
      sgMailMock.send.mockResolvedValue([{ statusCode: 202 }]);
      const { sendSendgridMail } = await loadProvider(withCredentials);
      const attachments = [{ content: "Zm9v", filename: "invite.ics" }];

      await sendSendgridMail({
        to: "attendee@example.com",
        subject: "Reminder",
        html: "<p>body</p>",
        batchId: "batch-1",
        replyTo: "reply@example.com",
        attachments,
        sendAt: 1700000000,
      });

      expect(addHTMLStyles).toHaveBeenCalledWith("<p>body</p>");
      expect(sgMailMock.send).toHaveBeenCalledWith({
        to: "attendee@example.com",
        from: { email: "sender@example.com", name: "Cal.com" },
        subject: "Reminder",
        html: "styled:<p>body</p>",
        batchId: "batch-1",
        replyTo: "reply@example.com",
        attachments,
        sendAt: 1700000000,
      });
      expect(setTestEmail).not.toHaveBeenCalled();
    });

    it("defaults the reply-to address to the sendgrid sender", async () => {
      sgMailMock.send.mockResolvedValue([{ statusCode: 202 }]);
      const { sendSendgridMail } = await loadProvider(withCredentials);

      await sendSendgridMail({ to: "attendee@example.com", sender: null });

      expect(sgMailMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: "sender@example.com",
          from: { email: "sender@example.com", name: "Cal.com" },
        })
      );
    });
  });

  describe("cancelScheduledEmail", () => {
    it("resolves without a request when no referenceId is given", async () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const { cancelScheduledEmail } = await loadProvider(withCredentials);

      await expect(cancelScheduledEmail(null)).resolves.toBeUndefined();
      expect(sgClient.request).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith("No referenceId provided, skip canceling email");
    });

    it("asks sendgrid to cancel the scheduled send", async () => {
      sgClient.request.mockResolvedValue([{ statusCode: 201 }, {}]);
      const { cancelScheduledEmail } = await loadProvider(withCredentials);

      await cancelScheduledEmail("batch-1");

      expect(sgClient.setApiKey).toHaveBeenCalledWith("sg-key");
      expect(sgClient.request).toHaveBeenCalledWith({
        url: "/v3/user/scheduled_sends",
        method: "POST",
        body: { batch_id: "batch-1", status: "cancel" },
      });
    });
  });

  describe("deleteScheduledSend", () => {
    it("resolves without a request when no referenceId is given", async () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const { deleteScheduledSend } = await loadProvider(withCredentials);

      await expect(deleteScheduledSend(null)).resolves.toBeUndefined();
      expect(sgClient.request).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith("No referenceId provided, skip deleting scheduledSend");
    });

    it("deletes the scheduled send by referenceId", async () => {
      sgClient.request.mockResolvedValue([{ statusCode: 204 }, {}]);
      const { deleteScheduledSend } = await loadProvider(withCredentials);

      await deleteScheduledSend("batch-1");

      expect(sgClient.request).toHaveBeenCalledWith({
        url: "/v3/user/scheduled_sends/batch-1",
        method: "DELETE",
      });
    });

    it("logs missing credentials before deleting", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      sgClient.request.mockResolvedValue([{ statusCode: 204 }, {}]);
      const { deleteScheduledSend } = await loadProvider({});

      await deleteScheduledSend("batch-1");

      expect(errorSpy).toHaveBeenCalledWith("Sendgrid credentials are missing from the .env file");
      expect(sgClient.setApiKey).not.toHaveBeenCalled();
      expect(sgClient.request).toHaveBeenCalled();
    });
  });
});
