import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  sendCustomWorkflowEmail: vi.fn(),
  sendSMS: vi.fn(),
  scheduleSMS: vi.fn(),
  cancelSMS: vi.fn(),
  prismaCreate: vi.fn(),
  verifyNumber: vi.fn(),
  sendVerificationCode: vi.fn(),
  logDebug: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@calcom/features/tasker", () => ({ default: { create: mocks.create } }));
vi.mock("@calcom/emails/workflow-email-service", () => ({
  sendCustomWorkflowEmail: mocks.sendCustomWorkflowEmail,
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    workflowReminder: { create: mocks.prismaCreate },
    verifiedNumber: { create: mocks.prismaCreate },
  },
}));
vi.mock("@calcom/lib/logger", () => ({
  default: { getSubLogger: () => ({ debug: mocks.logDebug, error: mocks.logError, silly: vi.fn() }) },
}));
vi.mock("./providers/twilioProvider", () => ({
  sendSMS: mocks.sendSMS,
  scheduleSMS: mocks.scheduleSMS,
  cancelSMS: mocks.cancelSMS,
  verifyNumber: mocks.verifyNumber,
  sendVerificationCode: mocks.sendVerificationCode,
}));

import { scheduleSmsOrFallbackEmail, sendSmsOrFallbackEmail } from "./messageDispatcher";
import { sendOrScheduleWorkflowEmails } from "./providers/emailProvider";
import { sendVerificationCode, verifyPhoneNumber } from "./verifyPhoneNumber";

