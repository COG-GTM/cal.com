import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAppKeysFromSlug } = vi.hoisted(() => ({ getAppKeysFromSlug: vi.fn() }));

vi.mock("../../_utils/getAppKeysFromSlug", () => ({ default: getAppKeysFromSlug }));

import { getDailyAppKeys } from "./getDailyAppKeys";

describe("getDailyAppKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the keys of the daily-video app and defaults the scale plan", async () => {
    getAppKeysFromSlug.mockResolvedValue({ api_key: "api-key" });

    await expect(getDailyAppKeys()).resolves.toEqual({ api_key: "api-key", scale_plan: "false" });
    expect(getAppKeysFromSlug).toHaveBeenCalledWith("daily-video");
  });

  it("keeps a configured scale plan", async () => {
    getAppKeysFromSlug.mockResolvedValue({ api_key: "api-key", scale_plan: "true" });

    await expect(getDailyAppKeys()).resolves.toEqual({ api_key: "api-key", scale_plan: "true" });
  });

  it("throws when the api key is missing", async () => {
    getAppKeysFromSlug.mockResolvedValue({});

    await expect(getDailyAppKeys()).rejects.toThrow();
  });
});
