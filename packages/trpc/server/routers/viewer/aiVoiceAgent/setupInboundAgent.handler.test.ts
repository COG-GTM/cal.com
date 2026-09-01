import { createDefaultAIPhoneServiceProvider } from "@calcom/features/calAIPhone";
import { HttpError } from "@calcom/lib/http-error";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { setupInboundAgentHandler } from "./setupInboundAgent.handler";

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

describe("setupInboundAgentHandler", () => {
  const createInboundAgent = vi.fn();
  const mockAiService = {
    createInboundAgent,
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

  it("creates an inbound agent and returns its identifier", async () => {
    createInboundAgent.mockResolvedValue({ id: "agent-1" });

    await expect(
      setupInboundAgentHandler({
        ctx: { user: mockUser },
        input: { phoneNumber: "+15550001", teamId: 2, workflowStepId: 3 },
      })
    ).resolves.toEqual({
      success: true,
      agentId: "agent-1",
      message: "Inbound agent configured successfully",
    });
    expect(createInboundAgent).toHaveBeenCalledWith({
      name: "Inbound Agent - +15550001",
      phoneNumber: "+15550001",
      userId: 1,
      teamId: 2,
      workflowStepId: 3,
      userTimeZone: "America/New_York",
    });
  });

  it("falls back to UTC for a missing user timezone", async () => {
    createInboundAgent.mockResolvedValue({ id: "agent-2" });

    await setupInboundAgentHandler({
      ctx: { user: { ...mockUser, timeZone: undefined } },
      input: { phoneNumber: "+15550002", workflowStepId: 3 },
    });

    expect(createInboundAgent).toHaveBeenCalledWith(expect.objectContaining({ userTimeZone: "UTC" }));
  });

  it("also falls back to UTC for a null user timezone", async () => {
    createInboundAgent.mockResolvedValue({ id: "agent-3" });

    await setupInboundAgentHandler({
      ctx: { user: { ...mockUser, timeZone: null } },
      input: { phoneNumber: "+15550003", workflowStepId: 3 },
    });

    expect(createInboundAgent).toHaveBeenCalledWith(expect.objectContaining({ userTimeZone: "UTC" }));
  });

  it("rethrows HttpError instances unchanged", async () => {
    const error = new HttpError({ statusCode: 400, message: "provider failed" });
    createInboundAgent.mockRejectedValue(error);

    await expect(
      setupInboundAgentHandler({
        ctx: { user: mockUser },
        input: { phoneNumber: "+15550001", workflowStepId: 3 },
      })
    ).rejects.toBe(error);
  });

  it("maps unexpected failures to an internal error", async () => {
    createInboundAgent.mockRejectedValue(new Error("provider failed"));

    await expect(
      setupInboundAgentHandler({
        ctx: { user: mockUser },
        input: { phoneNumber: "+15550001", workflowStepId: 3 },
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
