import { WEBAPP_URL } from "@calcom/lib/constants";
import type { NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPortalSession: vi.fn(),
}));

vi.mock("@calcom/features/ee/teams/repositories/TeamRepository", () => ({
  TeamRepository: class {},
}));

vi.mock("@calcom/features/pbac/services/permission-check.service", () => ({
  PermissionCheckService: class {},
}));

vi.mock("@calcom/prisma", () => ({ default: {} }));
vi.mock("../../server", () => ({
  default: { billingPortal: { sessions: { create: mocks.createPortalSession } } },
}));

import { BillingPortalService } from "./BillingPortalService";

class TestBillingPortalService extends BillingPortalService {
  hasPermission = true;
  customerId: string | null = "cus_123";

  async checkPermissions() {
    return this.hasPermission;
  }

  async getCustomerId() {
    return this.customerId;
  }

  returnUrl(returnTo?: string) {
    return this.buildReturnUrl(returnTo);
  }

  subscriptionId(metadata: Parameters<typeof this.getValidatedTeamSubscriptionId>[0]) {
    return this.getValidatedTeamSubscriptionId(metadata);
  }

  platformSubscriptionId(subscriptionId?: string | null) {
    return this.getValidatedTeamSubscriptionIdForPlatform(subscriptionId);
  }
}

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
}

describe("BillingPortalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPortalSession.mockResolvedValue({ url: "https://billing.example.com/session" });
  });

  it("returns 403 when the user lacks permission", async () => {
    const service = new TestBillingPortalService();
    service.hasPermission = false;
    const response = createResponse();

    await service.processBillingPortal(1, 2, `${WEBAPP_URL}/settings/billing`, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({ message: "Forbidden" });
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });

  it("returns 400 when no customer is configured", async () => {
    const service = new TestBillingPortalService();
    service.customerId = null;
    const response = createResponse();

    await service.processBillingPortal(1, 2, `${WEBAPP_URL}/settings/billing`, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      message: "Team billing not properly configured. Please contact support.",
    });
  });

  it("creates a billing portal session and redirects", async () => {
    const service = new TestBillingPortalService();
    const response = createResponse();
    const returnUrl = `${WEBAPP_URL}/settings/billing`;

    await service.processBillingPortal(1, 2, returnUrl, response);

    expect(mocks.createPortalSession).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: returnUrl,
    });
    expect(response.redirect).toHaveBeenCalledWith(302, "https://billing.example.com/session");
  });

  it("maps Stripe portal failures to a stable error", async () => {
    mocks.createPortalSession.mockRejectedValue(new Error("stripe unavailable"));
    const service = new TestBillingPortalService();

    await expect(
      service.processBillingPortal(1, 2, `${WEBAPP_URL}/settings/billing`, createResponse())
    ).rejects.toThrow("Failed to create billing portal session");
  });

  it("builds default and safe return URLs", () => {
    const service = new TestBillingPortalService();

    expect(service.returnUrl()).toBe(`${WEBAPP_URL}/settings/billing`);
    expect(service.returnUrl(123 as unknown as string)).toBe(`${WEBAPP_URL}/settings/billing`);
    expect(service.returnUrl(`${WEBAPP_URL}/settings/profile`)).toBe(`${WEBAPP_URL}/settings/profile`);
    expect(service.returnUrl("https://malicious.example.com")).toBe(`${WEBAPP_URL}/`);
  });

  it("validates team subscription metadata", () => {
    const service = new TestBillingPortalService();

    expect(service.subscriptionId("invalid")).toBeNull();
    expect(service.subscriptionId({})).toBeNull();
    expect(service.subscriptionId({ subscriptionId: "sub_123" })).toBe("sub_123");
    expect(service.platformSubscriptionId()).toBeNull();
    expect(service.platformSubscriptionId(null)).toBeNull();
    expect(service.platformSubscriptionId("sub_456")).toBe("sub_456");
  });
});