describe("reminder boundary helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prismaCreate.mockResolvedValue({ id: 7, uuid: "reminder-uuid" });
  });

  it("sends SMS when the credit check passes", async () => {
    const creditCheckFn = vi.fn().mockResolvedValue(true);
    const twilioData = { phoneNumber: "+15550000000", body: "hello", sender: "Cal", userId: 3 };

    await sendSmsOrFallbackEmail({ twilioData, creditCheckFn });

    expect(creditCheckFn).toHaveBeenCalledWith({ userId: 3, teamId: undefined });
    expect(mocks.sendSMS).toHaveBeenCalledWith(twilioData);
  });

  it("falls back to email when SMS credits are unavailable", async () => {
    const t = vi.fn((key: string) => `translated:${key}`) as never;

    await sendSmsOrFallbackEmail({
      twilioData: {
        phoneNumber: "+15550000000",
        body: "with opt out",
        bodyWithoutOptOut: "without opt out",
        sender: "Cal",
        teamId: 9,
      },
      fallbackData: { email: "attendee@example.com", t, replyTo: "organizer@example.com" },
      creditCheckFn: vi.fn().mockResolvedValue(false),
    });

    expect(mocks.sendCustomWorkflowEmail).toHaveBeenCalledWith({
      to: "attendee@example.com",
      subject: "translated:notification_about_your_booking",
      html: "without opt out",
      replyTo: "organizer@example.com",
    });
    expect(mocks.sendSMS).not.toHaveBeenCalled();
  });

  it("does not send fallback email when no fallback recipient exists", async () => {
    await sendSmsOrFallbackEmail({
      twilioData: { phoneNumber: "+15550000000", body: "hello", sender: "Cal", userId: 3 },
      creditCheckFn: vi.fn().mockResolvedValue(false),
    });

    expect(mocks.sendCustomWorkflowEmail).not.toHaveBeenCalled();
    expect(mocks.sendSMS).not.toHaveBeenCalled();
  });

  it("schedules SMS when credits are available", async () => {
    mocks.scheduleSMS.mockResolvedValue({ sid: "SM123" });
    const scheduledDate = new Date("2030-01-01T12:00:00Z");

    await expect(
      scheduleSmsOrFallbackEmail({
        twilioData: {
          phoneNumber: "+15550000000",
          body: "hello",
          sender: "Cal",
          scheduledDate,
          bookingUid: "booking-1",
        },
        creditCheckFn: vi.fn().mockResolvedValue(true),
      })
    ).resolves.toEqual({ emailReminderId: null, sid: "SM123" });
  });

  it("schedules fallback email and records an email reminder without credits", async () => {
    const scheduledDate = new Date("2030-01-01T12:00:00Z");
    const t = vi.fn((key: string) => key) as never;

    await expect(
      scheduleSmsOrFallbackEmail({
        twilioData: {
          phoneNumber: "+15550000000",
          body: "hello",
          scheduledDate,
          sender: "Cal",
          bookingUid: "booking-1",
        },
        fallbackData: {
          email: "attendee@example.com",
          t,
          replyTo: "organizer@example.com",
          workflowStepId: 12,
        },
        creditCheckFn: vi.fn().mockResolvedValue(false),
      })
    ).resolves.toEqual({ emailReminderId: 7, sid: null });

    expect(mocks.prismaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingUid: "booking-1",
        workflowStepId: 12,
      }),
    });
    expect(mocks.create).toHaveBeenCalledWith(
      "sendWorkflowEmails",
      expect.objectContaining({ to: ["attendee@example.com"] }),
      expect.objectContaining({ scheduledAt: scheduledDate, referenceUid: "reminder-uuid" })
    );
  });

  it("returns null when scheduled SMS has no provider SID", async () => {
    mocks.scheduleSMS.mockResolvedValue({});

    await expect(
      scheduleSmsOrFallbackEmail({
        twilioData: {
          phoneNumber: "+15550000000",
          body: "hello",
          sender: "Cal",
          scheduledDate: new Date("2030-01-01T12:00:00Z"),
        },
        creditCheckFn: vi.fn().mockResolvedValue(true),
      })
    ).resolves.toBeNull();
  });

  it("sends workflow email directly to each recipient", async () => {
    await sendOrScheduleWorkflowEmails({
      to: ["one@example.com", "two@example.com"],
      subject: "Subject",
      html: "<p>Body</p>",
      sender: "Cal",
      replyTo: "reply@example.com",
    });

    expect(mocks.sendCustomWorkflowEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendCustomWorkflowEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "one@example.com", subject: "Subject" })
    );
  });

  it("schedules future workflow email through tasker", async () => {
    const sendAt = new Date("2030-01-01T12:00:00Z");

    await sendOrScheduleWorkflowEmails({
      to: ["one@example.com"],
      subject: "Subject",
      html: "<p>Body</p>",
      sendAt,
      referenceUid: "reference-1",
    });

    expect(mocks.create).toHaveBeenCalledWith(
      "sendWorkflowEmails",
      expect.objectContaining({ to: ["one@example.com"], subject: "Subject" }),
      { scheduledAt: sendAt, referenceUid: "reference-1" }
    );
  });

  it("skips workflow email when its scheduled time has passed", async () => {
    await sendOrScheduleWorkflowEmails({
      to: ["one@example.com"],
      subject: "Subject",
      html: "<p>Body</p>",
      sendAt: new Date("2020-01-01T12:00:00Z"),
    });

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.sendCustomWorkflowEmail).not.toHaveBeenCalled();
  });

  it("delegates verification code sending and stores approved numbers", async () => {
    mocks.sendVerificationCode.mockResolvedValue(undefined);
    mocks.verifyNumber.mockResolvedValue("approved");

    await sendVerificationCode("+15550000000");
    await expect(verifyPhoneNumber("+15550000000", "1234", 3, 9)).resolves.toBe(true);

    expect(mocks.sendVerificationCode).toHaveBeenCalledWith("+15550000000");
    expect(mocks.verifyNumber).toHaveBeenCalledWith("+15550000000", "1234");
    expect(mocks.prismaCreate).toHaveBeenCalledWith({
      data: { userId: 3, teamId: 9, phoneNumber: "+15550000000" },
    });
  });

  it("accepts unscoped verification and rejects failed verification", async () => {
    await expect(verifyPhoneNumber("+15550000000", "1234")).resolves.toBe(true);
    mocks.verifyNumber.mockResolvedValue("pending");
    await expect(verifyPhoneNumber("+15550000000", "1234", 3)).resolves.toBe(false);

    expect(mocks.prismaCreate).not.toHaveBeenCalled();
  });
});
