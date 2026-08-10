import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  sendOrSchedule: vi.fn(),
  scheduleSms: vi.fn(),
  sendSms: vi.fn(),
  isOptedOut: vi.fn(),
  verifiedFindFirst: vi.fn(),
  reminderCreate: vi.fn(),
  reminderFindUnique: vi.fn(),
  reminderDelete: vi.fn(),
  cancelWithReference: vi.fn(),
  findUniqueStep: vi.fn(),
  taskerCreate: vi.fn(),
  featureEnabled: vi.fn(),
  getSMSMessage: vi.fn(),
  getAttendee: vi.fn(),
  shouldUseTwilio: vi.fn(),
  reminderUpdate: vi.fn(),
}));

vi.mock("@calcom/lib/logger", () => ({
  default: {
    getSubLogger: () => ({
      warn: mocks.warning,
      error: mocks.error,
      info: mocks.info,
      debug: vi.fn(),
      silly: vi.fn(),
    }),
    warn: mocks.warning,
    error: mocks.error,
    info: mocks.info,
  },
}));
vi.mock("@calcom/features/tasker", () => ({
  default: {
    create: mocks.taskerCreate,
    cancelWithReference: mocks.cancelWithReference,
  },
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    verifiedNumber: { findFirst: mocks.verifiedFindFirst },
    workflowReminder: {
      create: mocks.reminderCreate,
      findUnique: mocks.reminderFindUnique,
      delete: mocks.reminderDelete,
      update: mocks.reminderUpdate,
    },
    workflowStep: { findUnique: mocks.findUniqueStep },
  },
}));
vi.mock("@calcom/features/ee/workflows/lib/reminders/messageDispatcher", () => ({
  sendSmsOrFallbackEmail: mocks.sendSms,
  scheduleSmsOrFallbackEmail: mocks.scheduleSms,
}));
vi.mock("../service/workflowOptOutService", () => ({
  WorkflowOptOutService: { addOptOutMessage: vi.fn((message: string) => message) },
}));
vi.mock("../repository/workflowOptOutContact", () => ({
  WorkflowOptOutContactRepository: { isOptedOut: mocks.isOptedOut },
}));
vi.mock("@calcom/features/flags/features.repository", () => ({
  FeaturesRepository: class {
    checkIfFeatureIsEnabledGlobally = mocks.featureEnabled;
  },
}));
vi.mock("@calcom/lib/checkRateLimitAndThrowError", () => ({
  checkRateLimitAndThrowError: vi.fn(),
}));
vi.mock("@calcom/features/ee/workflows/lib/service/WorkflowService", () => ({
  WorkflowService: {
    processWorkflowScheduledDate: vi.fn(() => null),
  },
}));
vi.mock("@calcom/features/ee/workflows/lib/service/EmailWorkflowService", () => ({
  EmailWorkflowService: class {
    generateEmailPayloadForEvtWorkflow = vi.fn().mockResolvedValue({
      subject: "Subject",
      html: "<p>Body</p>",
    });
  },
}));
vi.mock("@calcom/features/bookings/repositories/BookingSeatRepository", () => ({
  BookingSeatRepository: class {},
}));
vi.mock("@calcom/features/tasker/tasks/triggerFormSubmittedNoEvent/formSubmissionValidation", () => ({
  getSubmitterEmail: vi.fn(() => "submitter@example.com"),
}));
vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn(async () => (key: string) => key),
}));
vi.mock("@calcom/features/ee/workflows/lib/reminders/providers/emailProvider", () => ({
  sendOrScheduleWorkflowEmails: mocks.sendOrSchedule,
}));
vi.mock("@calcom/features/ee/workflows/lib/reminders/providers/twilioProvider", () => ({
  cancelSMS: vi.fn(),
}));
vi.mock("@calcom/ee/workflows/lib/reminders/utils", () => ({
  getSMSMessageWithVariables: mocks.getSMSMessage,
  getAttendeeToBeUsedInSMS: mocks.getAttendee,
  shouldUseTwilio: mocks.shouldUseTwilio,
}));
vi.mock("./utils", () => ({
  getSMSMessageWithVariables: mocks.getSMSMessage,
  getAttendeeToBeUsedInSMS: mocks.getAttendee,
  shouldUseTwilio: mocks.shouldUseTwilio,
}));
vi.mock("./templates/smsReminderTemplate", () => ({ default: vi.fn(() => "Generated SMS") }));
vi.mock("@calcom/features/di/containers/TranslationService", () => ({
  getTranslationService: vi.fn(async () => ({
    getWorkflowStepTranslation: vi.fn().mockResolvedValue({ translatedBody: "Translated SMS" }),
  })),
}));
vi.mock("../alphanumericSenderIdSupport", () => ({ getSenderId: vi.fn(() => "sender-id") }));

