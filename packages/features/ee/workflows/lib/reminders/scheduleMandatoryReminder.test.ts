import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scheduleEmailReminder: vi.fn(),
  createSpan: vi.fn(() => "span"),
  tracingError: vi.fn(),
  getTracingLogger: vi.fn(() => ({ error: mocks.tracingError })),
}));

vi.mock("@calcom/features/ee/workflows/lib/reminders/emailReminderManager", () => ({
  scheduleEmailReminder: mocks.scheduleEmailReminder,
}));
vi.mock("@calcom/lib/tracing/factory", () => ({
  distributedTracing: {
    createSpan: mocks.createSpan,
    getTracingLogger: mocks.getTracingLogger,
  },
}));
vi.mock("@calcom/lib/sentryWrapper", () => ({
  withReporting: (fn: (...args: unknown[]) => unknown) => fn,
}));

import { TimeUnit, WorkflowActions, WorkflowTemplates, WorkflowTriggerEvents } from "@calcom/prisma/enums";
import type { ExtendedCalendarEvent } from "./reminderScheduler";
import { scheduleMandatoryReminder } from "./scheduleMandatoryReminder";

function event(overrides: Record<string, unknown> = {}) {
  return {
    title: "Planning",
    attendees: [
      { email: "attendee@gmail.com", timeZone: "UTC", language: { locale: "en" } },
      { email: "other@example.com", timeZone: "UTC", language: { locale: "en" } },
    ],
    organizer: { id: 3 },
    ...overrides,
  } as unknown as ExtendedCalendarEvent;
}

describe("scheduleMandatoryReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing for dry runs and platform no-email events", async () => {
    await scheduleMandatoryReminder({
      evt: event(),
      workflows: [],
      requiresConfirmation: false,
      hideBranding: false,
      seatReferenceUid: undefined,
      isDryRun: true,
      traceContext: {} as never,
    });
    await scheduleMandatoryReminder({
      evt: event(),
      workflows: [],
      requiresConfirmation: false,
      hideBranding: false,
      seatReferenceUid: undefined,
      isPlatformNoEmail: true,
      traceContext: {} as never,
    });

    expect(mocks.scheduleEmailReminder).not.toHaveBeenCalled();
  });

  it("schedules a one-hour Gmail reminder when no matching workflow exists", async () => {
    await scheduleMandatoryReminder({
      evt: event(),
      workflows: [],
      requiresConfirmation: false,
      hideBranding: true,
      seatReferenceUid: "seat-1",
      traceContext: {} as never,
    });

    expect(mocks.scheduleEmailReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerEvent: WorkflowTriggerEvents.BEFORE_EVENT,
        action: WorkflowActions.EMAIL_ATTENDEE,
        template: WorkflowTemplates.REMINDER,
        sendTo: ["attendee@gmail.com"],
        hideBranding: true,
        seatReferenceUid: "seat-1",
        timeSpan: { time: 1, timeUnit: TimeUnit.HOUR },
      })
    );
  });

  it("does not schedule when confirmation is required or a matching workflow exists", async () => {
    const workflow = {
      trigger: WorkflowTriggerEvents.BEFORE_EVENT,
      time: 12,
      timeUnit: TimeUnit.HOUR,
      steps: [{ action: WorkflowActions.EMAIL_ATTENDEE }],
    };

    await scheduleMandatoryReminder({
      evt: event(),
      workflows: [workflow] as never[],
      requiresConfirmation: false,
      hideBranding: false,
      seatReferenceUid: undefined,
      traceContext: {} as never,
    });
    await scheduleMandatoryReminder({
      evt: event(),
      workflows: [],
      requiresConfirmation: true,
      hideBranding: false,
      seatReferenceUid: undefined,
      traceContext: {} as never,
    });

    expect(mocks.scheduleEmailReminder).not.toHaveBeenCalled();
  });

  it("accepts minute-based workflows at the twelve-hour boundary", async () => {
    await scheduleMandatoryReminder({
      evt: event(),
      workflows: [
        {
          trigger: WorkflowTriggerEvents.BEFORE_EVENT,
          time: 720,
          timeUnit: TimeUnit.MINUTE,
          steps: [{ action: WorkflowActions.EMAIL_ATTENDEE }],
        },
      ] as never[],
      requiresConfirmation: false,
      hideBranding: false,
      seatReferenceUid: undefined,
      traceContext: {} as never,
    });

    expect(mocks.scheduleEmailReminder).not.toHaveBeenCalled();
  });

  it("reports errors from mandatory reminder scheduling", async () => {
    mocks.scheduleEmailReminder.mockRejectedValueOnce(new Error("mailer unavailable"));
    await scheduleMandatoryReminder({
      evt: event(),
      workflows: [{ trigger: WorkflowTriggerEvents.AFTER_EVENT, steps: [] }] as never[],
      requiresConfirmation: false,
      hideBranding: false,
      seatReferenceUid: undefined,
      traceContext: {} as never,
    });

    expect(mocks.tracingError).toHaveBeenCalled();
  });

  it("reports errors while evaluating workflows", async () => {
    const workflows = {
      some: () => {
        throw new Error("invalid workflow");
      },
    };
    await scheduleMandatoryReminder({
      evt: event(),
      workflows: workflows as never,
      requiresConfirmation: false,
      hideBranding: false,
      seatReferenceUid: undefined,
      traceContext: {} as never,
    });

    expect(mocks.tracingError).toHaveBeenCalled();
  });
});
