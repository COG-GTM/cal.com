import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  findTeam: vi.fn(),
  getSubscription: vi.fn(),
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
vi.mock("../../server", () => ({ default: {} }));
vi.mock("../../subscriptions", () => ({ getSubscriptionFromId: mocks.getSubscription }));

import { TeamBillingPortalService } from "./TeamBillingPortalService";

describe("TeamBillingPortalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkPermission.mockResolvedValue(true);
    mocks.findTeam.mockResolvedValue({ id: 1, isPlatform: false, metadata: { subscriptionId: "sub_123" } });
    mocks.getSubscription.mockResolvedValue({ id: "sub_123", customer: "cus_123" });
  });

  it("checks team billing permissions with admin and owner fallbacks", async () => {
    const service = new TeamBillingPortalService();

    await expect(service.checkPermissions(7, 8)).resolves.toBe(true);
    expect(mocks.checkPermission).toHaveBeenCalledWith({
      userId: 7,
      teamId: 8,
      permission: "team.manageBilling",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });
  });

  it.each([
    ["missing team", null],
    ["missing subscription metadata", { id: 1, isPlatform: false, metadata: {} }],
    ["invalid subscription metadata", { id: 1, isPlatform: false, metadata: "invalid" }],
    ["platform without subscription", { id: 1, isPlatform: true, platformBilling: null, metadata: {} }],
  ])("returns null for %s", async (_label, team) => {
    mocks.findTeam.mockResolvedValue(team);

    await expect(new TeamBillingPortalService().getCustomerId(1)).resolves.toBeNull();
    expect(mocks.getSubscription).not.toHaveBeenCalled();
  });

  it("uses a platform subscription id", async () => {
    mocks.findTeam.mockResolvedValue({
      id: 1,
      isPlatform: true,
      platformBilling: { subscriptionId: "sub_platform" },
      metadata: {},
    });

    await expect(new TeamBillingPortalService().getCustomerId(1)).resolves.toBe("cus_123");
    expect(mocks.getSubscription).toHaveBeenCalledWith("sub_platform");
  });

  it("returns null when the subscription has no customer", async () => {
    mocks.getSubscription.mockResolvedValue({ id: "sub_123" });

    await expect(new TeamBillingPortalService().getCustomerId(1)).resolves.toBeNull();
  });

  it("swallows subscription lookup failures", async () => {
    mocks.getSubscription.mockRejectedValue(new Error("stripe unavailable"));

    await expect(new TeamBillingPortalService().getCustomerId(1)).resolves.toBeNull();
  });
});
