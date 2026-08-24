import { describe, expect, it, vi } from "vitest";
import { createContainer } from "../../di";
import { SHARED_TOKENS } from "../shared.tokens";
import { moduleLoader, taskerServiceModule } from "./tasker.service";

vi.mock("@calcom/features/tasker", () => ({
  default: { create: vi.fn(), cleanup: vi.fn(), processQueue: vi.fn() },
}));

describe("tasker.service module", () => {
  it("exposes the tasker token", () => {
    expect(moduleLoader.token).toBe(SHARED_TOKENS.TASKER);
  });

  it("resolves the shared tasker instance", async () => {
    const { default: tasker } = await import("@calcom/features/tasker");
    const container = createContainer();
    moduleLoader.loadModule(container);

    expect(container.get(SHARED_TOKENS.TASKER)).toBe(tasker);
  });

  it("can be loaded directly as a module", async () => {
    const { default: tasker } = await import("@calcom/features/tasker");
    const container = createContainer();
    container.load(SHARED_TOKENS.TASKER, taskerServiceModule);

    expect(container.get(SHARED_TOKENS.TASKER)).toBe(tasker);
  });
});
