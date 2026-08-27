import { sendCustomWorkflowEmail } from "@calcom/emails/workflow-email-service";
import tasker from "@calcom/features/tasker";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendOrScheduleWorkflowEmails } from "../emailProvider";

vi.mock("@calcom/emails/workflow-email-service", () => ({ sendCustomWorkflowEmail: vi.fn() }));
vi.mock("@calcom/features/tasker", () => ({ default: { create: vi.fn() } }));

const mailData = {
  to: ["attendee@example.com", "organizer@example.com"],
  subject: "Reminder",
  html: "<p>Reminder</p>",
  sender: "Cal",
  replyTo: "reply@example.com",
};

describe("sendOrScheduleWorkflowEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends one email per recipient when there is no send date", async () => {
    await sendOrScheduleWorkflowEmails(mailData);

    expect(sendCustomWorkflowEmail).toHaveBeenCalledTimes(2);
    expect(sendCustomWorkflowEmail).toHaveBeenCalledWith({
      to: "attendee@example.com",
      subject: mailData.subject,
      html: mailData.html,
      sender: mailData.sender,
      replyTo: mailData.replyTo,
      attachments: undefined,
    });
    expect(tasker.create).not.toHaveBeenCalled();
  });

  it("schedules a task for a future send date", async () => {
    const sendAt = new Date(Date.now() + 60_000);

    await sendOrScheduleWorkflowEmails({ ...mailData, sendAt, referenceUid: "reference-uid" });

    expect(tasker.create).toHaveBeenCalledWith("sendWorkflowEmails", mailData, {
      scheduledAt: sendAt,
      referenceUid: "reference-uid",
    });
    expect(sendCustomWorkflowEmail).not.toHaveBeenCalled();
  });

  it("drops emails whose send date has already passed", async () => {
    await sendOrScheduleWorkflowEmails({ ...mailData, sendAt: new Date(Date.now() - 60_000) });

    expect(tasker.create).not.toHaveBeenCalled();
    expect(sendCustomWorkflowEmail).not.toHaveBeenCalled();
  });
});
