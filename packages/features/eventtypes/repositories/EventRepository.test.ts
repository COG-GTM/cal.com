import { getPublicEvent } from "@calcom/features/eventtypes/lib/getPublicEvent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventRepository } from "./EventRepository";

vi.mock("@calcom/features/eventtypes/lib/getPublicEvent", () => ({
  getPublicEvent: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  default: {},
}));

describe("EventRepository.getPublicEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the input object to getPublicEvent positional arguments", async () => {
    const event = { id: 1 };
    vi.mocked(getPublicEvent).mockResolvedValue(event as never);
    const input = {
      username: "alice",
      eventSlug: "meeting",
      isTeamEvent: undefined,
      org: null,
      fromRedirectOfNonOrgLink: false,
    };

    await expect(EventRepository.getPublicEvent(input, 7)).resolves.toBe(event);
    expect(getPublicEvent).toHaveBeenCalledWith(
      "alice",
      "meeting",
      undefined,
      null,
      expect.anything(),
      false,
      7
    );
  });

  it("passes through an omitted user id", async () => {
    vi.mocked(getPublicEvent).mockResolvedValue(null);

    await expect(
      EventRepository.getPublicEvent({
        username: "team",
        eventSlug: "event",
        isTeamEvent: true,
        org: "org",
        fromRedirectOfNonOrgLink: true,
      })
    ).resolves.toBeNull();

    expect(getPublicEvent).toHaveBeenCalledWith(
      "team",
      "event",
      true,
      "org",
      expect.anything(),
      true,
      undefined
    );
  });
});
