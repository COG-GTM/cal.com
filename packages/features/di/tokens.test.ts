import { describe, expect, it } from "vitest";
import { DI_TOKENS } from "./tokens";
import { WATCHLIST_DI_TOKENS } from "./watchlist/Watchlist.tokens";
import { WEBHOOK_TOKENS } from "./webhooks/Webhooks.tokens";

describe("DI_TOKENS", () => {
  it("exposes core infrastructure tokens as symbols", () => {
    for (const key of [
      "PRISMA_CLIENT",
      "READ_ONLY_PRISMA_CLIENT",
      "PRISMA_MODULE",
      "REDIS_CLIENT",
    ] as const) {
      expect(typeof DI_TOKENS[key]).toBe("symbol");
    }
  });

  it("has a distinct token for every entry", () => {
    const values = Object.values(DI_TOKENS);
    expect(new Set(values).size).toBe(values.length);
  });

  it("merges the feature-specific token groups", () => {
    for (const [key, value] of Object.entries(WATCHLIST_DI_TOKENS)) {
      expect(DI_TOKENS[key as keyof typeof DI_TOKENS]).toBe(value);
    }
    for (const [key, value] of Object.entries(WEBHOOK_TOKENS)) {
      expect(DI_TOKENS[key as keyof typeof DI_TOKENS]).toBe(value);
    }
  });

  it("pairs every repository/service token with a module token", () => {
    const moduleTokenKeys = Object.keys(DI_TOKENS).filter((key) => key.endsWith("_MODULE"));
    expect(moduleTokenKeys.length).toBeGreaterThan(0);
    for (const key of moduleTokenKeys) {
      expect(typeof DI_TOKENS[key as keyof typeof DI_TOKENS]).toBe("symbol");
    }
  });
});
