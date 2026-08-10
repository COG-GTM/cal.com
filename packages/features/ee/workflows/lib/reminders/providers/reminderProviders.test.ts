import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  taskerCreate: vi.fn(),
  sendEmail: vi.fn(),
  sendgridRequest: vi.fn(),
  sendgridSetApiKey: vi.fn(),
  sgMailSend: vi.fn(),
  twilioCreate: vi.fn(),
  twilioMessagesCreate: vi.fn(),
  twilioMessageFetch: vi.fn(),
  twilioMessageUpdate: vi.fn(),
  verificationCreate: vi.fn(),
  verificationCheck: vi.fn(),
  lookupFetch: vi.fn(),
  setTestEmail: vi.fn(),
  setTestSMS: vi.fn(),
  prismaTeam: vi.fn(),
  prismaMemberships: vi.fn(),
  prismaUser: vi.fn(),
  logger: vi.fn(),
  validateRequest: vi.fn(() => true),
}));

const twilioClient = {
  messages: Object.assign(
    (referenceId: string) => ({
      fetch: () => mocks.twilioMessageFetch(referenceId),
      update: (data: unknown) => mocks.twilioMessageUpdate(referenceId, data),
    }),
    { create: mocks.twilioMessagesCreate }
  ),
  verify: {
    services: () => ({
      verifications: { create: mocks.verificationCreate },
    }),
    v2: {
      services: () => ({
        verificationChecks: { create: mocks.verificationCheck },
      }),
    },
  },
  lookups: { v2: { phoneNumbers: () => ({ fetch: mocks.lookupFetch }) } },
};

vi.mock("@calcom/features/tasker", () => ({ default: { create: mocks.taskerCreate } }));
vi.mock("@calcom/emails/workflow-email-service", () => ({ sendCustomWorkflowEmail: mocks.sendEmail }));
vi.mock("@calcom/emails/templates/workflow-email", () => ({
  addHTMLStyles: (html: string) => `styled:${html}`,
}));
vi.mock("@calcom/lib/testEmails", () => ({ setTestEmail: mocks.setTestEmail }));
vi.mock("@calcom/lib/testSMS", () => ({ setTestSMS: mocks.setTestSMS }));
vi.mock("@calcom/lib/smsLockState", () => ({ checkSMSRateLimit: vi.fn() }));
vi.mock("@calcom/lib/logger", () => ({
  default: { getSubLogger: () => ({ silly: mocks.logger, debug: mocks.logger, error: mocks.logger }) },
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    team: { findUnique: mocks.prismaTeam },
    membership: { findMany: mocks.prismaMemberships },
    user: { findUnique: mocks.prismaUser },
  },
}));
vi.mock("twilio", () => ({
  default: Object.assign(
    vi.fn(() => twilioClient),
    {
      validateRequest: mocks.validateRequest,
    }
  ),
}));
vi.mock("@sendgrid/client", () => ({
  default: { request: mocks.sendgridRequest, setApiKey: mocks.sendgridSetApiKey },
}));
vi.mock("@sendgrid/mail", () => ({
  default: { send: mocks.sgMailSend, setApiKey: mocks.sendgridSetApiKey },
}));

import { sendOrScheduleWorkflowEmails } from "./emailProvider";
import {
  cancelSMS,
  deleteMultipleScheduledSMS,
  determineOptOutType,
  getCountryCodeForNumber,
  getMessageBody,
  getMessageInfo,
  scheduleSMS,
  sendSMS,
  sendVerificationCode,
  validateWebhookRequest,
  verifyNumber,
} from "./twilioProvider";

async function loadSendgridProvider() {
  vi.resetModules();
  return import("./sendgridProvider");
}

async function loadTwilioProvider() {
  vi.resetModules();
  return import("./twilioProvider");
}

