import { createDefaultAIPhoneServiceProvider } from "@calcom/features/calAIPhone";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { listVoicesHandler } from "./listVoices.handler";

vi.mock("@calcom/features/calAIPhone", () => ({
  createDefaultAIPhoneServiceProvider: vi.fn(),
}));

describe("listVoicesHandler", () => {
  const listVoices = vi.fn();
  const mockAiService = {
    listVoices,
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

  it("returns voices from the service", async () => {
    listVoices.mockResolvedValue([{ id: "voice-1" }]);

    await expect(listVoicesHandler({ ctx: { user: mockUser } })).resolves.toEqual([{ id: "voice-1" }]);
    expect(listVoices).toHaveBeenCalledWith();
  });

  it("propagates service failures", async () => {
    const error = new Error("voices failed");
    listVoices.mockRejectedValue(error);

    await expect(listVoicesHandler({ ctx: { user: mockUser } })).rejects.toBe(error);
  });
});
