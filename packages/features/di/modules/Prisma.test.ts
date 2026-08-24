import { prisma, readonlyPrisma } from "@calcom/prisma";
import { describe, expect, it, vi } from "vitest";
import { createContainer } from "../di";
import { DI_TOKENS } from "../tokens";
import { moduleLoader, prismaModule } from "./Prisma";

vi.mock("@calcom/prisma", () => ({
  prisma: { $connect: vi.fn() },
  readonlyPrisma: { $connect: vi.fn() },
}));

describe("prisma module", () => {
  it("exposes the read-write and read-only tokens", () => {
    expect(moduleLoader.token).toBe(DI_TOKENS.PRISMA_CLIENT);
    expect(moduleLoader.readOnlyToken).toBe(DI_TOKENS.READ_ONLY_PRISMA_CLIENT);
  });

  it("resolves both prisma clients", () => {
    const container = createContainer();
    moduleLoader.loadModule(container);

    expect(container.get(DI_TOKENS.PRISMA_CLIENT)).toBe(prisma);
    expect(container.get(DI_TOKENS.READ_ONLY_PRISMA_CLIENT)).toBe(readonlyPrisma);
  });

  it("binds the clients as singletons", () => {
    const container = createContainer();
    container.load(DI_TOKENS.PRISMA_MODULE, prismaModule);

    expect(container.get(DI_TOKENS.PRISMA_CLIENT)).toBe(container.get(DI_TOKENS.PRISMA_CLIENT));
  });
});
