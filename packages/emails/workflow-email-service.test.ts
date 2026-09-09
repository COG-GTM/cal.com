import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BaseEmail from "./templates/_base-email";
import BookingRedirectEmailNotification from "./templates/booking-redirect-notification";
import FeedbackEmail from "./templates/feedback-email";
import MonthlyDigestEmail from "./templates/monthly-digest-email";
import WorkflowEmail from "./templates/workflow-email";
import { createTranslator } from "./test-utils/fixtures";
import {
  sendBookingRedirectNotification,
  sendCustomWorkflowEmail,
  sendFeedbackEmail,
  sendMonthlyDigestEmail,
} from "./workflow-email-service";

const sendEmail = vi.spyOn(BaseEmail.prototype, "sendEmail");
const language = createTranslator();

describe("workflow-email-service", () => {
  beforeEach(() => {
    sendEmail.mockResolvedValue("sent");
  });

  afterEach(() => {
    sendEmail.mockClear();
  });

  it("sends product feedback to the feedback inbox", async () => {
    await sendFeedbackEmail({ username: "anna", email: "anna@example.com", rating: "5", comment: "Great" });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.instances[0]).toBeInstanceOf(FeedbackEmail);
  });

  it("sends a custom workflow email", async () => {
    await sendCustomWorkflowEmail({
      to: "anna@example.com",
      subject: "Reminder",
      html: "<p>See you soon</p>",
      replyTo: "oliver@example.com",
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(WorkflowEmail);
  });

  it("sends the monthly digest", async () => {
    await sendMonthlyDigestEmail({
      language,
      Created: 1,
      Completed: 1,
      Rescheduled: 0,
      Cancelled: 0,
      mostBookedEvents: [],
      membersWithMostBookings: [],
      admin: { email: "admin@acme.com", name: "Admin" },
      team: { name: "Acme", id: 1 },
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(MonthlyDigestEmail);
  });

  it("notifies about an out-of-office booking redirect", async () => {
    await sendBookingRedirectNotification({
      language,
      fromEmail: "anna@example.com",
      eventOwner: "Anna",
      toEmail: "oliver@example.com",
      toName: "Oliver",
      dates: "June 1 - June 5",
      action: "add",
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(BookingRedirectEmailNotification);
  });
});
