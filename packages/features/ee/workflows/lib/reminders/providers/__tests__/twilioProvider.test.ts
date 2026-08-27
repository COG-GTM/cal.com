import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const messages = Object.assign(
    vi.fn(() => ({ update: mocks.messageUpdate, fetch: mocks.messageFetch })),
    { create: vi.fn() }
  );
  return {
    messages,
    messageUpdate: vi.fn(),
    messageFetch: vi.fn(),
    verificationsCreate: vi.fn(),
    verificationChecksCreate: vi.fn(),
    lookupFetch: vi.fn(),
    validateRequest: vi.fn(),
    checkSMSRateLimit: vi.fn(),
    setTestSMS: vi.fn(),
    prisma: {
      team: { findUnique: vi.fn() },
      membership: { findMany: vi.fn() },
      user: { findUnique: vi.fn() },
    },
  };
});

vi.mock("twilio", () => {
  const client = Object.assign(
    vi.fn(() => ({
      messages: mocks.messages,
      verify: {
        services: () => ({ verifications: { create: mocks.verificationsCreate } }),
        v2: { services: () => ({ verificationChecks: { create: mocks.verificationChecksCreate } }) },
      },
      lookups: { v2: { phoneNumbers: () => ({ fetch: mocks.lookupFetch }) } },
    })),
    { validateRequest: mocks.validateRequest }
  );
  return { default: client };
});

vi.mock("@calcom/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@calcom/lib/smsLockState", () => ({ checkSMSRateLimit: mocks.checkSMSRateLimit }));
vi.mock("@calcom/lib/testSMS", () => ({ setTestSMS: mocks.setTestSMS }));

async function loadProvider({ testMode = false }: { testMode?: boolean } = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_IS_E2E", testMode ? "1" : "");
  vi.stubEnv("INTEGRATION_TEST_MODE", "");
  return import("../twilioProvider");
}

const smsArgs = {
  phoneNumber: "+15551234567",
  body: "Your booking is confirmed",
  sender: "Cal",
  bookingUid: "booking-uid",
  userId: 1,
};

