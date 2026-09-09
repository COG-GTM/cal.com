import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCalEvent, buildOrganizer, createTranslator, getPayload } from "../test-utils/fixtures";
import OrganizerRequestEmail from "./organizer-request-email";

const checkIfUserHasFeatureController = vi.fn();

vi.mock("@calcom/features/flags/operations/check-if-user-has-feature.controller", () => ({
  checkIfUserHasFeatureController: (userId?: number, feature?: string) =>
    checkIfUserHasFeatureController(userId, feature),
}));

const organizer = buildOrganizer({
  language: {
    locale: "en",
    translate: createTranslator({
      awaiting_approval: "Awaiting approval",
      someone_requested_an_event: "Someone requested an event",
      confirm_or_reject_request: "Confirm or reject",
    }),
  },
});

describe("OrganizerRequestEmail", () => {
  beforeAll(() => {
    vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "a".repeat(32));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    checkIfUserHasFeatureController.mockReset();
    checkIfUserHasFeatureController.mockResolvedValue(false);
  });

  it("asks the organizer to approve the booking", async () => {
    const calEvent = buildCalEvent({ organizer, title: "Intro call" });

    const payload = await getPayload(new OrganizerRequestEmail({ calEvent }));

    expect(payload.subject).toBe("Awaiting approval: Intro call");
    expect(payload.to).toBe("oliver@example.com");
    expect(payload.text).toContain("Someone requested an event");
    expect(payload.text).toContain("Confirm or reject");
    expect(payload.text).toContain("/bookings/upcoming");
    expect(String(payload.html)).toContain("/api/link/?token=");
  });

  it("links to the recurring bookings list for recurring events", async () => {
    const calEvent = buildCalEvent({ organizer, recurringEvent: { count: 3, freq: 0, interval: 1 } });

    const payload = await getPayload(new OrganizerRequestEmail({ calEvent }));

    expect(payload.text).toContain("/bookings/recurring");
  });

  it("renders the v2 template when the organizer has the feature flag", async () => {
    checkIfUserHasFeatureController.mockResolvedValue(true);
    const calEvent = buildCalEvent({ organizer });

    const payload = await getPayload(new OrganizerRequestEmail({ calEvent }));

    expect(checkIfUserHasFeatureController).toHaveBeenCalledWith(organizer.id, "organizer-request-email-v2");
    expect(String(payload.html)).toContain("/api/verify-booking-token/");
  });
});
