import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeDailyVideoDownloadRecordingEmail from "./attendee-daily-video-download-recording-email";

describe("AttendeeDailyVideoDownloadRecordingEmail", () => {
  it("sends the recording link to the attendee in their own timezone", async () => {
    const attendee = buildPerson({
      timeZone: "Europe/London",
      language: {
        locale: "en",
        translate: createTranslator({ download_recording_subject: "Recording of {{title}} on {{date}}" }),
      },
    });
    const calEvent = buildCalEvent({ attendees: [attendee], title: "Intro call" });

    const payload = await getPayload(
      new AttendeeDailyVideoDownloadRecordingEmail(calEvent, attendee, "https://daily.co/rec/1")
    );

    expect(payload.to).toBe("Anna Attendee <anna@example.com>");
    expect(payload.subject).toBe("Recording of Intro call on 11:00am - 11:30am, saturday, june 1, 2024");
    expect(String(payload.html)).toContain("https://daily.co/rec/1");
  });
});
