import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendDailyVideoRecordingEmails, sendDailyVideoTranscriptEmails } from "./daily-video-emails";
import BaseEmail from "./templates/_base-email";
import AttendeeDailyVideoDownloadRecordingEmail from "./templates/attendee-daily-video-download-recording-email";
import AttendeeDailyVideoDownloadTranscriptEmail from "./templates/attendee-daily-video-download-transcript-email";
import OrganizerDailyVideoDownloadRecordingEmail from "./templates/organizer-daily-video-download-recording-email";
import OrganizerDailyVideoDownloadTranscriptEmail from "./templates/organizer-daily-video-download-transcript-email";
import { buildCalEvent, buildPerson } from "./test-utils/fixtures";

const sendEmail = vi.spyOn(BaseEmail.prototype, "sendEmail");

const calEvent = buildCalEvent({
  attendees: [buildPerson(), buildPerson({ id: 3, email: "bob@example.com", name: "Bob" })],
});

describe("daily-video-emails", () => {
  beforeEach(() => {
    sendEmail.mockResolvedValue("sent");
  });

  afterEach(() => {
    sendEmail.mockClear();
  });

  it("sends the recording link to the organizer and every attendee", async () => {
    await sendDailyVideoRecordingEmails(calEvent, "https://daily.co/rec/1");

    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(sendEmail.mock.instances[0]).toBeInstanceOf(OrganizerDailyVideoDownloadRecordingEmail);
    expect(sendEmail.mock.instances[1]).toBeInstanceOf(AttendeeDailyVideoDownloadRecordingEmail);
    expect(sendEmail.mock.instances[2]).toBeInstanceOf(AttendeeDailyVideoDownloadRecordingEmail);
  });

  it("sends transcripts to the organizer and every attendee", async () => {
    await sendDailyVideoTranscriptEmails(calEvent, ["https://daily.co/t/1"]);

    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(sendEmail.mock.instances[0]).toBeInstanceOf(OrganizerDailyVideoDownloadTranscriptEmail);
    expect(sendEmail.mock.instances[1]).toBeInstanceOf(AttendeeDailyVideoDownloadTranscriptEmail);
  });
});
