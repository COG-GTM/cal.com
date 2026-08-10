import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scheduleSMSReminder: vi.fn(),
  scheduleEmailReminder: vi.fn(),
  scheduleWhatsappReminder: vi.fn(),
  scheduleAIPhoneCall: vi.fn(),
  scheduleLazyEmailWorkflow: vi.fn(),
  generateCommon: vi.fn(() => ({ creditCheckFn: vi.fn() })),
  formatEvent: vi.fn((event: unknown) => event),
  smsRateLimit: vi.fn(),
  findSeat: vi.fn(),
  generateEmailParams: vi.fn().mockResolvedValue({ verifiedAt: new Date() }),
  repositoryFind: vi.fn().mockResolvedValue([]),
  repositoryUpdate: vi.fn(),
  cancelSMS: vi.fn(),
  getMessageBody: vi.fn().mockResolvedValue("message"),
  sendEmail: vi.fn(),
}));

vi.mock("@calcom/features/ee/workflows/lib/reminders/smsReminderManager", () => ({
  scheduleSMSReminder: mocks.scheduleSMSReminder,
}));
vi.mock("@calcom/features/ee/workflows/lib/reminders/emailReminderManager", () => ({
  scheduleEmailReminder: mocks.scheduleEmailReminder,
}));
vi.mock("@calcom/features/ee/workflows/lib/reminders/whatsappReminderManager", () => ({
  scheduleWhatsappReminder: mocks.scheduleWhatsappReminder,
}));
vi.mock("@calcom/features/ee/workflows/lib/reminders/aiPhoneCallManager", () => ({
  scheduleAIPhoneCall: mocks.scheduleAIPhoneCall,
}));
vi.mock("@calcom/features/ee/workflows/lib/service/WorkflowService", () => ({
  WorkflowService: {
    generateCommonScheduleFunctionParams: mocks.generateCommon,
    scheduleLazyEmailWorkflow: mocks.scheduleLazyEmailWorkflow,
  },
}));
vi.mock("@calcom/features/ee/workflows/lib/service/EmailWorkflowService", () => ({
  EmailWorkflowService: class {
    generateParametersToBuildEmailWorkflowContent = mocks.generateEmailParams;
  },
}));
vi.mock("@calcom/features/ee/workflows/repositories/WorkflowReminderRepository", () => ({
  WorkflowReminderRepository: class {
    findScheduledMessagesToCancel = mocks.repositoryFind;
    updateRemindersToEmail = mocks.repositoryUpdate;
  },
}));
vi.mock("@calcom/features/bookings/repositories/BookingSeatRepository", () => ({
  BookingSeatRepository: class {
    getByReferenceUidWithAttendeeDetails = mocks.findSeat;
  },
}));
vi.mock("@calcom/lib/formatCalendarEvent", () => ({ formatCalEventExtended: mocks.formatEvent }));
vi.mock("@calcom/lib/smsLockState", () => ({ checkSMSRateLimit: mocks.smsRateLimit }));
vi.mock("@calcom/lib/sentryWrapper", () => ({
  withReporting: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn(async () => (key: string) => key),
}));
vi.mock("@calcom/features/ee/workflows/lib/reminders/providers/twilioProvider", () => ({
  cancelSMS: mocks.cancelSMS,
  getMessageBody: mocks.getMessageBody,
}));
vi.mock("@calcom/features/ee/workflows/lib/reminders/providers/emailProvider", () => ({
  sendOrScheduleWorkflowEmails: mocks.sendEmail,
}));
vi.mock("@calcom/prisma", () => ({ prisma: {} }));

import { WorkflowActions, WorkflowTriggerEvents } from "@calcom/prisma/enums";
import {
  cancelScheduledMessagesAndScheduleEmails,
  scheduleWorkflowReminders,
  sendCancelledReminders,
} from "./reminderScheduler";

function event() {
  return {
    uid: "booking-1",
    title: "Planning",
    attendees: [{ email: "attendee@example.com", phoneNumber: "+15550000000", locale: "en" }],
    organizer: { email: "organizer@example.com" },
  };
}

function workflow(action: WorkflowActions, trigger: WorkflowTriggerEvents = WorkflowTriggerEvents.NEW_EVENT) {
  return {
    id: 1,
    userId: 3,
    teamId: null,
    trigger,
    time: null,
    timeUnit: null,
    steps: [
      {
        id: 12,
        action,
        verifiedAt: new Date(),
        reminderBody: "Hello",
        sendTo: "+15550000000",
        sender: "",
      },
    ],
  } as never;
}

