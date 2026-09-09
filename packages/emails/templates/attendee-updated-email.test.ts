import { describe, expect, it } from "vitest";
import { buildCalEvent, buildPerson, createTranslator, getPayload } from "../test-utils/fixtures";
import AttendeeUpdatedEmail from "./attendee-updated-email";

describe("AttendeeUpdatedEmail", () => {
  it("tells the attendee the event changed and excludes them from the reply-to list", async () => {
    const attendee = buildPerson({
      language: {
        locale: "en",
        translate: createTranslator({ event_type_has_been_updated: "{{title}} was updated" }),
      },
    });
    const other = buildPerson({ id: 3, name: "Bob", email: "bob@example.com" });
    const calEvent = buildCalEvent({ attendees: [attendee, other], title: "Intro call" });

    const payload = await getPayload(new AttendeeUpdatedEmail(calEvent, attendee));

    expect(payload.subject).toBe("Intro call was updated");
    expect(payload.to).toBe("Anna Attendee <anna@example.com>");
    expect(JSON.stringify(payload)).not.toContain('replyTo":"anna@example.com');
    expect(payload.text).toContain("event_has_been_updated");
  });
});
