import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTeamEventType } from "./getTeamEventType";

describe("getTeamEventType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a team and meeting slug without an organization", async () => {
    const result = { id: 1 };
    vi.mocked(prismaMock.eventType.findFirst).mockResolvedValue(result as never);

    await expect(getTeamEventType("Acme Team", "meeting", null)).resolves.toBe(result);

    expect(prismaMock.eventType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          team: {
            OR: [{ slug: "acme-team" }, { metadata: { path: ["requestedSlug"], equals: "acme-team" } }],
            parent: null,
          },
          OR: [{ slug: "meeting" }, { slug: { startsWith: "meeting-team-id-" } }],
        },
        orderBy: { slug: "asc" },
      })
    );
  });

  it("uses the organization slug-or-requested-slug condition when provided", async () => {
    vi.mocked(prismaMock.eventType.findFirst).mockResolvedValue(null);

    await expect(getTeamEventType("team", "event", "Org Name")).resolves.toBeNull();

    expect(prismaMock.eventType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          team: expect.objectContaining({
            parent: {
              OR: [{ slug: "org-name" }, { metadata: { path: ["requestedSlug"], equals: "org-name" } }],
            },
          }),
        }),
      })
    );
  });
});
