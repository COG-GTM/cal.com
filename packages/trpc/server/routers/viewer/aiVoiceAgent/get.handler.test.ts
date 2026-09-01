import { createDefaultAIPhoneServiceProvider } from "@calcom/features/calAIPhone";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { getHandler } from "./get.handler";

vi.mock("@calcom/features/calAIPhone", () => ({
  createDefaultAIPhoneServiceProvider: vi.fn(),
}));

describe("getHandler", () => {
  const getAgentWithDetails = vi.fn();
  const mockAiService = {
    getAgentWithDetails,
  } as unknown as ReturnType<typeof createDefaultAIPhoneServiceProvider>;
  const mockUser = {
    id: 1,
    timeZone: "America/New_York",
    organizationId: null,
    profiles: [],
  } as unknown as NonNullable<TrpcSessionUser>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createDefaultAIPhoneServiceProvider).mockReturnValue(mockAiService);
  });

  it("passes the agent, user, and team identifiers", async () => {
    getAgentWithDetails.mockResolvedValue({ id: "agent-1" });

    const result = await getHandler({
      ctx: { user: mockUser },
      input: { id: "agent-1", teamId: 2 },
    });

    expect(getAgentWithDetails).toHaveBeenCalledWith({ id: "agent-1", userId: 1, teamId: 2 });
    expect(result).toEqual({ id: "agent-1" });
  });

  it("propagates service failures", async () => {
    const error = new Error("get failed");
    getAgentWithDetails.mockRejectedValue(error);

    await expect(getHandler({ ctx: { user: mockUser }, input: { id: "agent-1" } })).rejects.toBe(error);
  });
});
