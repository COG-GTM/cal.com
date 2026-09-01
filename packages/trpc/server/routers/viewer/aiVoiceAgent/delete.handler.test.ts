import { createDefaultAIPhoneServiceProvider } from "@calcom/features/calAIPhone";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { deleteHandler } from "./delete.handler";

vi.mock("@calcom/features/calAIPhone", () => ({
  createDefaultAIPhoneServiceProvider: vi.fn(),
}));

describe("deleteHandler", () => {
  const deleteAgent = vi.fn();
  const mockAiService = {
    deleteAgent,
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
    deleteAgent.mockResolvedValue({ success: true });

    const result = await deleteHandler({
      ctx: { user: mockUser },
      input: { id: "agent-1", teamId: 2 },
    });

    expect(deleteAgent).toHaveBeenCalledWith({ id: "agent-1", userId: 1, teamId: 2 });
    expect(result).toEqual({ success: true });
  });

  it("propagates service failures", async () => {
    const error = new Error("delete failed");
    deleteAgent.mockRejectedValue(error);

    await expect(deleteHandler({ ctx: { user: mockUser }, input: { id: "agent-1" } })).rejects.toBe(error);
  });
});
