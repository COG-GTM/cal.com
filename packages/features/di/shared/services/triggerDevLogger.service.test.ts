import { TriggerDevLogger } from "@calcom/lib/triggerDevLogger";
import { describe, expect, it } from "vitest";
import { createContainer } from "../../di";
import { SHARED_TOKENS } from "../shared.tokens";
import { moduleLoader } from "./triggerDevLogger.service";

describe("triggerDevLogger.service module", () => {
  it("exposes the trigger.dev logger token", () => {
    expect(moduleLoader.token).toBe(SHARED_TOKENS.TRIGGER_DEV_LOGGER);
  });

  it("resolves a TriggerDevLogger instance", () => {
    const container = createContainer();
    moduleLoader.loadModule(container);

    expect(container.get(SHARED_TOKENS.TRIGGER_DEV_LOGGER)).toBeInstanceOf(TriggerDevLogger);
  });
});
