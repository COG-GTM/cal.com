import { createDefaultAIPhoneServiceProvider } from "@calcom/features/calAIPhone";
import { MembershipRole } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { listCallsHandler } from "./listCalls.handler";

const mocks = vi.hoisted(() => {
  const findAllByUserId = vi.fn();
  const getAccessiblePhoneNumbers = vi.fn();
  const listCalls = vi.fn();
  class MockMembershipRepository {
    findAllByUserId = findAllByUserId;
  }
  return {
    findAllByUserId,
    getAccessiblePhoneNumbers,
    listCalls,
    MockMembershipRepository,
  };
});

vi.mock("@calcom/features/calAIPhone", () => ({
  createDefaultAIPhoneServiceProvider: vi.fn(),
}));
vi.mock("@calcom/features/membership/repositories/MembershipRepository", () => ({
  MembershipRepository: mocks.MockMembershipRepository,
}));
vi.mock("@calcom/features/calAIPhone/repositories/CalAiPhoneNumberRepository", () => ({
  CalAiPhoneNumberRepository: { getAccessiblePhoneNumbers: mocks.getAccessiblePhoneNumbers },
}));
vi.mock("@calcom/lib/logger", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    getSubLogger: vi.fn(() => ({ error: vi.fn() })),
  },
}));

describe("listCallsHandler", () => {
  const mockAiService = {
    listCalls: mocks.listCalls,
  } as unknown as ReturnType<typeof createDefaultAIPhoneServiceProvider>;
  const baseUser = {
    id: 1,
    timeZone: "America/New_York",
    organizationId: null,
    profiles: [],
  } as unknown as NonNullable<TrpcSessionUser>;
  const baseInput = { limit: 50, offset: 0 };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createDefaultAIPhoneServiceProvider).mockReturnValue(mockAiService);
    mocks.findAllByUserId.mockResolvedValue([]);
    mocks.getAccessiblePhoneNumbers.mockResolvedValue(["+15550001"]);
    mocks.listCalls.mockResolvedValue([{ id: "call-1" }]);
  });

  it("filters memberships and marks an organization owner", async () => {
    mocks.findAllByUserId.mockResolvedValue([
      { teamId: 10, role: MembershipRole.OWNER, team: { parentId: 7 } },
      { teamId: 11, role: MembershipRole.ADMIN, team: { parentId: 7 } },
      { teamId: 12, role: MembershipRole.ADMIN, team: { parentId: 8 } },
    ]);

    await listCallsHandler({
      ctx: { user: { ...baseUser, organizationId: 7 } },
      input: baseInput,
    });

    expect(mocks.getAccessiblePhoneNumbers).toHaveBeenCalledWith({
      userId: 1,
      organizationId: 7,
      isOrgOwner: true,
      adminTeamIds: [10, 11],
    });
  });

  it("includes all admin teams for a user without an organization", async () => {
    mocks.findAllByUserId.mockResolvedValue([
      { teamId: 10, role: MembershipRole.ADMIN, team: { parentId: 7 } },
      { teamId: 11, role: MembershipRole.OWNER, team: { parentId: null } },
    ]);

    await listCallsHandler({ ctx: { user: baseUser }, input: baseInput });

    expect(mocks.getAccessiblePhoneNumbers).toHaveBeenCalledWith({
      userId: 1,
      organizationId: undefined,
      isOrgOwner: false,
      adminTeamIds: [10, 11],
    });
  });

  it("falls back to the first profile organization", async () => {
    await listCallsHandler({
      ctx: {
        user: { ...baseUser, organizationId: null, profiles: [{ organizationId: 9 }] },
      },
      input: baseInput,
    });

    expect(mocks.getAccessiblePhoneNumbers).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 9 })
    );
  });

  it("returns empty results without calling the AI service when there are no numbers", async () => {
    mocks.getAccessiblePhoneNumbers.mockResolvedValue([]);

    await expect(listCallsHandler({ ctx: { user: baseUser }, input: baseInput })).resolves.toEqual({
      calls: [],
      totalCount: 0,
    });
    expect(mocks.listCalls).not.toHaveBeenCalled();
  });

  it("passes parsed date thresholds to the AI service", async () => {
    const startDate = "2024-01-01T00:00:00.000Z";
    const endDate = "2024-01-02T00:00:00.000Z";

    await listCallsHandler({
      ctx: { user: baseUser },
      input: { limit: 10, offset: 2, filters: { startDate, endDate } },
    });

    expect(mocks.listCalls).toHaveBeenCalledWith({
      limit: 10,
      offset: 2,
      filters: {
        fromNumber: ["+15550001"],
        startTimestamp: {
          lower_threshold: Date.parse(startDate),
          upper_threshold: Date.parse(endDate),
        },
      },
    });
  });

  it("does not add a timestamp filter when dates are absent", async () => {
    await listCallsHandler({ ctx: { user: baseUser }, input: baseInput });

    expect(mocks.listCalls).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      filters: { fromNumber: ["+15550001"] },
    });
  });

  it("allows a start date without an end date", async () => {
    const startDate = "2024-01-01T00:00:00.000Z";

    await listCallsHandler({
      ctx: { user: baseUser },
      input: { ...baseInput, filters: { startDate } },
    });

    expect(mocks.listCalls).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      filters: {
        fromNumber: ["+15550001"],
        startTimestamp: { lower_threshold: Date.parse(startDate) },
      },
    });
  });

  it.each([
    ["startDate", { startDate: "invalid" }, "Invalid startDate format"],
    ["endDate", { endDate: "invalid" }, "Invalid endDate format"],
  ])("rejects invalid %s", async (_name, filters, message) => {
    await expect(
      listCallsHandler({ ctx: { user: baseUser }, input: { ...baseInput, filters } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message });
  });

  it("rejects a start date after the end date", async () => {
    await expect(
      listCallsHandler({
        ctx: { user: baseUser },
        input: {
          ...baseInput,
          filters: { startDate: "2024-01-03", endDate: "2024-01-02" },
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "startDate must be before or equal to endDate",
    });
  });

  it("maps non-TRPC failures to an internal error", async () => {
    mocks.listCalls.mockRejectedValue(new Error("provider failed"));

    await expect(listCallsHandler({ ctx: { user: baseUser }, input: baseInput })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to retrieve call history",
    });
  });

  it("preserves TRPC errors", async () => {
    const error = new TRPCError({ code: "UNAUTHORIZED", message: "no access" });
    mocks.listCalls.mockRejectedValue(error);

    await expect(listCallsHandler({ ctx: { user: baseUser }, input: baseInput })).rejects.toBe(error);
  });
});
