import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/prisma", () => ({ default: {}, prisma: {}, readonlyPrisma: {} }));

import { OAuthService } from "../services/OAuthService";
import { getOAuthService } from "./OAuthService.container";

describe("getOAuthService", () => {
  it("returns an OAuthService instance", () => {
    expect(getOAuthService()).toBeInstanceOf(OAuthService);
  });

  it("returns an OAuthService on repeated calls", () => {
    expect(getOAuthService()).toBeInstanceOf(OAuthService);
    expect(getOAuthService()).toBeInstanceOf(OAuthService);
  });
});
