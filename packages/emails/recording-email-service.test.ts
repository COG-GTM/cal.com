import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendDailyVideoRecordingEmails, sendDailyVideoTranscriptEmails } from "./recording-email-service";
import BaseEmail from "./templates/_base-email";
import AttendeeDailyVideoDownloadRecordingEmail from "./templates/attendee-daily-video-download-recording-email";
import AttendeeDailyVideoDownloadTranscriptEmail from "./templates/attendee-daily-video-download-transcript-email";
import OrganizerDailyVideoDownloadRecordingEmail from "./templates/organizer-daily-video-download-recording-email";
import OrganizerDailyVideoDownloadTranscriptEmail from "./templates/organizer-daily-video-download-transcript-email";
import { buildCalEvent, buildPerson } from "./test-utils/fixtures";

const sendEmail = vi.spyOn(BaseEmail.prototype, "sendEmail");

const calEvent = buildCalEvent({ attendees: [buildPerson()] });

describe("recording-email-service", () => {
  beforeEach(() => {
    sendEmail.mockResolvedValue("sent");
  });

  afterEach(() => {
    sendEmail.mockClear();
  });

  it("emails the recording link to organizer and attendee", async () => {
    await sendDailyVideoRecordingEmails(calEvent, "https://daily.co/rec/1");

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.instances[0]).toBeInstanceOf(OrganizerDailyVideoDownloadRecordingEmail);
    expect(sendEmail.mock.instances[1]).toBeInstanceOf(AttendeeDailyVideoDownloadRecordingEmail);
  });

  it("emails the transcripts to organizer and attendee", async () => {
    await sendDailyVideoTranscriptEmails(calEvent, ["https://daily.co/t/1"]);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.instances[0]).toBeInstanceOf(OrganizerDailyVideoDownloadTranscriptEmail);
    expect(sendEmail.mock.instances[1]).toBeInstanceOf(AttendeeDailyVideoDownloadTranscriptEmail);
  });
});
