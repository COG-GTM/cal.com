import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCalEvent, buildOrganizer, createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizerDailyVideoDownloadTranscriptEmail from "./organizer-daily-video-download-transcript-email";

const organizer = buildOrganizer({
  language: {
    locale: "en",
    translate: createTranslator({ download_transcript_email_subject: "Transcript of {{title}}" }),
  },
});

describe("OrganizerDailyVideoDownloadTranscriptEmail", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new TextEncoder().encode("WEBVTT")))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches the fetched transcript for the organizer", async () => {
    const calEvent = buildCalEvent({ organizer, title: "Intro call" });

    const payload = await getPayload(
      new OrganizerDailyVideoDownloadTranscriptEmail(calEvent, ["https://daily.co/t/9"])
    );

    expect(payload.to).toBe("oliver@example.com>");
    expect(payload.subject).toBe("Transcript of Intro call");
    expect(payload.attachments).toEqual([
      { filename: "transcript-1.vtt", content: Buffer.from("WEBVTT"), contentType: "text/vtt" },
    ]);
  });
});