describe("reminder scheduler dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateEmailParams.mockResolvedValue({ verifiedAt: new Date() });
    mocks.repositoryFind.mockResolvedValue([]);
  });

  it("returns early for dry runs, empty workflows, and empty workflow steps", async () => {
    const creditCheckFn = vi.fn();
    await scheduleWorkflowReminders({
      workflows: [],
      smsReminderNumber: null,
      isDryRun: true,
      creditCheckFn,
      calendarEvent: event() as never,
    });
    await scheduleWorkflowReminders({
      workflows: [{ steps: [] }] as never[],
      smsReminderNumber: null,
      creditCheckFn,
      calendarEvent: event() as never,
    });

    expect(mocks.generateCommon).not.toHaveBeenCalled();
  });

  it("dispatches SMS, WhatsApp, and Cal AI event steps", async () => {
    const args = {
      smsReminderNumber: "+15550000000",
      creditCheckFn: vi.fn(),
      calendarEvent: event() as never,
    };

    await scheduleWorkflowReminders({ ...args, workflows: [workflow(WorkflowActions.SMS_NUMBER)] });
    await scheduleWorkflowReminders({ ...args, workflows: [workflow(WorkflowActions.WHATSAPP_NUMBER)] });
    await scheduleWorkflowReminders({ ...args, workflows: [workflow(WorkflowActions.CAL_AI_PHONE_CALL)] });

    expect(mocks.scheduleSMSReminder).toHaveBeenCalledWith(
      expect.objectContaining({ reminderPhone: "+15550000000", action: WorkflowActions.SMS_NUMBER })
    );
    expect(mocks.scheduleWhatsappReminder).toHaveBeenCalledWith(
      expect.objectContaining({ reminderPhone: "+15550000000", action: WorkflowActions.WHATSAPP_NUMBER })
    );
    expect(mocks.scheduleAIPhoneCall).toHaveBeenCalledWith(
      expect.objectContaining({ submittedPhoneNumber: "+15550000000" })
    );

    mocks.findSeat.mockResolvedValue({ attendee: { phoneNumber: "+15551111111" } });
    await scheduleWorkflowReminders({
      ...args,
      seatReferenceUid: "seat-1",
      workflows: [workflow(WorkflowActions.SMS_ATTENDEE)],
    });
    expect(mocks.findSeat).toHaveBeenCalledWith("seat-1");
  });

  it("uses lazy email scheduling for before-event and after-event email workflows", async () => {
    const args = {
      smsReminderNumber: null,
      creditCheckFn: vi.fn(),
      calendarEvent: event() as never,
    };

    await scheduleWorkflowReminders({
      ...args,
      workflows: [workflow(WorkflowActions.EMAIL_ATTENDEE, WorkflowTriggerEvents.BEFORE_EVENT)],
    });

    expect(mocks.scheduleLazyEmailWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowStepId: 12,
        workflowTriggerEvent: WorkflowTriggerEvents.BEFORE_EVENT,
      })
    );
    expect(mocks.scheduleEmailReminder).not.toHaveBeenCalled();

    await scheduleWorkflowReminders({
      ...args,
      workflows: [workflow(WorkflowActions.EMAIL_ATTENDEE, WorkflowTriggerEvents.NEW_EVENT)],
    });
    expect(mocks.scheduleEmailReminder).toHaveBeenCalled();
  });

  it("builds email parameters for form email actions and ignores unsupported form host email", async () => {
    const formData = {
      user: { email: "organizer@example.com", locale: "en", timeFormat: "h:mma" },
      responses: {},
    };
    const args = {
      smsReminderNumber: null,
      creditCheckFn: vi.fn(),
      formData: formData as never,
    };

    await scheduleWorkflowReminders({
      ...args,
      workflows: [workflow(WorkflowActions.EMAIL_HOST)],
    });
    expect(mocks.scheduleEmailReminder).not.toHaveBeenCalled();

    await scheduleWorkflowReminders({
      ...args,
      workflows: [workflow(WorkflowActions.EMAIL_ATTENDEE)],
    });
    expect(mocks.generateEmailParams).toHaveBeenCalled();
    expect(mocks.scheduleEmailReminder).toHaveBeenCalledWith({ verifiedAt: expect.any(Date) });
  });

  it("sends cancelled reminders only for cancellation-triggered workflows", async () => {
    await sendCancelledReminders({
      workflows: [
        workflow(WorkflowActions.SMS_NUMBER, WorkflowTriggerEvents.EVENT_CANCELLED),
        workflow(WorkflowActions.SMS_NUMBER, WorkflowTriggerEvents.NEW_EVENT),
      ],
      smsReminderNumber: "+15550000000",
      evt: event() as never,
      creditCheckFn: vi.fn(),
    });

    expect(mocks.scheduleSMSReminder).toHaveBeenCalledTimes(1);
  });

  it("cancels scheduled SMS and creates email replacements", async () => {
    mocks.repositoryFind.mockResolvedValue([
      {
        id: 1,
        referenceId: "SM123",
        uuid: "uuid-1",
        scheduledDate: new Date("2030-01-01T12:00:00Z"),
        workflowStep: { action: WorkflowActions.SMS_ATTENDEE },
        booking: {
          attendees: [{ email: "attendee@example.com", locale: "en" }],
          user: { email: "organizer@example.com" },
        },
      },
    ]);

    await cancelScheduledMessagesAndScheduleEmails({ teamId: 7, userIdsWithNoCredits: [3] });

    expect(mocks.cancelSMS).toHaveBeenCalledWith("SM123");
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["attendee@example.com"], referenceUid: "uuid-1" })
    );
    expect(mocks.repositoryUpdate).toHaveBeenCalledWith({ reminderIds: [1] });
  });
});
