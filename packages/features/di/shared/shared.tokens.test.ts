import { describe, expect, it } from "vitest";
import { SHARED_TOKENS } from "./shared.tokens";

describe("SHARED_TOKENS", () => {
  it("declares every infrastructure token as a distinct symbol", () => {
    const values = Object.values(SHARED_TOKENS);
    for (const value of values) {
      expect(typeof value).toBe("symbol");
    }
    expect(new Set(values).size).toBe(values.length);
  });

  it("pairs logger tokens with their module tokens", () => {
    expect(SHARED_TOKENS.LOGGER.description).toBe("ILogger");
    expect(SHARED_TOKENS.LOGGER_MODULE.description).toBe("ILoggerModule");
    expect(SHARED_TOKENS.TRIGGER_DEV_LOGGER.description).toBe("ITriggerDevLogger");
    expect(SHARED_TOKENS.TRIGGER_DEV_LOGGER_MODULE.description).toBe("ITriggerDevLoggerModule");
  });
});
