import { beforeEach, describe, expect, it, vi } from "vitest";
import getAppKeysFromSlug from "../../../_utils/getAppKeysFromSlug";
import { getDailyAppKeys } from "../getDailyAppKeys";

vi.mock("../../../_utils/getAppKeysFromSlug", () => ({ default: vi.fn() }));

describe("getDailyAppKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the keys of the daily-video app and defaults scale_plan", async () => {
    vi.mocked(getAppKeysFromSlug).mockResolvedValue({ api_key: "daily-key" });

    await expect(getDailyAppKeys()).resolves.toEqual({ api_key: "daily-key", scale_plan: "false" });
    expect(getAppKeysFromSlug).toHaveBeenCalledWith("daily-video");
  });

  it("keeps an explicit scale_plan", async () => {
    vi.mocked(getAppKeysFromSlug).mockResolvedValue({ api_key: "daily-key", scale_plan: "true" });

    await expect(getDailyAppKeys()).resolves.toEqual({ api_key: "daily-key", scale_plan: "true" });
  });

  it("throws when the api key is missing", async () => {
    vi.mocked(getAppKeysFromSlug).mockResolvedValue({});

    await expect(getDailyAppKeys()).rejects.toThrow();
  });
});
