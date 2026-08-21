import { afterEach, describe, expect, it, vi } from "vitest";

describe("stripe utility helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reads premium and team price environment values", async () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PREMIUM_PLAN_PRICE_MONTHLY", "price_premium");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PREMIUM_PLAN_PRODUCT_ID", "prod_premium");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_TEAM_MONTHLY_PRICE_ID", "price_team");
    const utils = await import("./utils");

    expect(utils.getPremiumMonthlyPlanPriceId()).toBe("price_premium");
    expect(utils.getPremiumPlanProductId()).toBe("prod_premium");
    expect(utils.getPerSeatPlanPrice()).toBe("price_team");
  });

  it("returns empty strings when price variables are unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PREMIUM_PLAN_PRICE_MONTHLY", "");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PREMIUM_PLAN_PRODUCT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_TEAM_MONTHLY_PRICE_ID", "");
    const utils = await import("./utils");

    expect(utils.getPremiumMonthlyPlanPriceId()).toBe("");
    expect(utils.getPremiumPlanProductId()).toBe("");
    expect(utils.getPerSeatPlanPrice()).toBe("");
  });

  it("reads or rejects the phone number price variable", async () => {
    vi.stubEnv("STRIPE_PHONE_NUMBER_MONTHLY_PRICE_ID", "price_phone");
    const configured = await import("./utils");
    expect(configured.getPhoneNumberMonthlyPriceId()).toBe("price_phone");

    vi.resetModules();
    vi.stubEnv("STRIPE_PHONE_NUMBER_MONTHLY_PRICE_ID", "");
    const unconfigured = await import("./utils");
    expect(() => unconfigured.getPhoneNumberMonthlyPriceId()).toThrow(
      "STRIPE_PHONE_NUMBER_MONTHLY_PRICE_ID env var is not set"
    );
  });

  it("returns the premium plan display value", async () => {
    const utils = await import("./utils");

    expect(utils.getPremiumPlanPriceValue()).toBe("$29/month");
  });
});
