import type { PrismaClient } from "@calcom/prisma";
import { prisma as defaultPrisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamRepository } from "../../../teams/repositories/TeamRepository";
import { DueInvoiceService } from "./DueInvoiceService";

vi.mock("@calcom/prisma", () => ({
  prisma: {
    monthlyProration: { findFirst: vi.fn(), findMany: vi.fn() },
    membership: { findMany: vi.fn() },
  },
}));

const mockFindTeamMembersWithPermission = vi.fn();

vi.mock("../../../teams/repositories/TeamRepository", () => ({
  TeamRepository: vi.fn(function () {
    return { findTeamMembersWithPermission: mockFindTeamMembersWithPermission };
  }),
}));

const NOW = new Date("2025-06-15T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const buildPrisma = () => ({
  monthlyProration: { findFirst: vi.fn(), findMany: vi.fn() },
  membership: { findMany: vi.fn() },
});

describe("DueInvoiceService", () => {
  let prismaMock: ReturnType<typeof buildPrisma>;
  let service: DueInvoiceService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock = buildPrisma();
    service = new DueInvoiceService(prismaMock as unknown as PrismaClient);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("falls back to the default prisma client", async () => {
      vi.mocked(defaultPrisma.monthlyProration.findFirst).mockResolvedValue(null);

      const result = await new DueInvoiceService().hasBlockingProration(1);

      expect(result).toBe(false);
      expect(defaultPrisma.monthlyProration.findFirst).toHaveBeenCalledTimes(1);
      expect(prismaMock.monthlyProration.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("hasBlockingProration", () => {
    it("queries failed/invoiced prorations older than 7 days and returns true when found", async () => {
      prismaMock.monthlyProration.findFirst.mockResolvedValue({ id: "pr_1" });

      const result = await service.hasBlockingProration(5);

      expect(result).toBe(true);
      expect(prismaMock.monthlyProration.findFirst).toHaveBeenCalledWith({
        where: {
          teamId: 5,
          status: { in: ["FAILED", "INVOICE_CREATED"] },
          createdAt: { lte: daysAgo(7) },
        },
        select: { id: true },
      });
    });

    it("returns false when nothing matches", async () => {
      prismaMock.monthlyProration.findFirst.mockResolvedValue(null);

      await expect(service.hasBlockingProration(5)).resolves.toBe(false);
    });
  });

  describe("canInviteToTeam", () => {
    it("allows invites when there is no blocking proration", async () => {
      prismaMock.monthlyProration.findFirst.mockResolvedValue(null);

      const result = await service.canInviteToTeam({
        teamId: 5,
        inviteeEmails: ["a@example.com"],
        isSubTeam: false,
        parentOrgId: null,
      });

      expect(result).toEqual({ allowed: true });
      expect(prismaMock.monthlyProration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ teamId: 5 }) })
      );
      expect(prismaMock.membership.findMany).not.toHaveBeenCalled();
    });

    it("checks billing against the parent org when present", async () => {
      prismaMock.monthlyProration.findFirst.mockResolvedValue(null);

      await service.canInviteToTeam({
        teamId: 5,
        inviteeEmails: [],
        isSubTeam: true,
        parentOrgId: 99,
      });

      expect(prismaMock.monthlyProration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ teamId: 99 }) })
      );
    });

    it("blocks a standalone team with a blocking proration", async () => {
      prismaMock.monthlyProration.findFirst.mockResolvedValue({ id: "pr_1" });

      const result = await service.canInviteToTeam({
        teamId: 5,
        inviteeEmails: ["a@example.com"],
        isSubTeam: false,
        parentOrgId: null,
      });

      expect(result).toEqual({ allowed: false, reason: "invitations_blocked_unpaid_invoice" });
      expect(prismaMock.membership.findMany).not.toHaveBeenCalled();
    });

    it("blocks a sub-team without a parent org even when isSubTeam is true", async () => {
      prismaMock.monthlyProration.findFirst.mockResolvedValue({ id: "pr_1" });

      const result = await service.canInviteToTeam({
        teamId: 5,
        inviteeEmails: [],
        isSubTeam: true,
        parentOrgId: null,
      });

      expect(result.allowed).toBe(false);
      expect(prismaMock.membership.findMany).not.toHaveBeenCalled();
    });

    it("allows sub-team invites when every invitee is an accepted org member (case-insensitive)", async () => {
      prismaMock.monthlyProration.findFirst.mockResolvedValue({ id: "pr_1" });
      prismaMock.membership.findMany.mockResolvedValue([
        { user: { email: "alice@example.com" } },
        { user: { email: "BOB@example.com" } },
      ]);

      const result = await service.canInviteToTeam({
        teamId: 5,
        inviteeEmails: ["Alice@Example.com", "bob@example.com"],
        isSubTeam: true,
        parentOrgId: 99,
      });

      expect(result).toEqual({ allowed: true });
      expect(prismaMock.membership.findMany).toHaveBeenCalledWith({
        where: {
          teamId: 99,
          accepted: true,
          user: { email: { in: ["Alice@Example.com", "bob@example.com"] } },
        },
        select: { user: { select: { email: true } } },
      });
    });

    it("allows sub-team invites with an empty invitee list without querying memberships", async () => {
      prismaMock.monthlyProration.findFirst.mockResolvedValue({ id: "pr_1" });

      const result = await service.canInviteToTeam({
        teamId: 5,
        inviteeEmails: [],
        isSubTeam: true,
        parentOrgId: 99,
      });

      expect(result).toEqual({ allowed: true });
      expect(prismaMock.membership.findMany).not.toHaveBeenCalled();
    });

    it("blocks sub-team invites when any invitee is not an org member", async () => {
      prismaMock.monthlyProration.findFirst.mockResolvedValue({ id: "pr_1" });
      prismaMock.membership.findMany.mockResolvedValue([{ user: { email: "alice@example.com" } }]);

      const result = await service.canInviteToTeam({
        teamId: 5,
        inviteeEmails: ["alice@example.com", "new@example.com"],
        isSubTeam: true,
        parentOrgId: 99,
      });

      expect(result).toEqual({ allowed: false, reason: "invitations_blocked_unpaid_invoice" });
    });
  });

  describe("getBannerDataForUser", () => {
    const membership = (teamId: number, isOrganization: boolean) => ({
      teamId,
      team: { id: teamId, isOrganization },
    });

    it("returns an empty list when the user has no admin/owner memberships", async () => {
      prismaMock.membership.findMany.mockResolvedValue([]);

      const result = await service.getBannerDataForUser(7);

      expect(result).toEqual([]);
      expect(TeamRepository).toHaveBeenCalledWith(prismaMock);
      expect(prismaMock.membership.findMany).toHaveBeenCalledWith({
        where: {
          userId: 7,
          accepted: true,
          role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
        },
        select: { teamId: true, team: { select: { id: true, isOrganization: true } } },
      });
      expect(prismaMock.monthlyProration.findMany).not.toHaveBeenCalled();
    });

    it("returns an empty list when the user lacks billing permission on every team", async () => {
      prismaMock.membership.findMany.mockResolvedValue([membership(1, false)]);
      mockFindTeamMembersWithPermission.mockResolvedValue([{ id: 999 }]);

      const result = await service.getBannerDataForUser(7);

      expect(result).toEqual([]);
      expect(prismaMock.monthlyProration.findMany).not.toHaveBeenCalled();
    });

    it("maps overdue prorations and flags blocking ones for permitted teams", async () => {
      prismaMock.membership.findMany.mockResolvedValue([
        membership(1, false),
        membership(2, true),
        membership(3, false),
      ]);
      mockFindTeamMembersWithPermission
        .mockResolvedValueOnce([{ id: 7 }])
        .mockResolvedValueOnce([{ id: 7 }, { id: 8 }])
        .mockResolvedValueOnce([{ id: 8 }]);
      prismaMock.monthlyProration.findMany.mockResolvedValue([
        {
          id: "pr_old",
          teamId: 1,
          proratedAmount: 1200,
          createdAt: daysAgo(8),
          monthKey: "2025-05",
          invoiceUrl: "https://stripe.test/inv1",
          team: { id: 1, name: "Team One", isOrganization: false },
        },
        {
          id: "pr_new",
          teamId: 2,
          proratedAmount: 500,
          createdAt: daysAgo(2),
          monthKey: "2025-06",
          invoiceUrl: null,
          team: { id: 2, name: "Org Two", isOrganization: true },
        },
      ]);

      const result = await service.getBannerDataForUser(7);

      expect(mockFindTeamMembersWithPermission).toHaveBeenNthCalledWith(1, {
        teamId: 1,
        permission: "team.manageBilling",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });
      expect(mockFindTeamMembersWithPermission).toHaveBeenNthCalledWith(2, {
        teamId: 2,
        permission: "organization.manageBilling",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });
      expect(prismaMock.monthlyProration.findMany).toHaveBeenCalledWith({
        where: { teamId: { in: [1, 2] }, status: { in: ["FAILED", "INVOICE_CREATED"] } },
        include: { team: { select: { id: true, name: true, isOrganization: true } } },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toEqual([
        {
          teamId: 1,
          teamName: "Team One",
          isOrganization: false,
          amountDue: 1200,
          isBlocking: true,
          prorationId: "pr_old",
          monthKey: "2025-05",
          invoiceUrl: "https://stripe.test/inv1",
        },
        {
          teamId: 2,
          teamName: "Org Two",
          isOrganization: true,
          amountDue: 500,
          isBlocking: false,
          prorationId: "pr_new",
          monthKey: "2025-06",
          invoiceUrl: null,
        },
      ]);
    });

    it("treats a proration created exactly 7 days ago as blocking", async () => {
      prismaMock.membership.findMany.mockResolvedValue([membership(1, false)]);
      mockFindTeamMembersWithPermission.mockResolvedValue([{ id: 7 }]);
      prismaMock.monthlyProration.findMany.mockResolvedValue([
        {
          id: "pr_edge",
          teamId: 1,
          proratedAmount: 100,
          createdAt: daysAgo(7),
          monthKey: "2025-06",
          invoiceUrl: null,
          team: { id: 1, name: "Team One", isOrganization: false },
        },
      ]);

      const [banner] = await service.getBannerDataForUser(7);

      expect(banner.isBlocking).toBe(true);
    });

    it("falls back to the role-based membership when the permission check throws", async () => {
      prismaMock.membership.findMany.mockResolvedValue([membership(4, true)]);
      mockFindTeamMembersWithPermission.mockRejectedValue(new Error("pbac unavailable"));
      prismaMock.monthlyProration.findMany.mockResolvedValue([]);

      const result = await service.getBannerDataForUser(7);

      expect(result).toEqual([]);
      expect(prismaMock.monthlyProration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ teamId: { in: [4] } }) })
      );
    });
  });
});
