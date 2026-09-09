import { getPublicEvent } from "@calcom/features/eventtypes/lib/getPublicEvent";
import { EventRepository } from "@calcom/features/eventtypes/repositories/EventRepository";
import prisma from "@calcom/prisma";
import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/prisma", () => ({
  default: { eventType: {} },
}));

vi.mock("@calcom/features/eventtypes/lib/getPublicEvent", () => ({
  getPublicEvent: vi.fn(),
}));

describe("EventRepository.getPublicEvent", () => {
  it("passes the input, the prisma client and the user id through to getPublicEvent", async () => {
    const event = { id: 1 };
    vi.mocked(getPublicEvent).mockResolvedValue(event as Awaited<ReturnType<typeof getPublicEvent>>);

    const result = await EventRepository.getPublicEvent(
      {
        username: "alice",
        eventSlug: "thirty-min",
        isTeamEvent: true,
        org: "acme",
        fromRedirectOfNonOrgLink: false,
      },
      42
    );

    expect(getPublicEvent).toHaveBeenCalledWith("alice", "thirty-min", true, "acme", prisma, false, 42);
    expect(result).toBe(event);
  });

  it("leaves the user id undefined when it is not provided", async () => {
    vi.mocked(getPublicEvent).mockResolvedValue(null);

    const result = await EventRepository.getPublicEvent({
      username: "alice",
      eventSlug: "thirty-min",
      org: null,
      fromRedirectOfNonOrgLink: true,
    });

    expect(getPublicEvent).toHaveBeenCalledWith(
      "alice",
      "thirty-min",
      undefined,
      null,
      prisma,
      true,
      undefined
    );
    expect(result).toBeNull();
  });
});
