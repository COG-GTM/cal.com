import { createDefaultAIPhoneServiceProvider } from "@calcom/features/calAIPhone";
import prisma from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { testCallHandler } from "./testCall.handler";

const mocks = vi.hoisted(() => {
  const checkIfFeatureIsEnabledGlobally = vi.fn();
  const findByIdWithCallAccess = vi.fn();
  const featuresRepositoryPrisma = vi.fn();
  const updateToolsFromAgentId = vi.fn();
  const createTestCall = vi.fn();
  class MockFeaturesRepository {
    constructor(prismaClient: unknown) {
      featuresRepositoryPrisma(prismaClient);
    }
    checkIfFeatureIsEnabledGlobally = checkIfFeatureIsEnabledGlobally;
  }
  class MockPrismaAgentRepository {
    findByIdWithCallAccess = findByIdWithCallAccess;
  }
  return {
    checkIfFeatureIsEnabledGlobally,
    findByIdWithCallAccess,
    featuresRepositoryPrisma,
    updateToolsFromAgentId,
    createTestCall,
    MockFeaturesRepository,
    MockPrismaAgentRepository,
  };
});

vi.mock("@calcom/features/calAIPhone", () => ({
  createDefaultAIPhoneServiceProvider: vi.fn(),
}));
vi.mock("@calcom/features/flags/features.repository", () => ({
  FeaturesRepository: mocks.MockFeaturesRepository,
}));
vi.mock("@calcom/features/calAIPhone/repositories/PrismaAgentRepository", () => ({
  PrismaAgentRepository: mocks.MockPrismaAgentRepository,
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

describe("testCallHandler", () => {
  const mockAiService = {
    updateToolsFromAgentId: mocks.updateToolsFromAgentId,
    createTestCall: mocks.createTestCall,
  } as unknown as ReturnType<typeof createDefaultAIPhoneServiceProvider>;
  const mockUser = {
    id: 1,
    timeZone: "America/New_York",
    organizationId: null,
    profiles: [],
  } as unknown as NonNullable<TrpcSessionUser>;
  const input = { agentId: "agent-1", phoneNumber: "+15550001", teamId: 2, eventTypeId: 3 };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createDefaultAIPhoneServiceProvider).mockReturnValue(mockAiService);
    mocks.checkIfFeatureIsEnabledGlobally.mockResolvedValue(true);
  });

  it("returns without looking up an agent when the feature is disabled", async () => {
    mocks.checkIfFeatureIsEnabledGlobally.mockResolvedValue(false);

    await expect(testCallHandler({ ctx: { user: mockUser }, input })).resolves.toBeUndefined();
    expect(mocks.findByIdWithCallAccess).not.toHaveBeenCalled();
    expect(mocks.createTestCall).not.toHaveBeenCalled();
  });

  it("constructs FeaturesRepository with prisma", async () => {
    mocks.findByIdWithCallAccess.mockResolvedValue({ providerAgentId: "retell-1" });
    mocks.updateToolsFromAgentId.mockResolvedValue(undefined);
    mocks.createTestCall.mockResolvedValue({ callId: "call-1" });

    await testCallHandler({ ctx: { user: mockUser }, input });

    expect(mocks.checkIfFeatureIsEnabledGlobally).toHaveBeenCalledWith("cal-ai-voice-agents");
    expect(mocks.findByIdWithCallAccess).toHaveBeenCalledWith({ id: "agent-1", userId: 1 });
    expect(mocks.featuresRepositoryPrisma).toHaveBeenCalledWith(prisma);
  });

  it("rejects when the agent is missing", async () => {
    mocks.findByIdWithCallAccess.mockResolvedValue(null);

    await expect(testCallHandler({ ctx: { user: mockUser }, input })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("maps tool update failures to unauthorized", async () => {
    mocks.findByIdWithCallAccess.mockResolvedValue({ providerAgentId: "retell-1" });
    mocks.updateToolsFromAgentId.mockRejectedValue(new Error("not allowed"));

    await expect(testCallHandler({ ctx: { user: mockUser }, input })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("updates tools and creates a test call", async () => {
    mocks.findByIdWithCallAccess.mockResolvedValue({ providerAgentId: "retell-1" });
    mocks.updateToolsFromAgentId.mockResolvedValue(undefined);
    mocks.createTestCall.mockResolvedValue({ callId: "call-1" });

    const result = await testCallHandler({ ctx: { user: mockUser }, input });

    expect(mocks.updateToolsFromAgentId).toHaveBeenCalledWith("retell-1", {
      eventTypeId: 3,
      timeZone: "America/New_York",
      userId: 1,
      teamId: 2,
    });
    expect(mocks.createTestCall).toHaveBeenCalledWith({
      agentId: "agent-1",
      phoneNumber: "+15550001",
      userId: 1,
      teamId: 2,
      timeZone: "America/New_York",
      eventTypeId: 3,
    });
    expect(result).toEqual({ callId: "call-1" });
  });

  it("uses the default timezone for a null user timezone", async () => {
    mocks.findByIdWithCallAccess.mockResolvedValue({ providerAgentId: "retell-1" });
    mocks.updateToolsFromAgentId.mockResolvedValue(undefined);
    mocks.createTestCall.mockResolvedValue({ callId: "call-2" });

    await testCallHandler({
      ctx: { user: { ...mockUser, timeZone: null } },
      input,
    });

    expect(mocks.createTestCall).toHaveBeenCalledWith(expect.objectContaining({ timeZone: "Europe/London" }));
  });
});
