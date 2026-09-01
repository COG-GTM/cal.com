import { createDefaultAIPhoneServiceProvider } from "@calcom/features/calAIPhone";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { createHandler } from "./create.handler";

vi.mock("@calcom/features/calAIPhone", () => ({
  createDefaultAIPhoneServiceProvider: vi.fn(),
}));

vi.mock("@calcom/features/calAIPhone/workflowTemplates", () => ({
  calAIPhoneWorkflowTemplates: {
    tmpl1: { generalPrompt: "TEMPLATE PROMPT" },
  },
}));

describe("createHandler", () => {
  const createOutboundAgent = vi.fn();
  const mockAiService = {
    createOutboundAgent,
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

  it("forwards configuration and uses a template prompt", async () => {
    createOutboundAgent.mockResolvedValue({ id: "agent-1" });
    const input = {
      name: "Agent",
      teamId: 2,
      workflowStepId: 3,
      templateWorkflowId: "tmpl1",
      generalPrompt: "INPUT PROMPT",
      beginMessage: "Hello",
      generalTools: [{ type: "custom", name: "book" }],
      voiceId: "voice-1",
    };

    const result = await createHandler({ ctx: { user: mockUser }, input });

    expect(createOutboundAgent).toHaveBeenCalledWith({
      name: "Agent",
      userId: 1,
      teamId: 2,
      workflowStepId: 3,
      generalPrompt: "TEMPLATE PROMPT",
      beginMessage: "Hello",
      generalTools: input.generalTools,
      userTimeZone: "America/New_York",
    });
    expect(result).toEqual({ id: "agent-1" });
  });

  it("falls back to the input prompt for an unknown template", async () => {
    createOutboundAgent.mockResolvedValue({ id: "agent-2" });

    await createHandler({
      ctx: { user: mockUser },
      input: { templateWorkflowId: "missing", generalPrompt: "INPUT PROMPT" },
    });

    expect(createOutboundAgent).toHaveBeenCalledWith(
      expect.objectContaining({ generalPrompt: "INPUT PROMPT" })
    );
  });

  it("uses the input prompt when no template is provided", async () => {
    createOutboundAgent.mockResolvedValue({ id: "agent-3" });

    await createHandler({
      ctx: { user: mockUser },
      input: { generalPrompt: "INPUT PROMPT" },
    });

    expect(createOutboundAgent).toHaveBeenCalledWith(
      expect.objectContaining({ generalPrompt: "INPUT PROMPT" })
    );
  });

  it("propagates service failures", async () => {
    const error = new Error("create failed");
    createOutboundAgent.mockRejectedValue(error);

    await expect(createHandler({ ctx: { user: mockUser }, input: { name: "Agent" } })).rejects.toBe(error);
  });
});
