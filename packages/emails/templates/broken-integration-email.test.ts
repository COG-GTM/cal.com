import { describe, expect, it } from "vitest";
import { buildCalEvent, buildOrganizer, createTranslator, getPayload } from "../test-utils/fixtures";
import BrokenIntegrationEmail from "./broken-integration-email";

const organizer = buildOrganizer({
  language: {
    locale: "en",
    translate: createTranslator({
      confirmed_event_type_subject: "{{eventType}} with {{name}} on {{date}}",
    }),
  },
});

describe("BrokenIntegrationEmail", () => {
  it("flags the calendar failure to the organizer only", async () => {
    const calEvent = buildCalEvent({ organizer, type: "30min" });

    const payload = await getPayload(new BrokenIntegrationEmail(calEvent, "calendar"));

    expect(payload.to).toBe("oliver@example.com");
    expect(payload.subject).toBe(
      "[Action Required] 30min with Anna Attendee on 6:00am - 6:30am, saturday, june 1, 2024"
    );
    expect(payload.text).toContain("new_event_scheduled");
    expect(String(payload.html)).toContain("broken_integration");
  });

  it("renders the video variant when the video integration broke", async () => {
    const calEvent = buildCalEvent({ organizer, location: "Zoom" });

    const payload = await getPayload(new BrokenIntegrationEmail(calEvent, "video"));

    expect(String(payload.html)).toContain("broken_video_action");
  });
});
