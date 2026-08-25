import "@calcom/testing/lib/__mocks__/prismaMock";

import { AccessCodeRepository } from "@calcom/features/oauth/repositories/AccessCodeRepository";
import { OAuthClientRepository } from "@calcom/features/oauth/repositories/OAuthClientRepository";
import { OAuthService } from "@calcom/features/oauth/services/OAuthService";
import { describe, expect, it } from "vitest";
import { moduleLoader as accessCodeRepositoryModuleLoader } from "./AccessCodeRepository.module";
import { moduleLoader as oAuthClientRepositoryModuleLoader } from "./OAuthClientRepository.module";
import { getOAuthService } from "./OAuthService.container";
import { moduleLoader as teamRepositoryModuleLoader } from "./TeamRepository.module";
import { OAUTH_DI_TOKENS } from "./tokens";

describe("OAuth DI wiring", () => {
  it("resolves an OAuthService with all of its dependencies", () => {
    const service = getOAuthService();

    expect(service).toBeInstanceOf(OAuthService);
  });

  it("returns a service resolved from the shared container on repeated calls", () => {
    expect(getOAuthService()).toBeInstanceOf(OAuthService);
    expect(getOAuthService()).toBeInstanceOf(OAuthService);
  });

  it("binds the repository modules on their tokens", async () => {
    const { createContainer } = await import("@calcom/features/di/di");
    const container = createContainer();

    accessCodeRepositoryModuleLoader.loadModule(container);
    oAuthClientRepositoryModuleLoader.loadModule(container);
    teamRepositoryModuleLoader.loadModule(container);

    expect(container.get(accessCodeRepositoryModuleLoader.token)).toBeInstanceOf(AccessCodeRepository);
    expect(container.get(oAuthClientRepositoryModuleLoader.token)).toBeInstanceOf(OAuthClientRepository);
    expect(container.get(teamRepositoryModuleLoader.token)).toBeDefined();
  });

  it("exposes distinct tokens for every binding", () => {
    const tokens = Object.values(OAUTH_DI_TOKENS);

    expect(new Set(tokens).size).toBe(tokens.length);
  });
});
