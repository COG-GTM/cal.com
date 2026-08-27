import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientRequest: vi.fn(),
  clientSetApiKey: vi.fn(),
  mailSend: vi.fn(),
  mailSetApiKey: vi.fn(),
  setTestEmail: vi.fn(),
}));

vi.mock("@sendgrid/client", () => ({
  default: { request: mocks.clientRequest, setApiKey: mocks.clientSetApiKey },
}));
vi.mock("@sendgrid/mail", () => ({ default: { send: mocks.mailSend, setApiKey: mocks.mailSetApiKey } }));
vi.mock("@calcom/lib/testEmails", () => ({ setTestEmail: mocks.setTestEmail }));
vi.mock("@calcom/emails/templates/workflow-email", () => ({
  addHTMLStyles: (html?: string) => `styled:${html}`,
}));

async function loadProvider({ testMode = false }: { testMode?: boolean } = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_IS_E2E", testMode ? "1" : "");
  vi.stubEnv("INTEGRATION_TEST_MODE", "");
  return import("../sendgridProvider");
}

const mailData = { to: "attendee@example.com", subject: "Reminder", html: "<p>Reminder</p>" };

describe("sendgridProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("SENDGRID_API_KEY", "sendgrid-key");
    vi.stubEnv("SENDGRID_EMAIL", "notifications@example.com");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  describe("getBatchId", () => {
    it("requests a batch id from sendgrid", async () => {
      mocks.clientRequest.mockResolvedValue([{}, { batch_id: "batch-1" }]);
      const { getBatchId } = await loadProvider();

      await expect(getBatchId()).resolves.toBe("batch-1");
      expect(mocks.clientRequest).toHaveBeenCalledWith({ url: "/v3/mail/batch", method: "POST" });
      expect(mocks.clientSetApiKey).toHaveBeenCalledWith("sendgrid-key");
    });

    it("returns a generated id in test mode", async () => {
      const { getBatchId } = await loadProvider({ testMode: true });

      await expect(getBatchId()).resolves.toEqual(expect.any(String));
      expect(mocks.clientRequest).not.toHaveBeenCalled();
    });

    it("returns a dummy id when sendgrid is not configured", async () => {
      vi.stubEnv("SENDGRID_API_KEY", "");
      const { getBatchId } = await loadProvider();

      await expect(getBatchId()).resolves.toBe("DUMMY_BATCH_ID");
      expect(mocks.clientSetApiKey).not.toHaveBeenCalled();
    });
  });

  describe("sendSendgridMail", () => {
    it("sends the styled email from the configured address", async () => {
      const { sendSendgridMail } = await loadProvider();

      await sendSendgridMail({ ...mailData, batchId: "batch-1" });

      expect(mocks.mailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: mailData.to,
          from: { email: "notifications@example.com", name: "Cal.com" },
          html: "styled:<p>Reminder</p>",
          batchId: "batch-1",
          replyTo: "notifications@example.com",
        })
      );
    });

    it("uses the workflow sender and reply-to when given", async () => {
      const { sendSendgridMail } = await loadProvider();

      await sendSendgridMail({ ...mailData, sender: "Acme", replyTo: "team@acme.com" });

      expect(mocks.mailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: { email: "notifications@example.com", name: "Acme" },
          replyTo: "team@acme.com",
        })
      );
    });

    it("skips sending when sendgrid is not configured", async () => {
      vi.stubEnv("SENDGRID_API_KEY", "");
      const { sendSendgridMail } = await loadProvider();

      await sendSendgridMail(mailData);

      expect(mocks.mailSend).not.toHaveBeenCalled();
    });

    it("records the email instead of sending it in test mode", async () => {
      const { sendSendgridMail } = await loadProvider({ testMode: true });

      await expect(sendSendgridMail(mailData)).resolves.toBe("Skipped sendEmail for Unit Tests");
      expect(mocks.setTestEmail).toHaveBeenCalledWith({
        to: mailData.to,
        from: { email: "notifications@example.com", name: "Cal.com" },
        subject: mailData.subject,
        html: mailData.html,
      });
      expect(mocks.mailSend).not.toHaveBeenCalled();
    });

    it("does not record scheduled emails in test mode", async () => {
      const { sendSendgridMail } = await loadProvider({ testMode: true });

      await sendSendgridMail({ ...mailData, sendAt: 1_700_000_000 });

      expect(mocks.setTestEmail).not.toHaveBeenCalled();
    });

    it("falls back to empty fields in test mode", async () => {
      const { sendSendgridMail } = await loadProvider({ testMode: true });

      await sendSendgridMail({});

      expect(mocks.setTestEmail).toHaveBeenCalledWith({
        to: "",
        from: { email: "notifications@example.com", name: "Cal.com" },
        subject: "",
        html: "",
      });
    });
  });

  describe("scheduled send management", () => {
    it("cancels a scheduled batch", async () => {
      const { cancelScheduledEmail } = await loadProvider();

      await cancelScheduledEmail("batch-1");

      expect(mocks.clientRequest).toHaveBeenCalledWith({
        url: "/v3/user/scheduled_sends",
        method: "POST",
        body: { batch_id: "batch-1", status: "cancel" },
      });
    });

    it("deletes a scheduled batch", async () => {
      const { deleteScheduledSend } = await loadProvider();

      await deleteScheduledSend("batch-1");

      expect(mocks.clientRequest).toHaveBeenCalledWith({
        url: "/v3/user/scheduled_sends/batch-1",
        method: "DELETE",
      });
    });

    it("does nothing without a reference id", async () => {
      const { cancelScheduledEmail, deleteScheduledSend } = await loadProvider();

      await cancelScheduledEmail(null);
      await deleteScheduledSend(null);

      expect(mocks.clientRequest).not.toHaveBeenCalled();
    });
  });
});
