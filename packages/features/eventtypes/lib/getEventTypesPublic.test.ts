import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEventTypesPublic } from "./getEventTypesPublic";

const event = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1,
  title: "Event",
  description: "A **safe** description",
  length: 30,
  schedulingType: null,
  recurringEvent: null,
  slug: "event",
  hidden: false,
  price: 0,
  currency: "usd",
  lockTimeZoneToggleOnBookingPage: false,
  lockedTimeZone: null,
  requiresConfirmation: false,
  requiresBookerEmailVerification: false,
  metadata: {},
  canSendCalVideoTranscriptionEmails: false,
  ...overrides,
});

describe("getEventTypesPublic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters hidden events, drops invalid metadata, and sanitizes descriptions", async () => {
    vi.mocked(prismaMock.$queryRaw).mockResolvedValue([
      event({ id: 1, metadata: { multipleDuration: [30] } }),
      event({ id: 2, hidden: true }),
      event({ id: 3, metadata: { multipleDuration: ["invalid"] } }),
    ] as never);

    const result = await getEventTypesPublic(42);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 1,
      descriptionAsSafeHTML: expect.stringContaining("<strong>safe</strong>"),
    });
    expect(result[0].metadata).toMatchObject({ multipleDuration: [30] });
  });

  it("handles null metadata and null descriptions", async () => {
    vi.mocked(prismaMock.$queryRaw).mockResolvedValue([
      event({ metadata: null, description: null }),
    ] as never);

    const result = await getEventTypesPublic(42);

    expect(result[0]).toMatchObject({
      metadata: {},
      description: null,
      descriptionAsSafeHTML: "",
    });
  });
});
