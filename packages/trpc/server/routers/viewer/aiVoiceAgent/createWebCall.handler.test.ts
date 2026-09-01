import { createDefaultAIPhoneServiceProvider } from "@calcom/features/calAIPhone";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { createWebCallHandler } from "./createWebCall.handler";

vi.mock("@calcom/features/calAIPhone", () => ({
  createDefaultAIPhoneServiceProvider: vi.fn(),
}));

vi.mock("@calcom/lib/logger", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    getSubLogger: vi.fn(() => ({ error: vi.fn() })),
  },
}));

describe("createWebCallHandler", () => {
  const getAgentWithDetails = vi.fn();
  const updateToolsFromAgentId = vi.fn();
  const createWebCall = vi.fn();
  const mockAiService = {
    getAgentWithDetails,
    updateToolsFromAgentId,
    createWebCall,
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

  it("forbids missing agents and does not create a web call", async () => {
    getAgentWithDetails.mockResolvedValue(null);

    await expect(
      createWebCallHandler({
        ctx: { user: mockUser },
        input: { agentId: "agent-1", teamId: 2, eventTypeId: 3 },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createWebCall).not.toHaveBeenCalled();

    getAgentWithDetails.mockResolvedValue({ providerAgentId: null });
    await expect(
      createWebCallHandler({
        ctx: { user: mockUser },
        input: { agentId: "agent-1", eventTypeId: 3 },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns an internal error when tool configuration fails", async () => {
    getAgentWithDetails.mockResolvedValue({ providerAgentId: "retell-1" });
    updateToolsFromAgentId.mockRejectedValue(new Error("tool update failed"));

    await expect(
      createWebCallHandler({
        ctx: { user: mockUser },
        input: { agentId: "agent-1", teamId: 2, eventTypeId: 3 },
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(createWebCall).not.toHaveBeenCalled();
  });

  it("updates tools and creates a web call", async () => {
    getAgentWithDetails.mockResolvedValue({ providerAgentId: "retell-1" });
    updateToolsFromAgentId.mockResolvedValue(undefined);
    createWebCall.mockResolvedValue({ callId: "call-1" });

    const result = await createWebCallHandler({
      ctx: { user: mockUser },
      input: { agentId: "agent-1", teamId: 2, eventTypeId: 3 },
    });

    expect(updateToolsFromAgentId).toHaveBeenCalledWith("retell-1", {
      eventTypeId: 3,
      timeZone: "America/New_York",
      userId: 1,
      teamId: 2,
    });
    expect(createWebCall).toHaveBeenCalledWith({
      agentId: "agent-1",
      userId: 1,
      teamId: 2,
      timeZone: "America/New_York",
      eventTypeId: 3,
    });
    expect(result).toEqual({ callId: "call-1" });
  });

  it("falls back to Europe/London when the user timezone is undefined", async () => {
    getAgentWithDetails.mockResolvedValue({ providerAgentId: "retell-1" });
    updateToolsFromAgentId.mockResolvedValue(undefined);
    createWebCall.mockResolvedValue({ callId: "call-2" });

    await createWebCallHandler({
      ctx: { user: { ...mockUser, timeZone: undefined } },
      input: { agentId: "agent-1", eventTypeId: 3 },
    });

    expect(createWebCall).toHaveBeenCalledWith(expect.objectContaining({ timeZone: "Europe/London" }));
  });

  it("also falls back when the user timezone is null", async () => {
    getAgentWithDetails.mockResolvedValue({ providerAgentId: "retell-1" });
    updateToolsFromAgentId.mockResolvedValue(undefined);
    createWebCall.mockResolvedValue({ callId: "call-3" });

    await createWebCallHandler({
      ctx: { user: { ...mockUser, timeZone: null } },
      input: { agentId: "agent-1", eventTypeId: 3 },
    });

    expect(createWebCall).toHaveBeenCalledWith(expect.objectContaining({ timeZone: "Europe/London" }));
  });
});
