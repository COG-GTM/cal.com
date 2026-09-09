import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeDailyVideoDownloadTranscriptEmail from "./attendee-daily-video-download-transcript-email";

const attendee = buildPerson({
  timeZone: "Europe/London",
  language: {
    locale: "en",
    translate: createTranslator({ download_transcript_email_subject: "Transcript of {{title}}" }),
  },
});

describe("AttendeeDailyVideoDownloadTranscriptEmail", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new TextEncoder().encode("WEBVTT")))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads every transcript and attaches it as a vtt file", async () => {
    const calEvent = buildCalEvent({ attendees: [attendee], title: "Intro call" });

    const payload = await getPayload(
      new AttendeeDailyVideoDownloadTranscriptEmail(calEvent, attendee, [
        "https://daily.co/t/1",
        "https://daily.co/t/2",
      ])
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(payload.subject).toBe("Transcript of Intro call");
    expect(payload.attachments).toEqual([
      { filename: "transcript-1.vtt", content: Buffer.from("WEBVTT"), contentType: "text/vtt" },
      { filename: "transcript-2.vtt", content: Buffer.from("WEBVTT"), contentType: "text/vtt" },
    ]);
    expect(String(payload.html)).toContain("Transcript 2");
  });
});
