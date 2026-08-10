import { TimeFormat } from "@calcom/lib/timeFormat";
import { WorkflowActions, WorkflowTemplates } from "@calcom/prisma/enums";
import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import emailRatingTemplate from "./emailRatingTemplate";
import emailReminderTemplate from "./emailReminderTemplate";
import plainTextTemplates from "./plainTextTemplates";
import smsReminderTemplate from "./smsReminderTemplate";
import * as whatsappTemplates from "./whatsapp";
import { getContentSidForTemplate, getContentVariablesForTemplate } from "./whatsapp/ContentSidMapping";
import { whatsappEventCancelledTemplate } from "./whatsapp/whatsappEventCancelledTemplate";
import { whatsappEventCompletedTemplate } from "./whatsapp/whatsappEventCompletedTemplate";
import { whatsappReminderTemplate } from "./whatsapp/whatsappEventReminderTemplate";
import { whatsappEventRescheduledTemplate } from "./whatsapp/whatsappEventRescheduledTemplate";

const t = ((key: string) => key) as unknown as TFunction;
const startTime = "2025-06-15T10:00:00Z";
const endTime = "2025-06-15T11:00:00Z";

describe("reminder templates", () => {
  it("renders an editable email reminder with action-specific placeholders", () => {
    const result = emailReminderTemplate({
      isEditingMode: true,
      locale: "en",
      t,
      action: WorkflowActions.EMAIL_ATTENDEE,
      timeFormat: TimeFormat.TWELVE_HOUR,
    });

    expect(result.emailSubject).toContain("{EVENT_NAME}");
    expect(result.emailSubject).toContain("{EVENT_DATE_ddd, MMM D, YYYY h:mma}");
    expect(result.emailBody).toContain("{ATTENDEE}");
    expect(result.emailBody).toContain("{ORGANIZER}");
    expect(result.emailBody).toContain("{LOCATION} {MEETING_URL}");
  });

  it("renders a localized email reminder and optional branding", () => {
    const result = emailReminderTemplate({
      isEditingMode: false,
      locale: "en",
      t,
      startTime,
      endTime,
      eventName: "Planning",
      timeZone: "America/New_York",
      location: "Google Meet",
      meetingUrl: "https://meet.example.com",
      otherPerson: "Alex",
      name: "Sam",
      isBrandingDisabled: false,
    });

    expect(result.emailSubject).toMatch(/^reminder: Planning - /);
    expect(result.emailBody).toContain("Google Meet https://meet.example.com");
    expect(result.emailBody).toContain("scheduling_by Cal.com");
  });

  it("renders editable and live rating emails", () => {
    const editing = emailRatingTemplate({
      isEditingMode: true,
      locale: "en",
      action: WorkflowActions.EMAIL_ATTENDEE,
      t,
    });
    const live = emailRatingTemplate({
      isEditingMode: false,
      locale: "en",
      action: WorkflowActions.EMAIL_HOST,
      t,
      startTime,
      endTime,
      eventName: "Planning",
      timeZone: "UTC",
      organizer: "Organizer",
      name: "Attendee",
      ratingUrl: "https://rate.example.com",
      noShowUrl: "https://noshow.example.com",
      isBrandingDisabled: true,
    });

    expect(editing.emailBody).toContain("{RATING_URL}=5");
    expect(editing.emailBody).toContain("{NO_SHOW_URL}");
    expect(live.emailSubject).toBe("experience_review_prompt Planning");
    expect(live.emailBody).toContain("https://rate.example.com=1");
    expect(live.emailBody).not.toContain("Scheduling by");
  });

  it("renders SMS reminders in editable and compact live forms", () => {
    const editing = smsReminderTemplate(
      true,
      "en",
      WorkflowActions.SMS_ATTENDEE,
      TimeFormat.TWELVE_HOUR,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );
    const live = smsReminderTemplate(
      false,
      "en",
      WorkflowActions.SMS_NUMBER,
      TimeFormat.TWENTY_FOUR_HOUR,
      startTime,
      "Planning",
      "UTC",
      "Alex",
      "Sam"
    );

    expect(editing).toContain("{EVENT_NAME}");
    expect(editing).toContain("{ATTENDEE}");
    expect(live).toContain("Planning");
    expect(live).toContain("UTC");
  });

  it("falls back to the shorter SMS template and rejects oversized messages", () => {
    const longEvent = "x".repeat(1000);
    const compact = smsReminderTemplate(
      false,
      "en",
      WorkflowActions.SMS_NUMBER,
      TimeFormat.TWELVE_HOUR,
      startTime,
      longEvent,
      "UTC",
      "Alex",
      "Sam"
    );
    const oversized = smsReminderTemplate(
      false,
      "en",
      WorkflowActions.SMS_NUMBER,
      TimeFormat.TWELVE_HOUR,
      startTime,
      "x".repeat(2000),
      "UTC",
      "y".repeat(2000),
      "z".repeat(2000)
    );

    expect(compact).not.toContain(longEvent);
    expect(compact).toContain("with Alex");
    expect(oversized).toBeNull();
  });

  it("renders all WhatsApp event variants in edit and live modes", () => {
    const templates = [
      whatsappReminderTemplate,
      whatsappEventCancelledTemplate,
      whatsappEventCompletedTemplate,
      whatsappEventRescheduledTemplate,
    ];

    for (const template of templates) {
      const editing = template(
        true,
        "en",
        WorkflowActions.WHATSAPP_ATTENDEE,
        TimeFormat.TWELVE_HOUR,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      );
      const live = template(
        false,
        "en",
        WorkflowActions.WHATSAPP_NUMBER,
        TimeFormat.TWENTY_FOUR_HOUR,
        startTime,
        "Planning",
        "UTC",
        "Alex",
        "Sam"
      );

      expect(editing).toContain("{EVENT_NAME}");
      expect(editing).toContain("{ATTENDEE}");
      expect(live).toContain("Planning");
      expect(live).toContain("UTC");
    }
  });

  it("returns null when WhatsApp content exceeds the provider limit", () => {
    const result = whatsappReminderTemplate(
      false,
      "en",
      WorkflowActions.WHATSAPP_NUMBER,
      TimeFormat.TWELVE_HOUR,
      startTime,
      "x".repeat(2000),
      "UTC",
      "y".repeat(2000),
      "z".repeat(2000)
    );

    expect(result).toBeNull();
  });

  it("maps WhatsApp templates to configured content SIDs", () => {
    vi.stubEnv("TWILIO_WHATSAPP_REMINDER_CONTENT_SID", "reminder-sid");
    vi.stubEnv("TWILIO_WHATSAPP_CANCELLED_CONTENT_SID", "cancelled-sid");
    vi.stubEnv("TWILIO_WHATSAPP_RESCHEDULED_CONTENT_SID", "rescheduled-sid");
    vi.stubEnv("TWILIO_WHATSAPP_COMPLETED_CONTENT_SID", "completed-sid");

    expect(getContentSidForTemplate()).toBe("reminder-sid");
    expect(getContentSidForTemplate(WorkflowTemplates.REMINDER)).toBe("reminder-sid");
    expect(getContentSidForTemplate(WorkflowTemplates.CANCELLED)).toBe("cancelled-sid");
    expect(getContentSidForTemplate(WorkflowTemplates.RESCHEDULED)).toBe("rescheduled-sid");
    expect(getContentSidForTemplate(WorkflowTemplates.COMPLETED)).toBe("completed-sid");
    expect(
      getContentVariablesForTemplate({ name: "Sam", attendeeName: "Alex", eventName: "Planning" })
    ).toEqual({
      "1": "Sam",
      "2": "Alex",
      "3": "Planning",
      "4": "",
      "5": " ",
    });
  });

  it("exposes the plain text templates used by each reminder channel", () => {
    expect(plainTextTemplates.email.reminder).toContain("{EVENT_NAME}");
    expect(plainTextTemplates.email.rating).toContain("experience");
    expect(plainTextTemplates.sms.reminder).toContain("{EVENT_TIME");
    expect(plainTextTemplates.whatsapp.reminder).toContain("{START_TIME");
    expect(plainTextTemplates.whatsapp.rescheduled).toContain("rescheduled");
    expect(plainTextTemplates.whatsapp.completed).toContain("attending");
    expect(plainTextTemplates.whatsapp.canceled).toContain("canceled");
    expect(whatsappTemplates.whatsappReminderTemplate).toBeTypeOf("function");
  });
});
