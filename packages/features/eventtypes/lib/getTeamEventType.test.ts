import { prisma } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTeamEventType } from "./getTeamEventType";

vi.mock("@calcom/prisma", () => ({
  prisma: {
    eventType: {
      findFirst: vi.fn(),
    },
  },
}));

const findFirst = vi.mocked(prisma.eventType.findFirst);

describe("getTeamEventType", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    findFirst.mockResolvedValue(null);
  });

  it("matches the team by slug or requested slug and scopes it to no parent when no org is given", async () => {
    await getTeamEventType("Engineering Team", "30min", null);

    const where = findFirst.mock.calls[0][0]?.where;
    expect(where?.team).toMatchObject({
      OR: [
        { slug: "engineering-team" },
        { metadata: { path: ["requestedSlug"], equals: "engineering-team" } },
      ],
      parent: null,
    });
  });

  it("scopes the team to the organization when an org slug is given", async () => {
    await getTeamEventType("engineering", "30min", "Acme Org");

    const where = findFirst.mock.calls[0][0]?.where;
    expect(where?.team?.parent).toMatchObject({
      OR: [{ slug: "acme-org" }, { metadata: { path: ["requestedSlug"], equals: "acme-org" } }],
    });
  });

  it("also matches managed team event slugs suffixed with the team id", async () => {
    await getTeamEventType("engineering", "30min", null);

    expect(findFirst.mock.calls[0][0]?.where?.OR).toEqual([
      { slug: "30min" },
      { slug: { startsWith: "30min-team-id-" } },
    ]);
  });

  it("orders by slug so the non suffixed event wins and returns the found event", async () => {
    const event = { id: 1, slug: "30min" };
    findFirst.mockResolvedValue(event);

    const result = await getTeamEventType("engineering", "30min", null);

    expect(findFirst.mock.calls[0][0]?.orderBy).toEqual({ slug: "asc" });
    expect(result).toBe(event);
  });

  it("selects the fields the booker needs", async () => {
    await getTeamEventType("engineering", "30min", null);

    const select = findFirst.mock.calls[0][0]?.select;
    expect(select).toMatchObject({ id: true, slug: true, length: true, bookingFields: true });
    expect(select?.hosts).toMatchObject({ take: 3 });
  });

  it("returns null when no event type matches", async () => {
    expect(await getTeamEventType("engineering", "unknown", null)).toBeNull();
  });
});
