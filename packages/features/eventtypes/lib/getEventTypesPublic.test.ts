import prisma from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEventTypesPublic } from "./getEventTypesPublic";

vi.mock("@calcom/prisma", () => ({
  default: {
    $queryRaw: vi.fn(),
  },
}));

const queryRaw = vi.mocked(prisma.$queryRaw);

const buildEventType = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  title: "30 min",
  description: "A **bold** meeting",
  length: 30,
  schedulingType: null,
  recurringEvent: null,
  slug: "30min",
  hidden: false,
  price: 0,
  currency: "usd",
  lockTimeZoneToggleOnBookingPage: false,
  lockedTimeZone: null,
  requiresConfirmation: false,
  requiresBookerEmailVerification: false,
  metadata: {},
  canSendCalVideoTranscriptionEmails: true,
  ...overrides,
});

describe("getEventTypesPublic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("passes the user id to the raw query", async () => {
    queryRaw.mockResolvedValue([]);

    await getEventTypesPublic(42);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0].slice(1)).toEqual([42, 42]);
  });

  it("filters out hidden event types", async () => {
    queryRaw.mockResolvedValue([
      buildEventType({ id: 1, hidden: false }),
      buildEventType({ id: 2, hidden: true }),
    ]);

    const result = await getEventTypesPublic(1);

    expect(result.map((eventType) => eventType.id)).toEqual([1]);
  });

  it("renders the description as safe HTML and parses metadata", async () => {
    queryRaw.mockResolvedValue([
      buildEventType({ metadata: { multipleDuration: [15, 30] }, description: "A **bold** meeting" }),
    ]);

    const [eventType] = await getEventTypesPublic(1);

    expect(eventType.descriptionAsSafeHTML).toContain("<strong>bold</strong>");
    expect(eventType.metadata?.multipleDuration).toEqual([15, 30]);
  });

  it("drops event types whose metadata does not match the schema", async () => {
    queryRaw.mockResolvedValue([
      buildEventType({ id: 1 }),
      buildEventType({ id: 2, metadata: { multipleDuration: "not-an-array" } }),
    ]);

    const result = await getEventTypesPublic(1);

    expect(result.map((eventType) => eventType.id)).toEqual([1]);
  });

  it("returns an empty list when the user has no event types", async () => {
    queryRaw.mockResolvedValue([]);

    expect(await getEventTypesPublic(1)).toEqual([]);
  });

  it("handles a null description", async () => {
    queryRaw.mockResolvedValue([buildEventType({ description: null })]);

    const [eventType] = await getEventTypesPublic(1);

    expect(eventType.descriptionAsSafeHTML).toBe("");
  });
});
