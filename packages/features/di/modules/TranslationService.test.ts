import { TRANSLATION_DI_TOKENS } from "@calcom/features/translation/di/tokens";
import { TranslationService } from "@calcom/features/translation/services/TranslationService";
import { describe, expect, it, vi } from "vitest";
import { createContainer } from "../di";
import { moduleLoader } from "./TranslationService";

vi.mock("@calcom/prisma", () => {
  const client = { $connect: vi.fn() };
  return { default: client, prisma: client, readonlyPrisma: client };
});

vi.mock("@calcom/lib/server/service/lingoDotDev", () => ({
  LingoDotDevService: { localizeText: vi.fn().mockResolvedValue("hola") },
}));

describe("translation service module", () => {
  it("exposes the translation service token", () => {
    expect(moduleLoader.token).toBe(TRANSLATION_DI_TOKENS.TRANSLATION_SERVICE);
  });

  it("loads its repositories and resolves the service asynchronously", async () => {
    const container = createContainer();
    moduleLoader.loadModule(container);

    expect(container.get(TRANSLATION_DI_TOKENS.WORKFLOW_STEP_TRANSLATION_REPOSITORY)).toBeDefined();
    expect(container.get(TRANSLATION_DI_TOKENS.EVENT_TYPE_TRANSLATION_REPOSITORY)).toBeDefined();

    const service = await container.get<Promise<TranslationService>>(moduleLoader.token);
    expect(service).toBeInstanceOf(TranslationService);
  });
});
