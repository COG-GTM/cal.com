import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildCalEvent, buildOrganizer, createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizerRequestReminderEmail from "./organizer-request-reminder-email";

vi.mock("@calcom/features/flags/operations/check-if-user-has-feature.controller", () => ({
  checkIfUserHasFeatureController: vi.fn().mockResolvedValue(false),
}));

describe("OrganizerRequestReminderEmail", () => {
  beforeAll(() => {
    vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "a".repeat(32));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("reminds the organizer that a booking is still awaiting approval", async () => {
    const organizer = buildOrganizer({
      language: {
        locale: "en",
        translate: createTranslator({
          event_awaiting_approval_subject: "Still awaiting approval: {{title}}",
          someone_requested_an_event: "Someone requested an event",
          confirm_or_reject_request: "Confirm or reject",
        }),
      },
    });
    const calEvent = buildCalEvent({ organizer, title: "Intro call" });

    const payload = await getPayload(new OrganizerRequestReminderEmail({ calEvent }));

    expect(payload.subject).toBe("Still awaiting approval: Intro call");
    expect(payload.text).toContain("event_still_awaiting_approval");
    expect(payload.icalEvent).toBeUndefined();
  });
});
