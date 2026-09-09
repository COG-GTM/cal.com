import { describe, expect, it } from "vitest";
import { buildCalEvent, buildOrganizer, createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizerDailyVideoDownloadRecordingEmail from "./organizer-daily-video-download-recording-email";

describe("OrganizerDailyVideoDownloadRecordingEmail", () => {
  it("sends the recording link to the organizer in the organizer timezone", async () => {
    const organizer = buildOrganizer({
      language: {
        locale: "en",
        translate: createTranslator({ download_recording_subject: "Recording of {{title}} on {{date}}" }),
      },
    });
    const calEvent = buildCalEvent({ organizer, title: "Intro call" });

    const payload = await getPayload(
      new OrganizerDailyVideoDownloadRecordingEmail(calEvent, "https://daily.co/rec/2")
    );

    expect(payload.to).toBe("oliver@example.com>");
    expect(payload.subject).toBe("Recording of Intro call on 6:00am - 6:30am, saturday, june 1, 2024");
    expect(String(payload.html)).toContain("https://daily.co/rec/2");
  });
});
