import { describe, expect, it } from "vitest";
import { createContainer } from "../../di";
import { SHARED_TOKENS } from "../shared.tokens";
import type { ISimpleLogger } from "./logger.service";
import { moduleLoader } from "./logger.service";

describe("logger.service module", () => {
  it("exposes the logger token", () => {
    expect(moduleLoader.token).toBe(SHARED_TOKENS.LOGGER);
  });

  it("resolves a logger implementing the ISimpleLogger interface", () => {
    const container = createContainer();
    moduleLoader.loadModule(container);

    const logger = container.get<ISimpleLogger>(SHARED_TOKENS.LOGGER);

    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
  });
});
