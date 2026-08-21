import { MembershipRole } from "@calcom/prisma/enums";
import type { NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  findTeam: vi.fn(),
  getSubscription: vi.fn(),
  createPortalSession: vi.fn(),
}));

vi.mock("@calcom/features/ee/teams/repositories/TeamRepository", () => ({
  TeamRepository: class {
    findByIdIncludePlatformBilling = mocks.findTeam;
  },
}));
vi.mock("@calcom/features/pbac/services/permission-check.service", () => ({
  PermissionCheckService: class {
    checkPermission = mocks.checkPermission;
  },
}));
vi.mock("@calcom/prisma", () => ({ default: {} }));
vi.mock("../../server", () => ({
  default: { billingPortal: { sessions: { create: mocks.createPortalSession } } },
}));
vi.mock("../../subscriptions", () => ({ getSubscriptionFromId: mocks.getSubscription }));

import { OrganizationBillingPortalService } from "./OrganizationBillingPortalService";

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
}

describe("OrganizationBillingPortalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkPermission.mockResolvedValue(true);
    mocks.findTeam.mockResolvedValue({ id: 1, isPlatform: false, metadata: { subscriptionId: "sub_123" } });
    mocks.getSubscription.mockResolvedValue({ customer: "cus_123" });
    mocks.createPortalSession.mockResolvedValue({ url: "https://billing.example.com/session" });
  });

  it("checks organization billing permissions", async () => {
    const service = new OrganizationBillingPortalService();

    await expect(service.checkPermissions(7, 8)).resolves.toBe(true);
    expect(mocks.checkPermission).toHaveBeenCalledWith({
      userId: 7,
      teamId: 8,
      permission: "organization.manageBilling",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });
  });

  it("uses Organization in the missing-customer error", async () => {
    mocks.findTeam.mockResolvedValue(null);
    const response = createResponse();

    await new OrganizationBillingPortalService().processBillingPortal(
      7,
      8,
      "https://app.example.com",
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      message: "Organization billing not properly configured. Please contact support.",
    });
  });

  it.each([
    ["missing team", null],
    ["missing subscription metadata", { id: 1, isPlatform: false, metadata: {} }],
    ["invalid subscription metadata", { id: 1, isPlatform: false, metadata: "invalid" }],
    ["platform without subscription", { id: 1, isPlatform: true, platformBilling: null, metadata: {} }],
  ])("returns null for %s", async (_label, team) => {
    mocks.findTeam.mockResolvedValue(team);

    await expect(new OrganizationBillingPortalService().getCustomerId(1)).resolves.toBeNull();
    expect(mocks.getSubscription).not.toHaveBeenCalled();
  });

  it("retrieves a customer from a platform subscription", async () => {
    mocks.findTeam.mockResolvedValue({
      id: 1,
      isPlatform: true,
      platformBilling: { subscriptionId: "sub_platform" },
      metadata: {},
    });

    await expect(new OrganizationBillingPortalService().getCustomerId(1)).resolves.toBe("cus_123");
    expect(mocks.getSubscription).toHaveBeenCalledWith("sub_platform");
  });

  it("returns null when the subscription has no customer", async () => {
    mocks.getSubscription.mockResolvedValue({ id: "sub_123" });

    await expect(new OrganizationBillingPortalService().getCustomerId(1)).resolves.toBeNull();
  });

  it("swallows subscription lookup failures", async () => {
    mocks.getSubscription.mockRejectedValue(new Error("stripe unavailable"));

    await expect(new OrganizationBillingPortalService().getCustomerId(1)).resolves.toBeNull();
  });

  it("retrieves a customer from organization subscription metadata", async () => {
    await expect(new OrganizationBillingPortalService().getCustomerId(1)).resolves.toBe("cus_123");
    expect(mocks.getSubscription).toHaveBeenCalledWith("sub_123");
  });
});
