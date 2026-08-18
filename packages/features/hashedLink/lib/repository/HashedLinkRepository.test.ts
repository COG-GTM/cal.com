import type { PrismaClient } from "@calcom/prisma";
import { describe, expect, it, vi } from "vitest";
import { HashedLinkRepository } from "./HashedLinkRepository";

describe("HashedLinkRepository", () => {
  it("preserves a booking window when an update omits window fields", async () => {
    const link = {
      link: "private-link",
      eventTypeId: 1,
      expiresAt: null,
      maxUsageCount: 1,
      bookingWindowStart: new Date("2026-08-20T08:00:00.000Z"),
      bookingWindowEnd: new Date("2026-08-20T14:00:00.000Z"),
    };
    const updateMany = vi.fn().mockImplementation(({ data }) => {
      Object.assign(link, data);
      return { count: 1 };
    });
    const repository = new HashedLinkRepository({
      hashedLink: { updateMany },
    } as unknown as PrismaClient);

    await repository.updateLink(1, {
      link: link.link,
      expiresAt: link.expiresAt,
      maxUsageCount: link.maxUsageCount,
    });

    expect(link.bookingWindowStart).toEqual(new Date("2026-08-20T08:00:00.000Z"));
    expect(link.bookingWindowEnd).toEqual(new Date("2026-08-20T14:00:00.000Z"));
  });
});
