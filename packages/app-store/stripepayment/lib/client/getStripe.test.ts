import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadStripe: vi.fn(),
}));

vi.mock("@stripe/stripe-js/pure", () => ({ loadStripe: mocks.loadStripe }));

describe("getStripe", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.loadStripe.mockResolvedValue({ id: "stripe" });
  });

  it("loads Stripe with the environment key and memoizes the promise", async () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLIC_KEY", "pk_env");
    const { default: getStripe } = await import("./getStripe");

    const first = getStripe();
    const second = getStripe("pk_override");

    await expect(first).resolves.toEqual({ id: "stripe" });
    await expect(second).resolves.toEqual({ id: "stripe" });
    expect(mocks.loadStripe).toHaveBeenCalledTimes(1);
    expect(mocks.loadStripe).toHaveBeenCalledWith("pk_env");
  });

  it("prioritizes an explicitly supplied public key", async () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLIC_KEY", "pk_env");
    const { default: getStripe } = await import("./getStripe");

    getStripe("pk_override");

    expect(mocks.loadStripe).toHaveBeenCalledWith("pk_override");
  });

  it("uses an empty key when no environment key is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLIC_KEY", "");
    const { default: getStripe } = await import("./getStripe");

    getStripe();

    expect(mocks.loadStripe).toHaveBeenCalledWith("");
  });
});
