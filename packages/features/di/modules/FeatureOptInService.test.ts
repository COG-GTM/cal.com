import { FEATURE_OPT_IN_DI_TOKENS } from "@calcom/features/feature-opt-in/di/tokens";
import { FeatureOptInService } from "@calcom/features/feature-opt-in/services/FeatureOptInService";
import { describe, expect, it, vi } from "vitest";
import { createContainer } from "../di";
import { moduleLoader } from "./FeatureOptInService";

vi.mock("@calcom/prisma", () => {
  const client = { $connect: vi.fn() };
  return { default: client, prisma: client, readonlyPrisma: client };
});

describe("feature opt-in service module", () => {
  it("exposes the feature opt-in service token", () => {
    expect(moduleLoader.token).toBe(FEATURE_OPT_IN_DI_TOKENS.FEATURE_OPT_IN_SERVICE);
  });

  it("loads all cached feature repositories and resolves the service", () => {
    const container = createContainer();
    moduleLoader.loadModule(container);

    expect(container.get(moduleLoader.token)).toBeInstanceOf(FeatureOptInService);
  });
});