import { WorkflowActions, WorkflowTemplates, WorkflowTriggerEvents } from "@calcom/prisma/enums";
import { deleteScheduledAIPhoneCall, scheduleAIPhoneCall } from "./aiPhoneCallManager";
import { deleteScheduledEmailReminder, scheduleEmailReminder } from "./emailReminderManager";
import { deleteScheduledSMSReminder, scheduleSMSReminder } from "./smsReminderManager";
import { scheduleWhatsappReminder } from "./whatsappReminderManager";

const baseArgs = {
  triggerEvent: WorkflowTriggerEvents.NEW_EVENT,
  timeSpan: { time: null, timeUnit: null },
  workflowStepId: 12,
  verifiedAt: new Date(),
  userId: 3,
  teamId: null,
  submittedPhoneNumber: null,
  routedEventTypeId: null,
  creditCheckFn: vi.fn().mockResolvedValue(true),
};

function event() {
  return {
    uid: "booking-1",
    title: "Planning",
    startTime: "2030-01-01T12:00:00Z",
    endTime: "2030-01-01T13:00:00Z",
    attendees: [
      {
        email: "attendee@example.com",
        name: "Attendee",
        firstName: "Attendee",
        lastName: "",
        timeZone: "UTC",
        language: { locale: "en" },
      },
    ],
    organizer: {
      id: 3,
      name: "Organizer",
      email: "organizer@example.com",
      timeZone: "UTC",
      language: { locale: "en" },
      timeFormat: "h:mma",
    },
    responses: { attendeePhoneNumber: { value: "+15552222222" } },
    metadata: {},
  } as never;
}

