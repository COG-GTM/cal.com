import type { AppMeta } from "@calcom/types/App";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQueryRaw: Mock = vi.fn();

vi.mock("@calcom/prisma", () => ({
  default: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
}));

import { AppOnboardingSteps } from "./appOnboardingSteps";
import { getAppOnboardingRedirectUrl } from "./getAppOnboardingRedirectUrl";
import { getAppOnboardingUrl } from "./getAppOnboardingUrl";
import getInstallCountPerApp, { computeInstallCountsFromDB } from "./getInstallCountPerApp";
import { shouldRedirectToAppOnboarding } from "./shouldRedirectToAppOnboarding";

describe("AppOnboardingSteps", () => {
  it("exposes the onboarding step slugs", () => {
    expect(AppOnboardingSteps.ACCOUNTS_STEP).toBe("accounts");
    expect(AppOnboardingSteps.EVENT_TYPES_STEP).toBe("event-types");
    expect(AppOnboardingSteps.CONFIGURE_STEP).toBe("configure");
  });
});

describe("getAppOnboardingUrl", () => {
  it("builds an installation url for the given step", () => {
    expect(getAppOnboardingUrl({ slug: "zoom", step: AppOnboardingSteps.ACCOUNTS_STEP })).toBe(
      "/apps/installation/accounts?slug=zoom"
    );
  });

  it("includes the teamId when provided", () => {
    expect(getAppOnboardingUrl({ slug: "zoom", step: AppOnboardingSteps.CONFIGURE_STEP, teamId: 42 })).toBe(
      "/apps/installation/configure?slug=zoom&teamId=42"
    );
  });

  it("omits a falsy teamId", () => {
    expect(getAppOnboardingUrl({ slug: "zoom", step: AppOnboardingSteps.CONFIGURE_STEP, teamId: 0 })).toBe(
      "/apps/installation/configure?slug=zoom"
    );
  });
});

describe("getAppOnboardingRedirectUrl", () => {
  it("returns the encoded event types step url", () => {
    expect(getAppOnboardingRedirectUrl("zoom")).toBe(
      encodeURIComponent("/apps/installation/event-types?slug=zoom")
    );
  });

  it("keeps the teamId in the encoded url", () => {
    expect(getAppOnboardingRedirectUrl("zoom", 42)).toBe(
      encodeURIComponent("/apps/installation/event-types?slug=zoom&teamId=42")
    );
  });
});

describe("shouldRedirectToAppOnboarding", () => {
  it("is true for apps extending event types", () => {
    expect(shouldRedirectToAppOnboarding({ extendsFeature: "EventType" } as AppMeta)).toBe(true);
  });

  it("is false for any other app", () => {
    expect(shouldRedirectToAppOnboarding({ extendsFeature: "User" } as AppMeta)).toBe(false);
    expect(shouldRedirectToAppOnboarding({} as AppMeta)).toBe(false);
  });
});

describe("getInstallCountPerApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps query rows to a count per appId", async () => {
    mockQueryRaw.mockResolvedValue([
      { appId: "zoom", installCount: 5 },
      { appId: "google-calendar", installCount: 3 },
    ]);

    await expect(computeInstallCountsFromDB()).resolves.toEqual({ zoom: 5, "google-calendar": 3 });
  });

  it("returns an empty map when no app is installed", async () => {
    mockQueryRaw.mockResolvedValue([]);

    await expect(computeInstallCountsFromDB()).resolves.toEqual({});
  });

  it("throws when a row does not match the expected shape", async () => {
    mockQueryRaw.mockResolvedValue([{ appId: "zoom", installCount: "5" }]);

    await expect(computeInstallCountsFromDB()).rejects.toThrow();
  });

  it("reads the counts through the cache", async () => {
    mockQueryRaw.mockResolvedValue([{ appId: "zoom", installCount: 1 }]);

    await expect(getInstallCountPerApp()).resolves.toEqual({ zoom: 1 });
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });
});
