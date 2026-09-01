import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockPrisma = {
  membership: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
  user: { findUnique: ReturnType<typeof vi.fn> };
  team: { findMany: ReturnType<typeof vi.fn> };
};

type MockProfileRepository = {
  getLookupTarget: ReturnType<typeof vi.fn>;
  findByUid: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
};

const {
  mockPrisma,
  mockProfileRepository,
}: {
  mockPrisma: MockPrisma;
  mockProfileRepository: MockProfileRepository;
} = vi.hoisted(() => ({
  mockPrisma: {
    membership: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    team: { findMany: vi.fn() },
  },
  mockProfileRepository: {
    getLookupTarget: vi.fn(),
    findByUid: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock("@calcom/prisma", () => ({
  default: mockPrisma,
  prisma: mockPrisma,
  availabilityUserSelect: { id: true, timeZone: true },
}));

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  LookupTarget: { User: 0, Profile: 1 },
  ProfileRepository: mockProfileRepository,
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  withSelectedCalendars: vi.fn((user) => ({ ...user, selectedCalendars: [] })),
}));

vi.mock("@calcom/lib/logger", () => ({
  default: { getSubLogger: () => ({ debug: vi.fn() }) },
}));

vi.mock("@calcom/lib/server/eventTypeSelect", () => ({ eventTypeSelect: { id: true } }));
vi.mock("@calcom/prisma/selects/credential", () => ({
  credentialForCalendarServiceSelect: { id: true },
}));

import { MembershipRepository } from "./MembershipRepository";

const userTarget = (id: number): { type: number; id: number } => ({ type: 0, id });
const profileTarget = (target: Record<string, unknown>): { type: number; [key: string]: unknown } => ({
  type: 1,
  ...target,
});

describe("MembershipRepository", () => {
  let repository: MembershipRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new MembershipRepository(mockPrisma as unknown as PrismaClient);
  });

  describe("hasMembership", () => {
    it("returns true when an accepted membership exists", async () => {
      mockPrisma.membership.findFirst.mockResolvedValue({ id: 1 });

      await expect(repository.hasMembership({ userId: 2, teamId: 3 })).resolves.toBe(true);
      expect(mockPrisma.membership.findFirst).toHaveBeenCalledWith({
        where: { userId: 2, teamId: 3, accepted: true },
        select: { id: true },
      });
    });

    it("returns false when no membership exists", async () => {
      mockPrisma.membership.findFirst.mockResolvedValue(null);
      await expect(repository.hasMembership({ userId: 2, teamId: 3 })).resolves.toBe(false);
    });

    it("propagates database errors", async () => {
      mockPrisma.membership.findFirst.mockRejectedValue(new Error("db down"));
      await expect(repository.hasMembership({ userId: 2, teamId: 3 })).rejects.toThrow("db down");
    });
  });

  describe("listAcceptedTeamMemberIds", () => {
    it("maps accepted memberships to user IDs", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([{ userId: 4 }, { userId: 5 }]);
      await expect(repository.listAcceptedTeamMemberIds({ teamId: 3 })).resolves.toEqual([4, 5]);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { teamId: 3, accepted: true },
        select: { userId: true },
      });
    });

    it("returns an empty list for an undefined result", async () => {
      mockPrisma.membership.findMany.mockResolvedValue(undefined);
      await expect(repository.listAcceptedTeamMemberIds({ teamId: 3 })).resolves.toEqual([]);
    });
  });

  describe("create", () => {
    it("adds createdAt and spreads membership data", async () => {
      const data = { teamId: 3, userId: 4, accepted: true, role: MembershipRole.MEMBER };
      const result = { id: 8, ...data };
      mockPrisma.membership.create.mockResolvedValue(result);

      await expect(MembershipRepository.create(data)).resolves.toBe(result);
      expect(mockPrisma.membership.create).toHaveBeenCalledWith({
        data: { createdAt: expect.any(Date), ...data },
      });
    });
  });

  describe("hasAnyAcceptedMembershipByUserId", () => {
    it.each([
      [{ id: 1 }, true],
      [null, false],
    ])("returns %s as %s", async (membership, expected) => {
      mockPrisma.membership.findFirst.mockResolvedValue(membership);
      await expect(MembershipRepository.hasAnyAcceptedMembershipByUserId(2)).resolves.toBe(expected);
      expect(mockPrisma.membership.findFirst).toHaveBeenCalledWith({
        where: { accepted: true, userId: 2, team: { slug: { not: null } } },
        select: { id: true },
      });
    });
  });

  describe("findAcceptedMembershipsByUserIdsInTeam", () => {
    it("filters accepted memberships by user IDs and team", async () => {
      const result = [{ id: 1 }];
      mockPrisma.membership.findMany.mockResolvedValue(result);
      await expect(
        MembershipRepository.findAcceptedMembershipsByUserIdsInTeam({ userIds: [2, 3], teamId: 4 })
      ).resolves.toBe(result);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { userId: { in: [2, 3] }, accepted: true, teamId: 4 },
      });
    });
  });

  describe("createMany", () => {
    it("adds createdAt to every item", async () => {
      const data = [
        { teamId: 1, userId: 2, accepted: true, role: MembershipRole.MEMBER },
        { teamId: 1, userId: 3, accepted: false, role: MembershipRole.ADMIN },
      ];
      const result = { count: 2 };
      mockPrisma.membership.createMany.mockResolvedValue(result);

      await expect(MembershipRepository.createMany(data)).resolves.toBe(result);
      expect(mockPrisma.membership.createMany).toHaveBeenCalledWith({
        data: data.map((item) => ({ createdAt: expect.any(Date), ...item })),
      });
    });
  });

  describe("findAllByUpIdIncludeTeam", () => {
    it("looks up a user target and merges additional where clauses", async () => {
      const result = [{ id: 1 }];
      mockProfileRepository.getLookupTarget.mockReturnValue(userTarget(7));
      mockPrisma.membership.findMany.mockResolvedValue(result);

      await expect(
        MembershipRepository.findAllByUpIdIncludeTeam({ upId: "usr-7" }, { where: { accepted: true } })
      ).resolves.toBe(result);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { userId: 7, accepted: true },
        include: {
          team: {
            include: {
              parent: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  logoUrl: true,
                  parentId: true,
                  metadata: true,
                },
              },
            },
          },
        },
      });
    });

    it("looks up a profile by uid", async () => {
      mockProfileRepository.getLookupTarget.mockReturnValue(profileTarget({ uid: "profile-uid" }));
      mockProfileRepository.findByUid.mockResolvedValue({ user: { id: 8 } });
      mockPrisma.membership.findMany.mockResolvedValue([]);

      await expect(
        MembershipRepository.findAllByUpIdIncludeTeam({ upId: "prof-profile-uid" })
      ).resolves.toEqual([]);
      expect(mockProfileRepository.findByUid).toHaveBeenCalledWith("profile-uid");
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 8 } })
      );
    });

    it("looks up a profile by legacy ID", async () => {
      mockProfileRepository.getLookupTarget.mockReturnValue(profileTarget({ id: 12 }));
      mockProfileRepository.findById.mockResolvedValue({ user: { id: 9 } });
      mockPrisma.membership.findMany.mockResolvedValue([]);

      await MembershipRepository.findAllByUpIdIncludeTeam({ upId: "12" });
      expect(mockProfileRepository.findById).toHaveBeenCalledWith(12);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 9 } })
      );
    });

    it.each([
      ["without a profile identifier", profileTarget({})],
      ["when the profile is missing", profileTarget({ uid: "missing" })],
      ["when the profile has no user", profileTarget({ uid: "orphan" })],
    ])("returns an empty list %s", async (_description, target) => {
      mockProfileRepository.getLookupTarget.mockReturnValue(target);
      if ("uid" in target) {
        if (target.uid === "missing") {
          mockProfileRepository.findByUid.mockResolvedValue(null);
        } else {
          mockProfileRepository.findByUid.mockResolvedValue({});
        }
      }

      await expect(MembershipRepository.findAllByUpIdIncludeTeam({ upId: "profile" })).resolves.toEqual([]);
      expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
    });
  });

  describe("findAllByUpIdIncludeTeamWithMembersAndEventTypes", () => {
    it("returns early when profile lookup cannot resolve a user", async () => {
      mockProfileRepository.getLookupTarget.mockReturnValue(profileTarget({}));
      await expect(
        MembershipRepository.findAllByUpIdIncludeTeamWithMembersAndEventTypes({ upId: "profile" })
      ).resolves.toEqual([]);
      expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
    });

    it("includes members, parent, and ordered event types", async () => {
      mockProfileRepository.getLookupTarget.mockReturnValue(userTarget(7));
      const result = [{ id: 1 }];
      mockPrisma.membership.findMany.mockResolvedValue(result);

      await expect(
        MembershipRepository.findAllByUpIdIncludeTeamWithMembersAndEventTypes({ upId: "usr-7" })
      ).resolves.toBe(result);
      const query = mockPrisma.membership.findMany.mock.calls[0][0];
      expect(query).toEqual(
        expect.objectContaining({
          where: { userId: 7 },
          include: expect.objectContaining({
            team: expect.objectContaining({
              include: expect.objectContaining({
                members: expect.objectContaining({ select: expect.objectContaining({ id: true }) }),
                eventTypes: expect.objectContaining({
                  select: expect.objectContaining({ id: true, hashedLink: true }),
                  orderBy: [{ position: "desc" }, { id: "asc" }],
                }),
              }),
            }),
          }),
        })
      );
    });
  });

  describe("findAllByUpIdIncludeMinimalEventTypes", () => {
    it("returns early for an unresolved profile", async () => {
      mockProfileRepository.getLookupTarget.mockReturnValue(profileTarget({ id: 2 }));
      mockProfileRepository.findById.mockResolvedValue(null);
      await expect(
        MembershipRepository.findAllByUpIdIncludeMinimalEventTypes({ upId: "profile" })
      ).resolves.toEqual([]);
    });

    it("includes minimal ordered event types by default", async () => {
      mockProfileRepository.getLookupTarget.mockReturnValue(userTarget(7));
      mockPrisma.membership.findMany.mockResolvedValue([]);
      await MembershipRepository.findAllByUpIdIncludeMinimalEventTypes({ upId: "usr-7" });

      const query = mockPrisma.membership.findMany.mock.calls[0][0];
      expect(query).toEqual(
        expect.objectContaining({
          where: { userId: 7 },
          select: expect.objectContaining({
            team: expect.objectContaining({
              select: expect.objectContaining({
                eventTypes: expect.objectContaining({
                  select: expect.objectContaining({ id: true, hashedLink: true }),
                  orderBy: [{ position: "desc" }, { id: "asc" }],
                }),
              }),
            }),
          }),
        })
      );
    });

    it("omits event types when requested", async () => {
      mockProfileRepository.getLookupTarget.mockReturnValue(userTarget(7));
      mockPrisma.membership.findMany.mockResolvedValue([]);
      await MembershipRepository.findAllByUpIdIncludeMinimalEventTypes(
        { upId: "usr-7" },
        { skipEventTypes: true }
      );

      const query = mockPrisma.membership.findMany.mock.calls[0][0];
      const teamSelect = query.select.team.select;
      expect(teamSelect).not.toHaveProperty("eventTypes");
    });
  });

  describe("findUniqueByUserIdAndTeamId", () => {
    it("finds a membership by its compound key", async () => {
      const result = { id: 1 };
      mockPrisma.membership.findUnique.mockResolvedValue(result);
      await expect(repository.findUniqueByUserIdAndTeamId({ userId: 2, teamId: 3 })).resolves.toBe(result);
      expect(mockPrisma.membership.findUnique).toHaveBeenCalledWith({
        where: { userId_teamId: { userId: 2, teamId: 3 } },
      });
    });
  });

  describe("findRoleByUserIdAndTeamId", () => {
    it("selects only the membership role", async () => {
      const result = { role: MembershipRole.ADMIN };
      mockPrisma.membership.findUnique.mockResolvedValue(result);
      await expect(repository.findRoleByUserIdAndTeamId({ userId: 2, teamId: 3 })).resolves.toBe(result);
      expect(mockPrisma.membership.findUnique).toHaveBeenCalledWith({
        where: { userId_teamId: { userId: 2, teamId: 3 } },
        select: { role: true },
      });
    });
  });

  describe("findMembershipsWithUserByTeamId", () => {
    it("returns memberships and the selected user fields", async () => {
      const result = [{ role: MembershipRole.MEMBER }];
      mockPrisma.membership.findMany.mockResolvedValue(result);
      await expect(repository.findMembershipsWithUserByTeamId({ teamId: 3 })).resolves.toBe(result);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId: 3 },
          select: expect.objectContaining({
            role: true,
            accepted: true,
            user: expect.objectContaining({
              select: expect.objectContaining({
                id: true,
                email: true,
                eventTypes: { select: { slug: true } },
              }),
            }),
          }),
        })
      );
    });
  });

  describe("findAllMembershipsByUserIdForBilling", () => {
    it("returns billing-related membership data", async () => {
      const result = [{ accepted: true }];
      mockPrisma.membership.findMany.mockResolvedValue(result);
      await expect(repository.findAllMembershipsByUserIdForBilling({ userId: 3 })).resolves.toBe(result);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 3 },
          select: expect.objectContaining({
            accepted: true,
            user: { select: { isPlatformManaged: true } },
            team: expect.objectContaining({
              select: expect.objectContaining({
                slug: true,
                platformBilling: { select: { plan: true } },
              }),
            }),
          }),
        })
      );
    });
  });

  describe("findByTeamIdForAvailability", () => {
    it("adds selected calendars to every membership user", async () => {
      const memberships = [{ user: { id: 1 } }, { user: { id: 2 } }];
      mockPrisma.membership.findMany.mockResolvedValue(memberships);
      await expect(MembershipRepository.findByTeamIdForAvailability({ teamId: 4 })).resolves.toEqual([
        { user: { id: 1, selectedCalendars: [] } },
        { user: { id: 2, selectedCalendars: [] } },
      ]);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { teamId: 4 },
        include: {
          user: {
            select: {
              credentials: { select: { id: true } },
              id: true,
              timeZone: true,
            },
          },
        },
      });
    });

    it("returns an empty list for an empty team", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      await expect(MembershipRepository.findByTeamIdForAvailability({ teamId: 4 })).resolves.toEqual([]);
    });
  });

  describe("getAdminOrOwnerMembership", () => {
    it("looks for accepted admins and owners", async () => {
      const result = { id: 1 };
      mockPrisma.membership.findFirst.mockResolvedValue(result);
      await expect(MembershipRepository.getAdminOrOwnerMembership(2, 3)).resolves.toBe(result);
      expect(mockPrisma.membership.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 2,
          teamId: 3,
          accepted: true,
          role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
        },
        select: { id: true },
      });
    });
  });

  describe("findAllAcceptedPublishedTeamMemberships", () => {
    it("uses prisma by default", async () => {
      const result = [{ teamId: 3 }];
      mockPrisma.membership.findMany.mockResolvedValue(result);
      await expect(MembershipRepository.findAllAcceptedPublishedTeamMemberships(2)).resolves.toBe(result);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { userId: 2, accepted: true, team: { slug: { not: null } } },
        select: { teamId: true },
      });
    });

    it("uses a provided transaction", async () => {
      const tx = { membership: { findMany: vi.fn().mockResolvedValue([{ teamId: 4 }]) } };
      await expect(
        MembershipRepository.findAllAcceptedPublishedTeamMemberships(2, tx as unknown as never)
      ).resolves.toEqual([{ teamId: 4 }]);
      expect(tx.membership.findMany).toHaveBeenCalled();
      expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
    });
  });

  describe("findUserTeamIds", () => {
    it("maps memberships to team IDs", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([{ teamId: 3 }, { teamId: 4 }]);
      await expect(MembershipRepository.findUserTeamIds({ userId: 2 })).resolves.toEqual([3, 4]);
    });

    it("returns an empty list when there are no memberships", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      await expect(MembershipRepository.findUserTeamIds({ userId: 2 })).resolves.toEqual([]);
    });
  });

  describe("findMembershipsCreatedAfterTimeIncludeUser", () => {
    it("filters accepted memberships created after the given time", async () => {
      const time = new Date("2024-01-01T00:00:00Z");
      const result = [{ id: 1 }];
      mockPrisma.membership.findMany.mockResolvedValue(result);
      await expect(
        MembershipRepository.findMembershipsCreatedAfterTimeIncludeUser({ organizationId: 3, time })
      ).resolves.toBe(result);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { teamId: 3, createdAt: { gt: time }, accepted: true },
        include: { user: { select: { email: true, name: true, id: true } } },
      });
    });
  });

  describe("findAllByTeamIds", () => {
    it("uses the default userId select", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([{ userId: 2 }]);
      await expect(MembershipRepository.findAllByTeamIds({ teamIds: [3] })).resolves.toEqual([{ userId: 2 }]);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { teamId: { in: [3] }, accepted: true },
        select: { userId: true },
      });
    });

    it("passes through a custom select", async () => {
      const select = { teamId: true, role: true } as const;
      mockPrisma.membership.findMany.mockResolvedValue([{ teamId: 3, role: MembershipRole.ADMIN }]);
      await MembershipRepository.findAllByTeamIds({ teamIds: [3], select });
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { teamId: { in: [3] }, accepted: true },
        select,
      });
    });
  });

  describe("findAllAcceptedTeamMemberships", () => {
    it("finds accepted teams without extra filters", async () => {
      const result = [{ id: 3 }];
      mockPrisma.team.findMany.mockResolvedValue(result);
      await expect(MembershipRepository.findAllAcceptedTeamMemberships(2)).resolves.toBe(result);
      expect(mockPrisma.team.findMany).toHaveBeenCalledWith({
        where: { members: { some: { userId: 2, accepted: true } } },
      });
    });

    it("merges extra membership filters", async () => {
      mockPrisma.team.findMany.mockResolvedValue([]);
      await MembershipRepository.findAllAcceptedTeamMemberships(2, { role: MembershipRole.ADMIN });
      expect(mockPrisma.team.findMany).toHaveBeenCalledWith({
        where: { members: { some: { userId: 2, accepted: true, role: MembershipRole.ADMIN } } },
      });
    });
  });

  describe("findAllByUserId", () => {
    it("uses only userId when filters are absent", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      await repository.findAllByUserId({ userId: 2 });
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 2 } })
      );
    });

    it("adds accepted and role filters", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      await repository.findAllByUserId({
        userId: 2,
        filters: { accepted: false, roles: [MembershipRole.ADMIN, MembershipRole.OWNER] },
      });
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 2,
            accepted: false,
            role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
          },
        })
      );
    });
  });

  describe("findTeamAdminsByTeamId", () => {
    it("finds admins and owners of child teams", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      await expect(repository.findTeamAdminsByTeamId({ teamId: 3 })).resolves.toEqual([]);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { team: { id: 3, parentId: { not: null } }, role: { in: ["ADMIN", "OWNER"] } },
        select: { user: { select: { email: true, locale: true } } },
      });
    });
  });

  describe("hasAcceptedMembershipByEmail", () => {
    it("lowercases email and returns false when user is missing", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        repository.hasAcceptedMembershipByEmail({ email: "USER@EXAMPLE.COM", teamId: 3 })
      ).resolves.toBe(false);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "user@example.com" },
        select: { id: true },
      });
      expect(mockPrisma.membership.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      [null, false],
      [{ accepted: false }, false],
      [{ accepted: true }, true],
    ])("returns %s as %s", async (membership, expected) => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 8 });
      mockPrisma.membership.findUnique.mockResolvedValue(membership);
      await expect(
        repository.hasAcceptedMembershipByEmail({ email: "user@example.com", teamId: 3 })
      ).resolves.toBe(expected);
      expect(mockPrisma.membership.findUnique).toHaveBeenCalledWith({
        where: { userId_teamId: { userId: 8, teamId: 3 } },
        select: { accepted: true },
      });
    });
  });

  describe("hasPendingInviteByUserId", () => {
    it.each([
      [{ id: 1 }, true],
      [null, false],
    ])("returns %s as %s", async (membership, expected) => {
      mockPrisma.membership.findFirst.mockResolvedValue(membership);
      await expect(MembershipRepository.hasPendingInviteByUserId({ userId: 2 })).resolves.toBe(expected);
      expect(mockPrisma.membership.findFirst).toHaveBeenCalledWith({
        where: { userId: 2, accepted: false },
        select: { id: true },
      });
    });
  });

  describe("searchMembers", () => {
    const searchArgs = { teamId: 3, limit: 2 };

    it("does not add a user filter without search, cursor, or IDs", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      await repository.searchMembers(searchArgs);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId: 3, accepted: true },
          take: 3,
        })
      );
      expect(mockPrisma.membership.findMany.mock.calls[0][0].where).not.toHaveProperty("user");
    });

    it("adds an insensitive name and email search filter", async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      await repository.searchMembers({ ...searchArgs, search: "Ada" });
      expect(mockPrisma.membership.findMany.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          where: {
            teamId: 3,
            accepted: true,
            user: {
              OR: [
                { name: { contains: "Ada", mode: "insensitive" } },
                { email: { contains: "Ada", mode: "insensitive" } },
              ],
            },
          },
        })
      );
    });

    it.each([
      [
        { memberUserIds: [4, 5], cursor: 3 },
        { in: [4, 5], gt: 3 },
      ],
      [{ memberUserIds: [4, 5] }, { in: [4, 5] }],
      [{ cursor: 3 }, { gt: 3 }],
    ])("builds the expected ID filter for %s", async (options, idFilter) => {
      mockPrisma.membership.findMany.mockResolvedValue([]);
      await repository.searchMembers({ ...searchArgs, ...options });
      expect(mockPrisma.membership.findMany.mock.calls[0][0].where).toEqual({
        teamId: 3,
        accepted: true,
        user: { id: idFilter },
      });
    });

    it("returns hasMore and the next cursor when an extra row exists", async () => {
      const rows = [{ user: { id: 4 } }, { user: { id: 5 } }, { user: { id: 6 } }];
      mockPrisma.membership.findMany.mockResolvedValue(rows);
      await expect(repository.searchMembers(searchArgs)).resolves.toEqual({
        memberships: rows.slice(0, 2),
        hasMore: true,
        nextCursor: 5,
      });
    });

    it("returns all rows without a cursor when exactly at the limit", async () => {
      const rows = [{ user: { id: 4 } }, { user: { id: 5 } }];
      mockPrisma.membership.findMany.mockResolvedValue(rows);
      await expect(repository.searchMembers(searchArgs)).resolves.toEqual({
        memberships: rows,
        hasMore: false,
        nextCursor: undefined,
      });
    });
  });

  describe("findAcceptedMembersWithUserProfile", () => {
    it("returns accepted members ordered by user ID", async () => {
      const result = [{ user: { id: 2 } }];
      mockPrisma.membership.findMany.mockResolvedValue(result);
      await expect(repository.findAcceptedMembersWithUserProfile({ teamId: 3 })).resolves.toBe(result);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { teamId: 3, accepted: true },
        orderBy: { user: { id: "asc" } },
        select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      });
    });
  });

  describe("hasAnyTeamMembershipByUserId", () => {
    it.each([
      [{ id: 1 }, true],
      [null, false],
    ])("returns %s as %s", async (membership, expected) => {
      mockPrisma.membership.findFirst.mockResolvedValue(membership);
      await expect(MembershipRepository.hasAnyTeamMembershipByUserId({ userId: 2 })).resolves.toBe(expected);
      expect(mockPrisma.membership.findFirst).toHaveBeenCalledWith({
        where: { userId: 2, team: { isOrganization: false } },
        select: { id: true },
      });
    });
  });

  it("uses the mocked prisma in the default constructor", async () => {
    const defaultRepository = new MembershipRepository();
    mockPrisma.membership.findFirst.mockResolvedValue(null);
    await expect(defaultRepository.hasMembership({ userId: 1, teamId: 2 })).resolves.toBe(false);
  });
});