describe("reminder manager guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOptedOut.mockResolvedValue(false);
    mocks.verifiedFindFirst.mockResolvedValue(null);
    mocks.findUniqueStep.mockResolvedValue(null);
    mocks.featureEnabled.mockResolvedValue(false);
    mocks.getAttendee.mockReturnValue({
      email: "attendee@example.com",
      phoneNumber: "+15550000000",
      language: { locale: "en" },
    });
    mocks.shouldUseTwilio.mockReturnValue(true);
    mocks.getSMSMessage.mockResolvedValue("Rendered SMS");
    mocks.reminderCreate.mockResolvedValue({ id: 7, uuid: "uuid-7" });
  });

  it("skips unverified email reminders and sends form reminders immediately", async () => {
    await scheduleEmailReminder({
      ...baseArgs,
      verifiedAt: null,
      action: WorkflowActions.EMAIL_ATTENDEE,
      sendTo: ["attendee@example.com"],
      formData: {
        user: { email: "organizer@example.com", locale: "en", timeFormat: "h:mma" },
        responses: {},
      } as never,
    });
    expect(mocks.sendOrSchedule).not.toHaveBeenCalled();

    await scheduleEmailReminder({
      ...baseArgs,
      action: WorkflowActions.EMAIL_ATTENDEE,
      sendTo: ["attendee@example.com"],
      emailSubject: "Hello {EMAIL}",
      emailBody: "Body",
      formData: {
        user: { email: "organizer@example.com", locale: "en", timeFormat: "h:mma" },
        responses: {},
      } as never,
    });
    expect(mocks.sendOrSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["attendee@example.com"], sendAt: null })
    );
  });

  it("deletes email reminders through tasker or the fallback database path", async () => {
    mocks.reminderFindUnique.mockResolvedValueOnce({ uuid: "task-ref", referenceId: null });
    mocks.cancelWithReference.mockResolvedValueOnce("task-id");
    await deleteScheduledEmailReminder(1);
    expect(mocks.reminderDelete).toHaveBeenCalledWith({ where: { id: 1 } });

    mocks.reminderFindUnique.mockResolvedValueOnce({ uuid: null, referenceId: null });
    await deleteScheduledEmailReminder(2);
    expect(mocks.reminderDelete).toHaveBeenCalledWith({ where: { id: 2 } });

    mocks.reminderFindUnique.mockResolvedValueOnce({ uuid: null, referenceId: "legacy-ref" });
    await deleteScheduledEmailReminder(3);
    expect(mocks.reminderUpdate).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { cancelled: true },
    });
  });

  it("generates and sends an event email reminder", async () => {
    await scheduleEmailReminder({
      ...baseArgs,
      action: WorkflowActions.EMAIL_ATTENDEE,
      sendTo: ["attendee@example.com"],
      evt: event(),
      emailSubject: "Subject",
      emailBody: "Body",
    });

    expect(mocks.sendOrSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["attendee@example.com"], sendAt: null })
    );
  });

  it("skips an event email whose before-event time is already past", async () => {
    const { WorkflowService } = await import("@calcom/features/ee/workflows/lib/service/WorkflowService");
    vi.mocked(WorkflowService.processWorkflowScheduledDate).mockReturnValueOnce(
      new Date("2020-01-01T00:00:00Z")
    );

    await scheduleEmailReminder({
      ...baseArgs,
      action: WorkflowActions.EMAIL_ATTENDEE,
      sendTo: ["attendee@example.com"],
      evt: event(),
      triggerEvent: WorkflowTriggerEvents.BEFORE_EVENT,
      timeSpan: { time: 1, timeUnit: "HOUR" },
    });

    expect(mocks.sendOrSchedule).not.toHaveBeenCalled();
  });

  it("guards SMS reminders before doing provider work", async () => {
    await scheduleSMSReminder({
      ...baseArgs,
      verifiedAt: null,
      reminderPhone: "+15550000000",
      sender: "",
      message: "Hello",
      action: WorkflowActions.SMS_ATTENDEE,
      evt: event(),
    });
    await scheduleSMSReminder({
      ...baseArgs,
      reminderPhone: null,
      sender: "",
      message: "Hello",
      action: WorkflowActions.SMS_ATTENDEE,
      evt: event(),
    });
    mocks.isOptedOut.mockResolvedValue(true);
    await scheduleSMSReminder({
      ...baseArgs,
      reminderPhone: "+15550000000",
      sender: "",
      message: "Hello",
      action: WorkflowActions.SMS_ATTENDEE,
      evt: event(),
    });

    expect(mocks.sendSms).not.toHaveBeenCalled();
    expect(mocks.scheduleSms).not.toHaveBeenCalled();
  });

  it("requires verification for number-targeted SMS reminders", async () => {
    await scheduleSMSReminder({
      ...baseArgs,
      reminderPhone: "+15550000000",
      sender: "",
      message: "Hello",
      action: WorkflowActions.SMS_NUMBER,
      evt: event(),
    });

    expect(mocks.verifiedFindFirst).toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("sends an immediate SMS reminder and records a future SMS reminder", async () => {
    await scheduleSMSReminder({
      ...baseArgs,
      reminderPhone: "+15550000000",
      sender: "",
      message: "Hello",
      action: WorkflowActions.SMS_ATTENDEE,
      evt: event(),
    });
    expect(mocks.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({
        twilioData: expect.objectContaining({ body: "Rendered SMS", phoneNumber: "+15550000000" }),
      })
    );

    mocks.shouldUseTwilio.mockReturnValue(false);
    await scheduleSMSReminder({
      ...baseArgs,
      reminderPhone: "+15550000000",
      sender: "",
      message: "Hello",
      action: WorkflowActions.SMS_ATTENDEE,
      evt: event(),
      triggerEvent: WorkflowTriggerEvents.BEFORE_EVENT,
      timeSpan: { time: 1, timeUnit: "DAY" },
    });
    expect(mocks.reminderCreate).toHaveBeenCalled();
  });

  it("sends a form SMS reminder with translated response variables", async () => {
    await scheduleSMSReminder({
      ...baseArgs,
      reminderPhone: "+15550000000",
      sender: "",
      message: "Hello {FORM_FIELD}",
      action: WorkflowActions.SMS_ATTENDEE,
      formData: {
        user: { email: "organizer@example.com", locale: "en", timeFormat: "h:mma" },
        responses: { FORM_FIELD: { value: "value" }, email: { value: "attendee@example.com" } },
      } as never,
    });

    expect(mocks.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ twilioData: expect.objectContaining({ phoneNumber: "+15550000000" }) })
    );
  });

  it("handles SMS provider errors and delete errors without throwing", async () => {
    mocks.sendSms.mockRejectedValueOnce(new Error("provider unavailable"));
    await scheduleSMSReminder({
      ...baseArgs,
      reminderPhone: "+15550000000",
      sender: "",
      message: "Hello",
      action: WorkflowActions.SMS_ATTENDEE,
      evt: event(),
    });

    mocks.reminderDelete.mockRejectedValueOnce(new Error("delete failed"));
    await deleteScheduledSMSReminder(5, "SM123");
    expect(mocks.error).toHaveBeenCalled();
  });

  it("deletes scheduled SMS reminders and handles missing references", async () => {
    await deleteScheduledSMSReminder(3, null);
    await deleteScheduledSMSReminder(4, "SM123");

    expect(mocks.reminderDelete).toHaveBeenCalledWith({ where: { id: 4 } });
  });

  it("skips unverified WhatsApp reminders", async () => {
    await scheduleWhatsappReminder({
      ...baseArgs,
      verifiedAt: null,
      reminderPhone: "+15550000000",
      sender: "",
      message: "",
      action: WorkflowActions.WHATSAPP_ATTENDEE,
      evt: event(),
    });

    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("sends a WhatsApp reminder immediately and persists a scheduled one", async () => {
    await scheduleWhatsappReminder({
      ...baseArgs,
      reminderPhone: "+15550000000",
      sender: "",
      message: "",
      action: WorkflowActions.WHATSAPP_ATTENDEE,
      template: WorkflowTemplates.REMINDER,
      evt: event(),
    });
    expect(mocks.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ twilioData: expect.objectContaining({ isWhatsapp: true }) })
    );

    mocks.scheduleSms.mockResolvedValue({ sid: "WA123" });
    await scheduleWhatsappReminder({
      ...baseArgs,
      reminderPhone: "+15550000000",
      sender: "",
      message: "Hello",
      action: WorkflowActions.WHATSAPP_ATTENDEE,
      template: WorkflowTemplates.CANCELLED,
      evt: event(),
      triggerEvent: WorkflowTriggerEvents.BEFORE_EVENT,
      timeSpan: { time: 1, timeUnit: "DAY" },
    });
    expect(mocks.reminderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ method: "WHATSAPP", scheduled: false }),
      })
    );

    const nearEvent = {
      ...(event() as unknown as Record<string, unknown>),
      startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    } as never;
    mocks.scheduleSms.mockResolvedValue({ sid: "WA124" });
    for (const template of [
      WorkflowTemplates.REMINDER,
      WorkflowTemplates.CANCELLED,
      WorkflowTemplates.RESCHEDULED,
      WorkflowTemplates.COMPLETED,
    ]) {
      await scheduleWhatsappReminder({
        ...baseArgs,
        reminderPhone: "+15550000000",
        sender: "",
        message: "Hello",
        action: WorkflowActions.WHATSAPP_ATTENDEE,
        template,
        evt: nearEvent,
        triggerEvent: WorkflowTriggerEvents.BEFORE_EVENT,
        timeSpan: { time: 30, timeUnit: "MINUTE" },
      });
    }
    expect(mocks.scheduleSms).toHaveBeenCalled();
  });

  it("checks verification for non-attendee WhatsApp actions and supports after-event timing", async () => {
    mocks.verifiedFindFirst.mockResolvedValue({ id: 1 });
    await scheduleWhatsappReminder({
      ...baseArgs,
      reminderPhone: "+15550000000",
      sender: "",
      message: "Hello",
      action: WorkflowActions.WHATSAPP_NUMBER,
      template: WorkflowTemplates.REMINDER,
      evt: event(),
      triggerEvent: WorkflowTriggerEvents.AFTER_EVENT,
      timeSpan: { time: 1, timeUnit: "HOUR" },
    });

    expect(mocks.verifiedFindFirst).toHaveBeenCalled();
  });

  it("handles WhatsApp provider failures", async () => {
    mocks.sendSms.mockRejectedValueOnce(new Error("send failed"));
    await scheduleWhatsappReminder({
      ...baseArgs,
      reminderPhone: "+15550000000",
      sender: "",
      message: "Hello",
      action: WorkflowActions.WHATSAPP_ATTENDEE,
      evt: event(),
    });

    mocks.scheduleSms.mockRejectedValueOnce(new Error("schedule failed"));
    const nearEvent = {
      ...(event() as unknown as Record<string, unknown>),
      startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    } as never;
    await scheduleWhatsappReminder({
      ...baseArgs,
      reminderPhone: "+15550000000",
      sender: "",
      message: "Hello",
      action: WorkflowActions.WHATSAPP_ATTENDEE,
      evt: nearEvent,
      triggerEvent: WorkflowTriggerEvents.BEFORE_EVENT,
      timeSpan: { time: 30, timeUnit: "MINUTE" },
    });
  });

  it("guards AI phone call scheduling before database and tasker work", async () => {
    await scheduleAIPhoneCall({
      ...baseArgs,
      workflowStepId: undefined,
      verifiedAt: new Date(),
      triggerEvent: WorkflowTriggerEvents.NEW_EVENT,
      timeSpan: { time: null, timeUnit: null },
      evt: event(),
    });
    await scheduleAIPhoneCall({
      ...baseArgs,
      verifiedAt: null,
      evt: event(),
    });
    await scheduleAIPhoneCall({
      ...baseArgs,
      evt: event(),
    });

    expect(mocks.taskerCreate).not.toHaveBeenCalled();
  });

  it("skips AI calls without an agent, active number, or enabled feature", async () => {
    mocks.findUniqueStep.mockResolvedValueOnce({ agent: null });
    await scheduleAIPhoneCall({ ...baseArgs, evt: event() });

    mocks.findUniqueStep.mockResolvedValueOnce({ agent: { id: "agent", outboundPhoneNumbers: [] } });
    await scheduleAIPhoneCall({ ...baseArgs, evt: event() });

    mocks.findUniqueStep.mockResolvedValueOnce({
      agent: {
        id: "agent",
        providerAgentId: "provider",
        outboundPhoneNumbers: [{ phoneNumber: "+15551111111", subscriptionStatus: "ACTIVE" }],
      },
    });
    await scheduleAIPhoneCall({ ...baseArgs, evt: event() });

    expect(mocks.taskerCreate).not.toHaveBeenCalled();
  });

  it("creates an immediate AI phone call task when voice agents are enabled", async () => {
    mocks.featureEnabled.mockResolvedValue(true);
    mocks.findUniqueStep.mockResolvedValue({
      agent: {
        id: "agent",
        providerAgentId: "provider",
        outboundPhoneNumbers: [{ phoneNumber: "+15551111111", subscriptionStatus: "ACTIVE" }],
      },
    });

    await scheduleAIPhoneCall({
      ...baseArgs,
      evt: event(),
      triggerEvent: WorkflowTriggerEvents.NEW_EVENT,
      submittedPhoneNumber: "+15552222222",
      timeSpan: { time: null, timeUnit: null },
    });

    expect(mocks.taskerCreate).toHaveBeenCalledWith(
      "executeAIPhoneCall",
      expect.objectContaining({ toNumber: "+15552222222", agentId: "agent" }),
      expect.objectContaining({ maxAttempts: 1 })
    );
  });

  it("creates an AI phone call task from form submissions", async () => {
    mocks.featureEnabled.mockResolvedValue(true);
    mocks.findUniqueStep.mockResolvedValue({
      agent: {
        id: "agent",
        providerAgentId: "provider",
        outboundPhoneNumbers: [{ phoneNumber: "+15551111111", subscriptionStatus: "ACTIVE" }],
      },
    });

    await scheduleAIPhoneCall({
      ...baseArgs,
      formData: {
        user: { email: "organizer@example.com" },
        responses: { attendeePhoneNumber: { value: "+15552222222" } },
      } as never,
      submittedPhoneNumber: "+15552222222",
      routedEventTypeId: 4,
    });

    expect(mocks.taskerCreate).toHaveBeenCalledWith(
      "executeAIPhoneCall",
      expect.objectContaining({ toNumber: "+15552222222", bookingUid: null }),
      expect.any(Object)
    );
  });

  it("handles AI phone call scheduling task failures", async () => {
    mocks.featureEnabled.mockResolvedValue(true);
    mocks.findUniqueStep.mockResolvedValue({
      agent: {
        id: "agent",
        providerAgentId: "provider",
        outboundPhoneNumbers: [{ phoneNumber: "+15551111111", subscriptionStatus: "ACTIVE" }],
      },
    });
    mocks.taskerCreate.mockRejectedValueOnce(new Error("tasker unavailable"));

    await scheduleAIPhoneCall({
      ...baseArgs,
      evt: event(),
      submittedPhoneNumber: "+15552222222",
      triggerEvent: WorkflowTriggerEvents.NEW_EVENT,
      timeSpan: { time: null, timeUnit: null },
    });

    expect(mocks.error).toHaveBeenCalled();
  });

  it("deletes AI reminders when task cancellation succeeds or no task exists", async () => {
    mocks.reminderFindUnique.mockResolvedValueOnce({ uuid: "ai-ref" });
    mocks.cancelWithReference.mockResolvedValueOnce("task-id");
    await deleteScheduledAIPhoneCall(1, null);

    mocks.reminderFindUnique.mockResolvedValueOnce({ uuid: null });
    await deleteScheduledAIPhoneCall(2, null);

    expect(mocks.reminderDelete).toHaveBeenCalledWith({ where: { id: 2 } });
  });
});
