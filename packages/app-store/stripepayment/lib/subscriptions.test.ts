import type { Stripe } from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customerRetrieve: vi.fn(),
  subscriptionRetrieve: vi.fn(),
}));

vi.mock("./server", () => ({
  default: {
    customers: { retrieve: mocks.customerRetrieve },
    subscriptions: { retrieve: mocks.subscriptionRetrieve },
  },
}));

import { getSubscriptionFromId, retrieveSubscriptionIdFromStripeCustomerId } from "./subscriptions";

describe("subscription helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.customerRetrieve.mockResolvedValue({
      id: "cus_123",
      deleted: false,
      subscriptions: { data: [{ id: "sub_123" }] },
    });
    mocks.subscriptionRetrieve.mockResolvedValue({ id: "sub_123" });
  });

  it("retrieves subscriptions with expanded plan data", async () => {
    await expect(retrieveSubscriptionIdFromStripeCustomerId("cus_123")).resolves.toEqual({
      subscriptionId: "sub_123",
    });
    expect(mocks.customerRetrieve).toHaveBeenCalledWith("cus_123", {
      expand: ["subscriptions.data.plan"],
    });
  });

  it.each([
    null,
    { id: "cus_123", deleted: true },
    { id: "cus_123", deleted: false, subscriptions: undefined },
    { id: "cus_123", deleted: false, subscriptions: { data: [] } },
  ])("returns Not found for incomplete customer data: %s", async (customer) => {
    mocks.customerRetrieve.mockResolvedValue(customer);

    await expect(retrieveSubscriptionIdFromStripeCustomerId("cus_123")).resolves.toEqual({
      message: "Not found",
    });
  });

  it("delegates subscription retrieval", async () => {
    const subscription = { id: "sub_123" } as unknown as Stripe.Subscription;
    mocks.subscriptionRetrieve.mockResolvedValue(subscription);

    await expect(getSubscriptionFromId("sub_123")).resolves.toBe(subscription);
    expect(mocks.subscriptionRetrieve).toHaveBeenCalledWith("sub_123");
  });
});
