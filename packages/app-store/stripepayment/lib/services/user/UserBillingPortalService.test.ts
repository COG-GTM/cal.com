import type { NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCustomerId: vi.fn(),
  createPortalSession: vi.fn(),
}));

vi.mock("../../customer", () => ({ getStripeCustomerIdFromUserId: mocks.getCustomerId }));
vi.mock("../../server", () => ({
  default: { billingPortal: { sessions: { create: mocks.createPortalSession } } },
}));

import { UserBillingPortalService } from "./UserBillingPortalService";

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
}

describe("UserBillingPortalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCustomerId.mockResolvedValue("cus_123");
    mocks.createPortalSession.mockResolvedValue({ url: "https://billing.example.com/session" });
  });

  it("delegates customer lookup to the customer helper", async () => {
    await expect(new UserBillingPortalService().getCustomerId(7)).resolves.toBe("cus_123");
    expect(mocks.getCustomerId).toHaveBeenCalledWith(7);
  });

  it("returns 404 when the user has no Stripe customer", async () => {
    mocks.getCustomerId.mockResolvedValue(null);
    const response = createResponse();

    await new UserBillingPortalService().processBillingPortal(7, "https://app.example.com", response);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ message: "CustomerId not found" });
  });

  it("creates a portal session and redirects the user", async () => {
    const response = createResponse();
    const returnUrl = "https://app.example.com/settings/billing";

    await new UserBillingPortalService().processBillingPortal(7, returnUrl, response);

    expect(mocks.createPortalSession).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: returnUrl,
    });
    expect(response.redirect).toHaveBeenCalledWith(302, "https://billing.example.com/session");
  });

  it("maps Stripe failures to a stable error", async () => {
    mocks.createPortalSession.mockRejectedValue(new Error("stripe unavailable"));

    await expect(
      new UserBillingPortalService().processBillingPortal(7, "https://app.example.com", createResponse())
    ).rejects.toThrow("Failed to create billing portal session");
  });
});
