import { createContainer } from "@calcom/features/di/di";
import { describe, expect, it } from "vitest";
import { PrismaRoutingFormResponseRepository } from "../repositories/PrismaRoutingFormResponseRepository";
import { moduleLoader } from "./RoutingFormResponseRepository.module";
import { ROUTING_FORM_DI_TOKENS } from "./tokens";

describe("routingFormResponseRepositoryModule", () => {
  it("binds the routing form response repository token to the prisma implementation", () => {
    const container = createContainer();
    moduleLoader.loadModule(container);

    const repository = container.get<PrismaRoutingFormResponseRepository>(moduleLoader.token);

    expect(repository).toBeInstanceOf(PrismaRoutingFormResponseRepository);
  });

  it("exposes the repository token of the module", () => {
    expect(moduleLoader.token).toBe(ROUTING_FORM_DI_TOKENS.ROUTING_FORM_RESPONSE_REPOSITORY);
  });

  it("resolves the same instance on repeated lookups", () => {
    const container = createContainer();
    moduleLoader.loadModule(container);

    expect(container.get(moduleLoader.token)).toBe(container.get(moduleLoader.token));
  });
});
