import { createDefaultAIPhoneServiceProvider } from "@calcom/features/calAIPhone";
import { replaceEventTypePlaceholders } from "@calcom/features/calAIPhone/providers/retellAI/utils/promptUtils";
import prisma from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { updateInboundAgentEventTypeHandler } from "./updateInboundAgentEventType.handler";

const mocks = vi.hoisted(() => {
  const getAgentWithDetails = vi.fn();
  const updateToolsFromAgentId = vi.fn();
  const updateAgentConfiguration = vi.fn();
  const updateEventTypeId = vi.fn();
  const agentRepositoryPrisma = vi.fn();
  class MockPrismaAgentRepository {
    constructor(prismaClient: unknown) {
      agentRepositoryPrisma(prismaClient);
    }
    updateEventTypeId = updateEventTypeId;
  }
  return {
    getAgentWithDetails,
    updateToolsFromAgentId,
    updateAgentConfiguration,
    updateEventTypeId,
    agentRepositoryPrisma,
    MockPrismaAgentRepository,
  };
});

vi.mock("@calcom/features/calAIPhone", () => ({
  createDefaultAIPhoneServiceProvider: vi.fn(),
}));
vi.mock("@calcom/features/calAIPhone/repositories/PrismaAgentRepository", () => ({
  PrismaAgentRepository: mocks.MockPrismaAgentRepository,
}));
vi.mock("@calcom/features/calAIPhone/providers/retellAI/utils/promptUtils", () => ({
  replaceEventTypePlaceholders: vi.fn(),
}));
vi.mock("@calcom/prisma", () => ({ default: {}, prisma: {} }));
vi.mock("@calcom/lib/logger", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    getSubLogger: vi.fn(() => ({ error: vi.fn() })),
  },
}));

describe("updateInboundAgentEventTypeHandler", () => {
  const mockAiService = {
    getAgentWithDetails: mocks.getAgentWithDetails,
    updateToolsFromAgentId: mocks.updateToolsFromAgentId,
    updateAgentConfiguration: mocks.updateAgentConfiguration,
  } as unknown as ReturnType<typeof createDefaultAIPhoneServiceProvider>;
  const mockUser = {
    id: 1,
    timeZone: "America/New_York",
    organizationId: null,
    profiles: [],
  } as unknown as NonNullable<TrpcSessionUser>;
  const input = { agentId: "agent-1", eventTypeId: 3, teamId: 2 };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createDefaultAIPhoneServiceProvider).mockReturnValue(mockAiService);
    mocks.getAgentWithDetails.mockResolvedValue({
      retellData: { agentId: "retell-1", generalPrompt: "Hello {{event_type_id}}" },
    });
    vi.mocked(replaceEventTypePlaceholders).mockReturnValue("Hello 3");
    mocks.updateToolsFromAgentId.mockResolvedValue(undefined);
    mocks.updateAgentConfiguration.mockResolvedValue({ message: "updated" });
    mocks.updateEventTypeId.mockResolvedValue(undefined);
  });

  it("updates the prompt, tools, configuration, and repository", async () => {
    const result = await updateInboundAgentEventTypeHandler({ ctx: { user: mockUser }, input });

    expect(mocks.getAgentWithDetails).toHaveBeenCalledWith({
      id: "agent-1",
      userId: 1,
      teamId: 2,
    });
    expect(replaceEventTypePlaceholders).toHaveBeenCalledWith("Hello {{event_type_id}}", 3);
    expect(mocks.updateToolsFromAgentId).toHaveBeenCalledWith("retell-1", {
      eventTypeId: 3,
      timeZone: "America/New_York",
      userId: 1,
      teamId: 2,
    });
    expect(mocks.updateAgentConfiguration).toHaveBeenCalledWith({
      id: "agent-1",
      userId: 1,
      teamId: 2,
      generalPrompt: "Hello 3",
    });
    expect(mocks.agentRepositoryPrisma).toHaveBeenCalledWith(prisma);
    expect(mocks.updateEventTypeId).toHaveBeenCalledWith({ agentId: "agent-1", eventTypeId: 3 });
    expect(result).toEqual({ success: true, message: "updated" });
  });

  it("rejects missing agent configuration", async () => {
    mocks.getAgentWithDetails.mockResolvedValue({ retellData: { agentId: "retell-1" } });

    await expect(updateInboundAgentEventTypeHandler({ ctx: { user: mockUser }, input })).rejects.toThrow(
      "Agent configuration not found"
    );
    expect(mocks.updateToolsFromAgentId).not.toHaveBeenCalled();
  });

  it("rethrows update failures", async () => {
    const error = new Error("update failed");
    mocks.updateToolsFromAgentId.mockRejectedValue(error);

    await expect(updateInboundAgentEventTypeHandler({ ctx: { user: mockUser }, input })).rejects.toBe(error);
  });

  it("uses UTC when the user timezone is null", async () => {
    await updateInboundAgentEventTypeHandler({
      ctx: { user: { ...mockUser, timeZone: null } },
      input,
    });

    expect(mocks.updateToolsFromAgentId).toHaveBeenCalledWith(
      "retell-1",
      expect.objectContaining({ timeZone: "UTC" })
    );
  });
});
