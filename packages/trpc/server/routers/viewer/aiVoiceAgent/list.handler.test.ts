import { createDefaultAIPhoneServiceProvider } from "@calcom/features/calAIPhone";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { listHandler } from "./list.handler";

vi.mock("@calcom/features/calAIPhone", () => ({
  createDefaultAIPhoneServiceProvider: vi.fn(),
}));

describe("listHandler", () => {
  const listAgents = vi.fn();
  const mockAiService = {
    listAgents,
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

  it("uses the all scope and forwards an optional team", async () => {
    listAgents.mockResolvedValue([{ id: "agent-1" }]);

    const result = await listHandler({
      ctx: { user: mockUser },
      input: { teamId: 2, scope: "team" },
    });

    expect(listAgents).toHaveBeenCalledWith({ userId: 1, teamId: 2, scope: "team" });
    expect(result).toEqual([{ id: "agent-1" }]);
  });

  it("defaults undefined input to all agents", async () => {
    listAgents.mockResolvedValue([]);

    await listHandler({ ctx: { user: mockUser }, input: undefined });

    expect(listAgents).toHaveBeenCalledWith({ userId: 1, teamId: undefined, scope: "all" });
  });

  it("propagates service failures", async () => {
    const error = new Error("list failed");
    listAgents.mockRejectedValue(error);

    await expect(listHandler({ ctx: { user: mockUser }, input: undefined })).rejects.toBe(error);
  });
});