describe("twilioProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("TWILIO_SID", "twilio-sid");
    vi.stubEnv("TWILIO_TOKEN", "twilio-token");
    vi.stubEnv("TWILIO_MESSAGING_SID", "messaging-sid");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15550000000");
    vi.stubEnv("TWILIO_WHATSAPP_PHONE_NUMBER", "15551111111");
    vi.stubEnv("TWILIO_VERIFY_SID", "verify-sid");
    mocks.prisma.team.findUnique.mockResolvedValue(null);
    mocks.prisma.membership.findMany.mockResolvedValue([]);
    mocks.prisma.user.findUnique.mockResolvedValue({ smsLockState: "UNLOCKED" });
    mocks.messages.create.mockResolvedValue({ sid: "message-sid" });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  describe("sendSMS", () => {
    it("sends the message through the messaging service and reports status back to the webhook", async () => {
      const { sendSMS } = await loadProvider();

      await expect(sendSMS(smsArgs)).resolves.toEqual({ sid: "message-sid" });

      const options = mocks.messages.create.mock.calls[0][0];
      expect(options).toMatchObject({
        body: smsArgs.body,
        messagingServiceSid: "messaging-sid",
        to: smsArgs.phoneNumber,
        from: "Cal",
      });
      expect(options.statusCallback).toContain("/api/twilio/webhook?userId=1&bookingUid=booking-uid");
      expect(mocks.checkSMSRateLimit).toHaveBeenCalledWith({
        identifier: "sms:user:1",
        rateLimitingType: "smsMonth",
      });
    });

    it("falls back to the default sender and skips the user rate limit for teams", async () => {
      const { sendSMS } = await loadProvider();

      await sendSMS({ ...smsArgs, sender: "", userId: null, teamId: 3 });

      const options = mocks.messages.create.mock.calls[0][0];
      expect(options.from).toBe("+15550000000");
      expect(options.statusCallback).toContain("?teamId=3&bookingUid=booking-uid");
      expect(mocks.checkSMSRateLimit).not.toHaveBeenCalled();
    });

    it("sends whatsapp messages with a content template", async () => {
      const { sendSMS } = await loadProvider();

      await sendSMS({
        ...smsArgs,
        isWhatsapp: true,
        contentSid: "content-sid",
        contentVariables: { name: "Alice" },
      });

      expect(mocks.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contentSid: "content-sid",
          contentVariables: JSON.stringify({ name: "Alice" }),
          to: `whatsapp:${smsArgs.phoneNumber}`,
          from: "whatsapp:+15551111111",
        })
      );
    });

    it("omits contentVariables when none are given", async () => {
      const { sendSMS } = await loadProvider();

      await sendSMS({ ...smsArgs, isWhatsapp: true, contentSid: "content-sid" });

      expect(mocks.messages.create.mock.calls[0][0]).not.toHaveProperty("contentVariables");
    });

    it("does not send for a locked team", async () => {
      mocks.prisma.team.findUnique.mockResolvedValue({ smsLockState: "LOCKED" });
      const { sendSMS } = await loadProvider();

      await expect(sendSMS({ ...smsArgs, teamId: 3 })).resolves.toBeUndefined();
      expect(mocks.messages.create).not.toHaveBeenCalled();
    });

    it("does not send for a user in a locked team", async () => {
      mocks.prisma.membership.findMany.mockResolvedValue([{ team: { smsLockState: "LOCKED" } }]);
      const { sendSMS } = await loadProvider();

      await sendSMS(smsArgs);

      expect(mocks.messages.create).not.toHaveBeenCalled();
    });

    it("does not send for a locked user", async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ smsLockState: "LOCKED" });
      const { sendSMS } = await loadProvider();

      await sendSMS(smsArgs);

      expect(mocks.messages.create).not.toHaveBeenCalled();
    });

    it("records the message instead of sending it in test mode", async () => {
      const { sendSMS } = await loadProvider({ testMode: true });

      await sendSMS(smsArgs);

      expect(mocks.setTestSMS).toHaveBeenCalledWith({
        to: smsArgs.phoneNumber,
        from: "Cal",
        message: smsArgs.body,
      });
      expect(mocks.messages.create).not.toHaveBeenCalled();
    });

    it("sends without a user or team to check the lock state of", async () => {
      const { sendSMS } = await loadProvider();

      await sendSMS({ ...smsArgs, userId: null });

      expect(mocks.messages.create.mock.calls[0][0].statusCallback).toContain(
        "/api/twilio/webhook?bookingUid=booking-uid"
      );
      expect(mocks.checkSMSRateLimit).not.toHaveBeenCalled();
    });

    it("throws when the twilio credentials are missing", async () => {
      vi.stubEnv("TWILIO_SID", "");
      const { sendSMS } = await loadProvider();

      await expect(sendSMS(smsArgs)).rejects.toThrow("Twilio credentials are missing from the .env file");
    });
  });

  describe("scheduleSMS", () => {
    const scheduledDate = new Date("2024-06-01T10:00:00.000Z");

    it("schedules a fixed send", async () => {
      const { scheduleSMS } = await loadProvider();

      await expect(scheduleSMS({ ...smsArgs, scheduledDate })).resolves.toEqual({ sid: "message-sid" });
      expect(mocks.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleType: "fixed", sendAt: scheduledDate })
      );
    });

    it("schedules a whatsapp template message", async () => {
      const { scheduleSMS } = await loadProvider();

      await scheduleSMS({
        ...smsArgs,
        scheduledDate,
        isWhatsapp: true,
        contentSid: "content-sid",
        contentVariables: { name: "Alice" },
      });

      expect(mocks.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contentSid: "content-sid",
          contentVariables: JSON.stringify({ name: "Alice" }),
          scheduleType: "fixed",
          from: "whatsapp:+15551111111",
        })
      );
    });

    it("omits contentVariables when none are given", async () => {
      const { scheduleSMS } = await loadProvider();

      await scheduleSMS({ ...smsArgs, scheduledDate, isWhatsapp: true, contentSid: "content-sid" });

      expect(mocks.messages.create.mock.calls[0][0]).not.toHaveProperty("contentVariables");
    });

    it("does not schedule for a locked team", async () => {
      mocks.prisma.team.findUnique.mockResolvedValue({ smsLockState: "LOCKED" });
      const { scheduleSMS } = await loadProvider();

      await expect(scheduleSMS({ ...smsArgs, teamId: 3, scheduledDate })).resolves.toBeUndefined();
    });

    it("falls back to the default sender when scheduling", async () => {
      const { scheduleSMS } = await loadProvider();

      await scheduleSMS({ ...smsArgs, sender: "", scheduledDate });

      expect(mocks.messages.create.mock.calls[0][0].from).toBe("+15550000000");
    });

    it("records the scheduled message with the default sender in test mode", async () => {
      const { scheduleSMS } = await loadProvider({ testMode: true });

      await scheduleSMS({ ...smsArgs, sender: "", scheduledDate });

      expect(mocks.setTestSMS).toHaveBeenCalledWith(
        expect.objectContaining({ to: smsArgs.phoneNumber, from: "+15550000000" })
      );
    });

    it("returns a fake reference id in test mode", async () => {
      const { scheduleSMS } = await loadProvider({ testMode: true });

      const result = await scheduleSMS({ ...smsArgs, scheduledDate, isWhatsapp: true });

      expect(result?.sid).toEqual(expect.any(String));
      expect(mocks.setTestSMS).toHaveBeenCalledWith(
        expect.objectContaining({ to: `whatsapp:${smsArgs.phoneNumber}`, from: "whatsapp:+15551111111" })
      );
    });
  });

  describe("message management", () => {
    it("cancels a scheduled message", async () => {
      const { cancelSMS } = await loadProvider();

      await cancelSMS("message-sid");

      expect(mocks.messages).toHaveBeenCalledWith("message-sid");
      expect(mocks.messageUpdate).toHaveBeenCalledWith({ status: "canceled" });
    });

    it("cancels several scheduled messages and swallows individual failures", async () => {
      mocks.messageUpdate.mockRejectedValueOnce(new Error("already sent")).mockResolvedValue({});
      const { deleteMultipleScheduledSMS } = await loadProvider();

      await deleteMultipleScheduledSMS(["sid-1", "sid-2"]);

      expect(mocks.messageUpdate).toHaveBeenCalledTimes(2);
    });

    it("reads the body of a message", async () => {
      mocks.messageFetch.mockResolvedValue({ body: "Your booking is confirmed" });
      const { getMessageBody } = await loadProvider();

      await expect(getMessageBody("message-sid")).resolves.toBe("Your booking is confirmed");
    });

    it("returns the absolute price and segment count of a message", async () => {
      mocks.messageFetch.mockResolvedValue({ price: "-0.0075", numSegments: "2" });
      const { getMessageInfo } = await loadProvider();

      await expect(getMessageInfo("message-sid")).resolves.toEqual({ price: 0.0075, numSegments: 2 });
    });

    it("returns null price and segments when twilio has not billed the message yet", async () => {
      mocks.messageFetch.mockResolvedValue({ price: null, numSegments: null });
      const { getMessageInfo } = await loadProvider();

      await expect(getMessageInfo("message-sid")).resolves.toEqual({ price: null, numSegments: null });
    });

    it("looks up the country code of a phone number", async () => {
      mocks.lookupFetch.mockResolvedValue({ countryCode: "US" });
      const { getCountryCodeForNumber } = await loadProvider();

      await expect(getCountryCodeForNumber("+15551234567")).resolves.toBe("US");
    });
  });

  describe("phone verification", () => {
    it("sends a verification code", async () => {
      const { sendVerificationCode } = await loadProvider();

      await sendVerificationCode("+15551234567");

      expect(mocks.verificationsCreate).toHaveBeenCalledWith({ to: "+15551234567", channel: "sms" });
    });

    it("does nothing without a verify service", async () => {
      vi.stubEnv("TWILIO_VERIFY_SID", "");
      const { sendVerificationCode, verifyNumber } = await loadProvider();

      await sendVerificationCode("+15551234567");
      await expect(verifyNumber("+15551234567", "123456")).resolves.toBeUndefined();
      expect(mocks.verificationsCreate).not.toHaveBeenCalled();
    });

    it("returns the verification status", async () => {
      mocks.verificationChecksCreate.mockResolvedValue({ status: "approved" });
      const { verifyNumber } = await loadProvider();

      await expect(verifyNumber("+15551234567", "123456")).resolves.toBe("approved");
    });

    it("reports a failed verification", async () => {
      mocks.verificationChecksCreate.mockRejectedValue(new Error("wrong code"));
      const { verifyNumber } = await loadProvider();

      await expect(verifyNumber("+15551234567", "000000")).resolves.toBe("failed");
    });
  });

  describe("webhook handling", () => {
    function buildRequest(fields: Record<string, string>, signature: string | null = "signature") {
      const formData = new FormData();
      for (const [key, value] of Object.entries(fields)) formData.append(key, value);
      return {
        headers: { get: (name: string) => (name === "X-Twilio-Signature" ? signature : null) },
        formData: () => Promise.resolve(formData),
        nextUrl: { pathname: "/api/twilio/opt-out" },
      } as unknown as NextRequest;
    }

    const optOutFields = { AccountSid: "twilio-sid", From: "+15551234567", OptOutType: "STOP" };

    it("validates the twilio signature", async () => {
      mocks.validateRequest.mockReturnValue(true);
      const { validateWebhookRequest } = await loadProvider();

      await expect(
        validateWebhookRequest({ requestUrl: "https://cal.com/hook", params: {}, signature: "signature" })
      ).resolves.toBe(true);
      expect(mocks.validateRequest).toHaveBeenCalledWith(
        "twilio-token",
        "signature",
        "https://cal.com/hook",
        {}
      );
    });

    it("throws when the twilio token is not configured", async () => {
      vi.stubEnv("TWILIO_TOKEN", "");
      const { validateWebhookRequest } = await loadProvider();

      await expect(
        validateWebhookRequest({ requestUrl: "https://cal.com/hook", params: {}, signature: "signature" })
      ).rejects.toThrow("TWILIO_TOKEN is not set");
    });

    it("opts a number out", async () => {
      mocks.validateRequest.mockReturnValue(true);
      const { determineOptOutType } = await loadProvider();

      await expect(determineOptOutType(buildRequest(optOutFields))).resolves.toEqual({
        phoneNumber: "+15551234567",
        optOutStatus: true,
      });
    });

    it("opts a number back in", async () => {
      mocks.validateRequest.mockReturnValue(true);
      const { determineOptOutType } = await loadProvider();

      await expect(
        determineOptOutType(buildRequest({ ...optOutFields, OptOutType: "START" }))
      ).resolves.toEqual({ phoneNumber: "+15551234567", optOutStatus: false });
    });

    it.each([
      ["Missing Twilio signature", optOutFields, null],
      ["Invalid account SID", { ...optOutFields, AccountSid: "someone-else" }, "signature"],
      ["No phone number to handle", { ...optOutFields, From: "" }, "signature"],
      ["No opt out message to handle", { AccountSid: "twilio-sid", From: "+15551234567" }, "signature"],
      ["Invalid opt out type", { ...optOutFields, OptOutType: "HELP" }, "signature"],
    ])("rejects the request with %s", async (error, fields, signature) => {
      mocks.validateRequest.mockReturnValue(true);
      const { determineOptOutType } = await loadProvider();

      await expect(determineOptOutType(buildRequest(fields, signature))).resolves.toEqual({ error });
    });

    it("rejects an invalid signature", async () => {
      mocks.validateRequest.mockReturnValue(false);
      const { determineOptOutType } = await loadProvider();

      await expect(determineOptOutType(buildRequest(optOutFields))).resolves.toEqual({
        error: "Invalid signature",
      });
    });
  });
});
