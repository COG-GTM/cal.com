import type { Stripe } from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBillingProviderService: vi.fn(),
  getCheckoutSession: vi.fn(),
  getCustomer: vi.fn(),
}));

vi.mock("@calcom/features/ee/billing/di/containers/Billing", () => ({
  getBillingProviderService: mocks.getBillingProviderService,
}));

import { getCustomerAndCheckoutSession } from "./getCustomerAndCheckoutSession";

describe("getCustomerAndCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBillingProviderService.mockReturnValue({
      getCheckoutSession: mocks.getCheckoutSession,
      getCustomer: mocks.getCustomer,
    });
    mocks.getCheckoutSession.mockResolvedValue({ id: "cs_123", customer: null });
    mocks.getCustomer.mockResolvedValue({ id: "cus_123", deleted: false });
  });

  it.each([null, undefined])("returns no customer when checkout has customer %s", async (customer) => {
    mocks.getCheckoutSession.mockResolvedValue({ id: "cs_123", customer });

    await expect(getCustomerAndCheckoutSession("cs_123")).resolves.toEqual({
      checkoutSession: { id: "cs_123", customer },
      stripeCustomer: null,
    });
    expect(mocks.getCustomer).not.toHaveBeenCalled();
  });

  it("resolves a string customer id", async () => {
    mocks.getCheckoutSession.mockResolvedValue({ id: "cs_123", customer: "cus_123" });

    await expect(getCustomerAndCheckoutSession("cs_123")).resolves.toEqual({
      checkoutSession: { id: "cs_123", customer: "cus_123" },
      stripeCustomer: { id: "cus_123", deleted: false },
    });
    expect(mocks.getCustomer).toHaveBeenCalledWith("cus_123");
  });

  it("returns no customer for a deleted checkout customer", async () => {
    const deleted = { id: "cus_123", deleted: true } as unknown as Stripe.Customer;
    mocks.getCheckoutSession.mockResolvedValue({ id: "cs_123", customer: deleted });

    await expect(getCustomerAndCheckoutSession("cs_123")).resolves.toMatchObject({ stripeCustomer: null });
    expect(mocks.getCustomer).not.toHaveBeenCalled();
  });

  it("uses an object customer's id", async () => {
    const customer = { id: "cus_456", deleted: false } as unknown as Stripe.Customer;
    mocks.getCheckoutSession.mockResolvedValue({ id: "cs_123", customer });

    await getCustomerAndCheckoutSession("cs_123");

    expect(mocks.getCustomer).toHaveBeenCalledWith("cus_456");
  });

  it("filters a deleted customer returned by the billing provider", async () => {
    mocks.getCheckoutSession.mockResolvedValue({ id: "cs_123", customer: "cus_123" });
    mocks.getCustomer.mockResolvedValue({ id: "cus_123", deleted: true });

    await expect(getCustomerAndCheckoutSession("cs_123")).resolves.toMatchObject({ stripeCustomer: null });
  });
});