describe("reminder providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.prismaTeam.mockResolvedValue(null);
    mocks.prismaMemberships.mockResolvedValue([]);
    mocks.prismaUser.mockResolvedValue(null);
    mocks.twilioMessagesCreate.mockResolvedValue({ sid: "SM123" });
    mocks.twilioMessageFetch.mockResolvedValue({ body: "message", price: "-0.02", numSegments: "2" });
    mocks.sendgridRequest.mockResolvedValue([{}, { batch_id: "batch-1" }]);
  });

  it("sends email immediately and schedules future email through tasker", async () => {
    await sendOrScheduleWorkflowEmails({
      to: ["one@example.com"],
      subject: "Subject",
      html: "<p>Body</p>",
    });
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "one@example.com" }));

    const sendAt = new Date(Date.now() + 60_000);
    await sendOrScheduleWorkflowEmails({
      to: ["one@example.com"],
      subject: "Subject",
      html: "<p>Body</p>",
      sendAt,
      referenceUid: "ref-1",
    });
    expect(mocks.taskerCreate).toHaveBeenCalledWith(
      "sendWorkflowEmails",
      expect.objectContaining({ to: ["one@example.com"] }),
      { scheduledAt: sendAt, referenceUid: "ref-1" }
    );
  });

  it("uses the configured SendGrid API for batch and scheduled mail operations", async () => {
    vi.stubEnv("INTEGRATION_TEST_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_IS_E2E", "");
    vi.stubEnv("SENDGRID_API_KEY", "key");
    vi.stubEnv("SENDGRID_EMAIL", "sender@example.com");
    const { cancelScheduledEmail, deleteScheduledSend, getBatchId, sendSendgridMail } =
      await loadSendgridProvider();

    await expect(getBatchId()).resolves.toBe("batch-1");
    await sendSendgridMail({ to: "one@example.com", subject: "Subject", html: "<p>Body</p>" });
    await cancelScheduledEmail("batch-1");
    await deleteScheduledSend("batch-1");

    expect(mocks.sgMailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "one@example.com",
        from: { email: "sender@example.com", name: "Cal.com" },
        html: "styled:<p>Body</p>",
      })
    );
    expect(mocks.sendgridRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/v3/user/scheduled_sends", method: "POST" })
    );
    expect(mocks.sendgridRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/v3/user/scheduled_sends/batch-1", method: "DELETE" })
    );
  });

  it("returns fallback SendGrid values and ignores empty cancellation references", async () => {
    vi.stubEnv("INTEGRATION_TEST_MODE", "true");
    const { cancelScheduledEmail, deleteScheduledSend, getBatchId, sendSendgridMail } =
      await loadSendgridProvider();

    await expect(getBatchId()).resolves.toMatch(/^[0-9a-f-]{36}$/);
    await expect(cancelScheduledEmail(null)).resolves.toBeUndefined();
    await expect(deleteScheduledSend(null)).resolves.toBeUndefined();
    await expect(sendSendgridMail({ to: "one@example.com" })).resolves.toBe(
      "Skipped sendEmail for Unit Tests"
    );
  });

  it("sends and schedules SMS payloads with Twilio", async () => {
    vi.stubEnv("TWILIO_SID", "sid");
    vi.stubEnv("TWILIO_TOKEN", "token");
    vi.stubEnv("TWILIO_MESSAGING_SID", "messaging");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15550000000");
    vi.stubEnv("TWILIO_WHATSAPP_PHONE_NUMBER", "15551111111");
    const scheduledDate = new Date(Date.now() + 60_000);

    await sendSMS({
      phoneNumber: "+15552222222",
      body: "hello",
      sender: "",
      bookingUid: "booking-1",
      userId: 3,
    });
    await scheduleSMS({
      phoneNumber: "+15552222222",
      body: "hello",
      sender: "",
      scheduledDate,
      isWhatsapp: true,
      contentSid: "content-1",
      contentVariables: { "1": "hello" },
    });

    expect(mocks.setTestSMS).toHaveBeenNthCalledWith(1, {
      to: "+15552222222",
      from: "+15550000000",
      message: "hello",
    });
    expect(mocks.setTestSMS).toHaveBeenNthCalledWith(2, {
      to: "whatsapp:+15552222222",
      from: "whatsapp:+15551111111",
      message: "hello",
    });
  });

  it("supports Twilio verification, lookup, message, cancellation, and webhook helpers", async () => {
    vi.stubEnv("TWILIO_SID", "sid");
    vi.stubEnv("TWILIO_TOKEN", "token");
    vi.stubEnv("TWILIO_MESSAGING_SID", "messaging");
    vi.stubEnv("TWILIO_VERIFY_SID", "verify");
    mocks.verificationCheck.mockResolvedValue({ status: "approved" });
    mocks.lookupFetch.mockResolvedValue({ countryCode: "US" });

    await sendVerificationCode("+15552222222");
    await expect(verifyNumber("+15552222222", "1234")).resolves.toBe("approved");
    await expect(getCountryCodeForNumber("+15552222222")).resolves.toBe("US");
    await expect(getMessageBody("SM123")).resolves.toBe("message");
    await expect(getMessageInfo("SM123")).resolves.toEqual({ price: 0.02, numSegments: 2 });
    await cancelSMS("SM123");
    await deleteMultipleScheduledSMS(["SM123"]);
    await expect(
      validateWebhookRequest({ requestUrl: "https://example.com", params: {}, signature: "signature" })
    ).resolves.toBe(true);

    expect(mocks.verificationCreate).toHaveBeenCalledWith({ to: "+15552222222", channel: "sms" });
    expect(mocks.twilioMessageUpdate).toHaveBeenCalledWith("SM123", { status: "canceled" });
  });

  it("reports failed Twilio verification checks", async () => {
    vi.stubEnv("TWILIO_SID", "sid");
    vi.stubEnv("TWILIO_TOKEN", "token");
    vi.stubEnv("TWILIO_MESSAGING_SID", "messaging");
    vi.stubEnv("TWILIO_VERIFY_SID", "verify");
    mocks.verificationCheck.mockRejectedValue(new Error("invalid code"));

    await expect(verifyNumber("+15552222222", "0000")).resolves.toBe("failed");
  });

  it("validates Twilio opt-out webhook payloads", async () => {
    vi.stubEnv("TWILIO_SID", "sid");
    vi.stubEnv("TWILIO_TOKEN", "token");

    const request = (signature: string | null, values: Record<string, string>) =>
      ({
        headers: { get: () => signature },
        nextUrl: { pathname: "/api/twilio/webhook" },
        formData: async () => new URLSearchParams(values),
      }) as never;

    await expect(determineOptOutType(request(null, {}))).resolves.toEqual({
      error: "Missing Twilio signature",
    });
    await expect(determineOptOutType(request("signature", { AccountSid: "sid" }))).resolves.toEqual({
      error: "No phone number to handle",
    });
    await expect(
      determineOptOutType(
        request("signature", { AccountSid: "wrong", From: "+15552222222", OptOutType: "STOP" })
      )
    ).resolves.toEqual({ error: "Invalid account SID" });
    await expect(
      determineOptOutType(request("signature", { AccountSid: "sid", From: "+15552222222" }))
    ).resolves.toEqual({ error: "No opt out message to handle" });
    await expect(
      determineOptOutType(
        request("signature", { AccountSid: "sid", From: "+15552222222", OptOutType: "UNKNOWN" })
      )
    ).resolves.toEqual({ error: "Invalid opt out type" });
    await expect(
      determineOptOutType(
        request("signature", { AccountSid: "sid", From: "+15552222222", OptOutType: "STOP" })
      )
    ).resolves.toEqual({ phoneNumber: "+15552222222", optOutStatus: true });
    await expect(
      determineOptOutType(
        request("signature", { AccountSid: "sid", From: "+15552222222", OptOutType: "START" })
      )
    ).resolves.toEqual({ phoneNumber: "+15552222222", optOutStatus: false });

    mocks.validateRequest.mockReturnValueOnce(false);
    await expect(
      determineOptOutType(
        request("signature", { AccountSid: "sid", From: "+15552222222", OptOutType: "STOP" })
      )
    ).resolves.toEqual({ error: "Invalid signature" });
  });

  it("skips SMS sends and schedules for locked teams and users", async () => {
    vi.stubEnv("TWILIO_SID", "sid");
    vi.stubEnv("TWILIO_TOKEN", "token");
    vi.stubEnv("TWILIO_MESSAGING_SID", "messaging");
    mocks.prismaTeam.mockResolvedValue({ smsLockState: "LOCKED" });
    await sendSMS({ phoneNumber: "+15550000000", body: "hello", sender: "", teamId: 9 });
    await scheduleSMS({
      phoneNumber: "+15550000000",
      body: "hello",
      sender: "",
      scheduledDate: new Date("2030-01-01T12:00:00Z"),
      teamId: 9,
    });
    expect(mocks.twilioMessagesCreate).not.toHaveBeenCalled();

    mocks.prismaTeam.mockResolvedValue(null);
    mocks.prismaMemberships.mockResolvedValue([{ team: { smsLockState: "LOCKED" } }]);
    await sendSMS({ phoneNumber: "+15550000000", body: "hello", sender: "", userId: 3 });
    expect(mocks.twilioMessagesCreate).not.toHaveBeenCalled();
  });

  it("sends through the real Twilio boundary when test mode is disabled", async () => {
    vi.stubEnv("INTEGRATION_TEST_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_IS_E2E", "");
    vi.stubEnv("TWILIO_SID", "sid");
    vi.stubEnv("TWILIO_TOKEN", "token");
    vi.stubEnv("TWILIO_MESSAGING_SID", "messaging");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15550000000");
    const provider = await loadTwilioProvider();

    await provider.sendSMS({
      phoneNumber: "+15552222222",
      body: "hello",
      sender: "",
      userId: 3,
    });
    await provider.scheduleSMS({
      phoneNumber: "+15552222222",
      body: "hello",
      sender: "",
      scheduledDate: new Date("2030-01-01T12:00:00Z"),
      userId: 3,
    });

    expect(mocks.twilioMessagesCreate).toHaveBeenCalledTimes(2);
  });

  it("rejects webhook validation when the Twilio token is missing", async () => {
    await expect(
      validateWebhookRequest({ requestUrl: "https://example.com", params: {}, signature: "signature" })
    ).rejects.toThrow("TWILIO_TOKEN is not set");
  });
});
