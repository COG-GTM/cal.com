import type { HashedLinkService } from "@calcom/features/hashedLink/lib/service/HashedLinkService";
import { describe, expect, it, vi } from "vitest";
import { validateBookingTimeIsWithinHashedLinkWindow } from "../validateBookingTimeIsWithinHashedLinkWindow";

describe("validateBookingTimeIsWithinHashedLinkWindow", () => {
  const bookingWindow = {
    eventTypeId: 1,
    bookingWindowStart: new Date("2026-08-20T08:00:00.000Z"),
    bookingWindowEnd: new Date("2026-08-20T14:00:00.000Z"),
  };

  const getService = (): HashedLinkService =>
    ({
      validate: vi.fn().mockResolvedValue(bookingWindow),
    }) as unknown as HashedLinkService;

  it("accepts a booking fully inside the window", async () => {
    await expect(
      validateBookingTimeIsWithinHashedLinkWindow({
        hashedLink: "private-link",
        eventTypeId: 1,
        reqBodyStart: "2026-08-20T09:00:00.000Z",
        reqBodyEnd: "2026-08-20T10:00:00.000Z",
        hashedLinkService: getService(),
      })
    ).resolves.toBeUndefined();
  });

  it("rejects a booking outside or partially overlapping the window", async () => {
    await expect(
      validateBookingTimeIsWithinHashedLinkWindow({
        hashedLink: "private-link",
        eventTypeId: 1,
        reqBodyStart: "2026-08-20T13:30:00.000Z",
        reqBodyEnd: "2026-08-20T14:30:00.000Z",
        hashedLinkService: getService(),
      })
    ).rejects.toThrow("outside the private link's bookable window");
  });

  it("rejects a link belonging to another event type", async () => {
    await expect(
      validateBookingTimeIsWithinHashedLinkWindow({
        hashedLink: "private-link",
        eventTypeId: 2,
        reqBodyStart: "2026-08-20T09:00:00.000Z",
        reqBodyEnd: "2026-08-20T10:00:00.000Z",
        hashedLinkService: getService(),
      })
    ).rejects.toThrow("does not belong to this event type");
  });

  it("accepts any time for a link without a window", async () => {
    const service = {
      validate: vi.fn().mockResolvedValue({
        eventTypeId: 1,
        bookingWindowStart: null,
        bookingWindowEnd: null,
      }),
    } as unknown as HashedLinkService;

    await expect(
      validateBookingTimeIsWithinHashedLinkWindow({
        hashedLink: "private-link",
        eventTypeId: 1,
        reqBodyStart: "2026-08-20T15:00:00.000Z",
        reqBodyEnd: "2026-08-20T16:00:00.000Z",
        hashedLinkService: service,
      })
    ).resolves.toBeUndefined();
  });
});
