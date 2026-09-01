import { createDefaultAIPhoneServiceProvider } from "@calcom/features/calAIPhone";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { updateHandler } from "./update.handler";

vi.mock("@calcom/features/calAIPhone", () => ({
  createDefaultAIPhoneServiceProvider: vi.fn(),
}));

describe("updateHandler", () => {
  const updateAgentConfiguration = vi.fn();
  const mockAiService = {
    updateAgentConfiguration,
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

  it("forwards update fields and normalizes null prompts", async () => {
    updateAgentConfiguration.mockResolvedValue({ id: "agent-1" });
    const input = {
      id: "agent-1",
      teamId: 2,
      name: "Updated",
      outboundEventTypeId: 3,
      voiceId: "voice-1",
      language: "en-US" as const,
      generalPrompt: null,
      beginMessage: null,
      generalTools: [{ type: "custom", name: "book" }],
    };

    const result = await updateHandler({ ctx: { user: mockUser }, input });

    expect(updateAgentConfiguration).toHaveBeenCalledWith({
      id: "agent-1",
      userId: 1,
      teamId: 2,
      name: "Updated",
      outboundEventTypeId: 3,
      voiceId: "voice-1",
      language: "en-US",
      generalPrompt: undefined,
      beginMessage: undefined,
      generalTools: input.generalTools,
      timeZone: "America/New_York",
    });
    expect(result).toEqual({ id: "agent-1" });
  });

  it("falls back to UTC when the user has no timezone", async () => {
    updateAgentConfiguration.mockResolvedValue({ id: "agent-2" });

    await updateHandler({
      ctx: { user: { ...mockUser, timeZone: undefined } },
      input: { id: "agent-2" },
    });

    expect(updateAgentConfiguration).toHaveBeenCalledWith(expect.objectContaining({ timeZone: "UTC" }));
  });

  it("propagates service failures", async () => {
    const error = new Error("update failed");
    updateAgentConfiguration.mockRejectedValue(error);

    await expect(updateHandler({ ctx: { user: mockUser }, input: { id: "agent-1" } })).rejects.toBe(error);
  });
});
