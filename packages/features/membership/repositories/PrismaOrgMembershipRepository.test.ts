import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockPrisma = {
  membership: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
};

const mockPrisma: MockPrisma = vi.hoisted(() => ({
  membership: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
}));

vi.mock("@calcom/prisma", () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}));

import { PrismaOrgMembershipRepository } from "./PrismaOrgMembershipRepository";

describe("PrismaOrgMembershipRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrgIdsWhereAdmin", () => {
    it("maps organization memberships to team IDs", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([{ teamId: 10 }, { teamId: 11 }]);

      await expect(PrismaOrgMembershipRepository.getOrgIdsWhereAdmin(3)).resolves.toEqual([10, 11]);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: {
          userId: 3,
          role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
          team: { parentId: null },
        },
        select: { teamId: true },
      });
    });

    it("returns an empty list when the user administers no organizations", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      await expect(PrismaOrgMembershipRepository.getOrgIdsWhereAdmin(3)).resolves.toEqual([]);
    });
  });

  describe("isLoggedInUserOrgAdminOfBookingHost", () => {
    it("returns false without querying the booking host when no admin organizations exist", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);

      await expect(PrismaOrgMembershipRepository.isLoggedInUserOrgAdminOfBookingHost(3, 4)).resolves.toBe(
        false
      );
      expect(mockPrisma.membership.findFirst).not.toHaveBeenCalled();
    });

    it("returns true for a direct organization membership", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([{ teamId: 10 }]);
      mockPrisma.membership.findFirst.mockResolvedValue({ userId: 4 });

      await expect(PrismaOrgMembershipRepository.isLoggedInUserOrgAdminOfBookingHost(3, 4)).resolves.toBe(
        true
      );
      expect(mockPrisma.membership.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.membership.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 4,
          teamId: { in: [10] },
          team: { parentId: null },
        },
        select: { userId: true },
      });
    });

    it("returns true when the booking host belongs to a team in an admin organization", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([{ teamId: 10 }]);
      mockPrisma.membership.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: 4 });

      await expect(PrismaOrgMembershipRepository.isLoggedInUserOrgAdminOfBookingHost(3, 4)).resolves.toBe(
        true
      );
      expect(mockPrisma.membership.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          userId: 4,
          team: { parentId: { in: [10] } },
        },
      });
    });

    it("returns false when neither organization nor team membership exists", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([{ teamId: 10 }]);
      mockPrisma.membership.findFirst.mockResolvedValue(null);

      await expect(PrismaOrgMembershipRepository.isLoggedInUserOrgAdminOfBookingHost(3, 4)).resolves.toBe(
        false
      );
      expect(mockPrisma.membership.findFirst).toHaveBeenCalledTimes(2);
    });
  });
});
