import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import type { User } from "@calcom/prisma/client";
import { BookingStatus, CreationSource, MembershipRole } from "@calcom/prisma/enums";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRepository } from "./UserRepository";

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: {
    buildPersonalProfileFromUser: vi.fn(),
    findManyByOrgSlugOrRequestedSlug: vi.fn(),
    findAllProfilesForUserIncludingMovedUser: vi.fn(),
    findManyForOrg: vi.fn(),
    findManyForUser: vi.fn(),
    findManyForUsers: vi.fn(),
    findByUpIdWithAuth: vi.fn(),
    generateProfileUid: vi.fn(),
  },
}));

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: async () => (key: string) => key,
}));

// The repository is only interested in a few fields of the profiles it gets back, so the mocks are
// typed loosely to keep the fixtures below readable.
type SyncMock = MockInstance<(...args: never[]) => unknown>;
type AsyncMock = MockInstance<(...args: never[]) => Promise<unknown>>;

const profileRepositoryMock = {
  buildPersonalProfileFromUser: ProfileRepository.buildPersonalProfileFromUser as unknown as SyncMock,
  generateProfileUid: ProfileRepository.generateProfileUid as unknown as SyncMock,
  findManyByOrgSlugOrRequestedSlug:
    ProfileRepository.findManyByOrgSlugOrRequestedSlug as unknown as AsyncMock,
  findAllProfilesForUserIncludingMovedUser:
    ProfileRepository.findAllProfilesForUserIncludingMovedUser as unknown as AsyncMock,
  findManyForOrg: ProfileRepository.findManyForOrg as unknown as AsyncMock,
  findManyForUser: ProfileRepository.findManyForUser as unknown as AsyncMock,
  findManyForUsers: ProfileRepository.findManyForUsers as unknown as AsyncMock,
  findByUpIdWithAuth: ProfileRepository.findByUpIdWithAuth as unknown as AsyncMock,
};

const buildOrganization = (overrides: Partial<{ id: number; isPlatform: boolean }> = {}) => ({
  id: 10,
  name: "Acme",
  slug: "acme",
  metadata: { requestedSlug: "acme" },
  isPlatform: false,
  organizationSettings: { lockEventTypeCreationForUsers: false },
  ...overrides,
});

const buildProfile = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  uid: "usr-1",
  userId: 1,
  username: "org-username",
  organizationId: 10,
  organization: buildOrganization(),
  ...overrides,
});

const personalProfile = { id: null, username: "personal-username", organizationId: null, organization: null };

describe("UserRepository", () => {
  let repository: UserRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new UserRepository(prismaMock);
    profileRepositoryMock.buildPersonalProfileFromUser.mockReturnValue(personalProfile);
  });

  describe("findTeamsByUserId", () => {
    it("splits memberships into accepted and pending and exposes accepted teams", async () => {
      const acceptedMembership = { id: 1, accepted: true, team: { id: 100, isOrganization: false } };
      const pendingMembership = { id: 2, accepted: false, team: { id: 200, isOrganization: false } };
      prismaMock.membership.findMany.mockResolvedValue([acceptedMembership, pendingMembership]);

      const result = await repository.findTeamsByUserId({ userId: 1 });

      expect(prismaMock.membership.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        include: { team: { select: expect.objectContaining({ id: true, isOrganization: true }) } },
      });
      expect(result.teams).toEqual([acceptedMembership.team]);
      expect(result.acceptedTeamMemberships).toEqual([acceptedMembership]);
      expect(result.pendingTeamMemberships).toEqual([pendingMembership]);
      expect(result.memberships).toHaveLength(2);
    });
  });

  describe("findOrganizations", () => {
    it("returns only accepted memberships whose team is an organization", async () => {
      const orgTeam = { id: 100, isOrganization: true };
      prismaMock.membership.findMany.mockResolvedValue([
        { id: 1, accepted: true, team: orgTeam },
        { id: 2, accepted: true, team: { id: 101, isOrganization: false } },
        { id: 3, accepted: false, team: { id: 102, isOrganization: true } },
      ]);

      const { organizations } = await repository.findOrganizations({ userId: 1 });

      expect(organizations).toEqual([orgTeam]);
    });
  });

  describe("_getWhereClauseForFindingUsersByUsername", () => {
    it("matches usernames on personal (non-org) users when no orgSlug is given", async () => {
      const { where, profiles } = await repository._getWhereClauseForFindingUsersByUsername({
        orgSlug: null,
        usernameList: ["alice", "bob"],
      });

      expect(profiles).toBeNull();
      expect(where).toEqual({ username: { in: ["alice", "bob"] }, organization: null });
      expect(profileRepositoryMock.findManyByOrgSlugOrRequestedSlug).not.toHaveBeenCalled();
    });

    it("resolves user ids from org profiles when profiles exist for the orgSlug", async () => {
      profileRepositoryMock.findManyByOrgSlugOrRequestedSlug.mockResolvedValue([
        { ...buildProfile(), user: { id: 5 } },
        { ...buildProfile({ id: 2, userId: 6 }), user: { id: 6 } },
      ]);

      const { where, profiles } = await repository._getWhereClauseForFindingUsersByUsername({
        orgSlug: "acme",
        usernameList: ["alice"],
      });

      expect(profileRepositoryMock.findManyByOrgSlugOrRequestedSlug).toHaveBeenCalledWith({
        orgSlug: "acme",
        usernames: ["alice"],
      });
      expect(where).toEqual({ id: { in: [5, 6] } });
      expect(profiles?.[0].organization).toEqual(expect.objectContaining({ id: 10, requestedSlug: "acme" }));
    });

    it("falls back to an org-scoped username lookup when the org has no matching profiles", async () => {
      profileRepositoryMock.findManyByOrgSlugOrRequestedSlug.mockResolvedValue([]);

      const { where } = await repository._getWhereClauseForFindingUsersByUsername({
        orgSlug: "acme",
        usernameList: ["alice"],
      });

      expect(where).toEqual({
        username: { in: ["alice"] },
        organization: {
          OR: [{ slug: "acme" }, { metadata: { path: ["requestedSlug"], equals: "acme" } }],
          isOrganization: true,
        },
      });
    });
  });

  describe("findUsersByUsername", () => {
    it("attaches a personal profile to every user when the lookup was not org scoped", async () => {
      prismaMock.user.findMany.mockResolvedValue([{ id: 1, username: "alice" } as User]);

      const users = await repository.findUsersByUsername({ orgSlug: null, usernameList: ["alice"] });

      expect(users).toEqual([{ id: 1, username: "alice", profile: personalProfile }]);
    });

    it("attaches the matching org profile without its user back-reference", async () => {
      profileRepositoryMock.findManyByOrgSlugOrRequestedSlug.mockResolvedValue([
        { ...buildProfile(), user: { id: 1 } },
      ]);
      prismaMock.user.findMany.mockResolvedValue([{ id: 1, username: "alice" } as User]);

      const users = await repository.findUsersByUsername({ orgSlug: "acme", usernameList: ["alice"] });

      expect(users[0].profile).toEqual(
        expect.objectContaining({ username: "org-username", organizationId: 10 })
      );
      expect(users[0].profile).not.toHaveProperty("user");
    });

    it("throws when a returned user has no corresponding profile", async () => {
      profileRepositoryMock.findManyByOrgSlugOrRequestedSlug.mockResolvedValue([
        { ...buildProfile({ userId: 2 }), user: { id: 2 } },
      ]);
      prismaMock.user.findMany.mockResolvedValue([{ id: 1, username: "alice" } as User]);

      await expect(
        repository.findUsersByUsername({ orgSlug: "acme", usernameList: ["alice"] })
      ).rejects.toThrow("Profile couldn't be found");
    });
  });

  describe("findPlatformMembersByUsernames", () => {
    it("queries non platform-managed users belonging to a platform org", async () => {
      prismaMock.user.findMany.mockResolvedValue([{ id: 1, username: "alice" } as User]);

      const users = await repository.findPlatformMembersByUsernames({ usernameList: ["alice"] });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        select: expect.any(Object),
        where: {
          username: { in: ["alice"] },
          isPlatformManaged: false,
          profiles: { some: { organization: { isPlatform: true } } },
        },
      });
      expect(users[0].profile).toEqual(personalProfile);
    });
  });

  describe("findByEmail", () => {
    it("lowercases the email before querying", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1 } as User);

      const user = await repository.findByEmail({ email: "Alice@Example.COM" });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: "alice@example.com" },
        select: expect.any(Object),
      });
      expect(user).toEqual({ id: 1 });
    });
  });

  describe("findManyByEmailsWithEmailVerificationSettings", () => {
    it("returns early without querying when the email list is empty", async () => {
      const result = await repository.findManyByEmailsWithEmailVerificationSettings({ emails: [] });

      expect(result).toEqual([]);
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it("returns an empty list when no verified users match", async () => {
      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await repository.findManyByEmailsWithEmailVerificationSettings({
        emails: ["alice@example.com"],
      });

      expect(result).toEqual([]);
    });

    it("maps raw rows onto email verification settings", async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        {
          id: 1,
          email: "alice@example.com",
          matchedEmail: "secondary@example.com",
          requiresBookerEmailVerification: true,
        },
      ]);

      const result = await repository.findManyByEmailsWithEmailVerificationSettings({
        emails: ["Secondary@Example.com"],
      });

      expect(result).toEqual([
        {
          email: "alice@example.com",
          matchedEmail: "secondary@example.com",
          requiresBookerEmailVerification: true,
        },
      ]);
    });
  });

  describe("findByEmailAndIncludeProfilesAndPassword", () => {
    it("returns null when the user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmailAndIncludeProfilesAndPassword({
        email: "missing@example.com",
      });

      expect(result).toBeNull();
      expect(profileRepositoryMock.findAllProfilesForUserIncludingMovedUser).not.toHaveBeenCalled();
    });

    it("includes all profiles of the user, including moved ones", async () => {
      const user = { id: 1, email: "alice@example.com" } as User;
      prismaMock.user.findUnique.mockResolvedValue(user);
      profileRepositoryMock.findAllProfilesForUserIncludingMovedUser.mockResolvedValue([buildProfile()]);

      const result = await repository.findByEmailAndIncludeProfilesAndPassword({
        email: "ALICE@example.com",
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: "alice@example.com" } })
      );
      expect(result?.allProfiles).toHaveLength(1);
    });
  });

  describe("findById", () => {
    it("returns null when no user matches", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      expect(await repository.findById({ id: 1 })).toBeNull();
    });

    it("parses the user metadata", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 1,
        metadata: { stripeCustomerId: "cus_1" },
      } as unknown as User);

      const user = await repository.findById({ id: 1 });

      expect(user?.metadata).toEqual({ stripeCustomerId: "cus_1" });
    });
  });

  describe("findByIdOrThrow", () => {
    it("throws a descriptive error when the user is missing", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(repository.findByIdOrThrow({ id: 42 })).rejects.toThrow("User with id 42 not found");
    });

    it("returns the user when it exists", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 42, metadata: null } as User);

      expect(await repository.findByIdOrThrow({ id: 42 })).toEqual({ id: 42, metadata: null });
    });
  });

  describe("simple finders", () => {
    it("findSecondaryEmailByUserIdAndEmail queries the composite unique key", async () => {
      prismaMock.secondaryEmail.findUnique.mockResolvedValue({ id: 3, emailVerified: null });

      const result = await repository.findSecondaryEmailByUserIdAndEmail({
        userId: 1,
        email: "second@example.com",
      });

      expect(prismaMock.secondaryEmail.findUnique).toHaveBeenCalledWith({
        where: { userId_email: { userId: 1, email: "second@example.com" } },
        select: { id: true, emailVerified: true },
      });
      expect(result).toEqual({ id: 3, emailVerified: null });
    });

    it("findByUuid selects only public profile fields", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ name: "Alice" } as User);

      await repository.findByUuid({ uuid: "uuid-1" });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { uuid: "uuid-1" },
        select: { name: true, email: true, avatarUrl: true },
      });
    });

    it("findByIds queries by id list", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      await repository.findByIds({ ids: [1, 2] });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
        select: expect.any(Object),
      });
    });

    it("findByUuids short-circuits on an empty list", async () => {
      expect(await repository.findByUuids({ uuids: [] })).toEqual([]);
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it("findByUuids queries by uuid list", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      await repository.findByUuids({ uuids: ["a", "b"] });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: { uuid: { in: ["a", "b"] } },
        select: { id: true, uuid: true, name: true, email: true, avatarUrl: true },
      });
    });

    it("findUsersByIds selects identity fields only", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      await repository.findUsersByIds([1, 2]);

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
        select: { id: true, name: true, email: true },
      });
    });

    it("findByIdWithUsername selects the username only", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ username: "alice" } as User);

      expect(await repository.findByIdWithUsername(1)).toEqual({ username: "alice" });
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { username: true },
      });
    });

    it("findForPasswordReset selects only what the reset email needs", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ email: "alice@example.com" } as User);

      await repository.findForPasswordReset({ id: 1 });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { email: true, name: true, locale: true },
      });
    });

    it("findByEmailAndTeamId lowercases the email and requires an accepted membership", async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await repository.findByEmailAndTeamId({ email: "Alice@Example.com", teamId: 7 });

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: {
          email: "alice@example.com",
          teams: { some: { teamId: 7, accepted: true } },
        },
        select: expect.any(Object),
      });
    });

    it("adminFindById uses findUniqueOrThrow", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue({ id: 1 } as User);

      expect(await repository.adminFindById(1)).toEqual({ id: 1 });
    });
  });

  describe("findByIdsWithPagination", () => {
    const users = [
      { id: 1, name: "A", email: "a@example.com" },
      { id: 2, name: "B", email: "b@example.com" },
      { id: 3, name: "C", email: "c@example.com" },
    ];

    it("returns every user without a cursor when no limit is given", async () => {
      prismaMock.user.findMany.mockResolvedValue(users);

      const result = await repository.findByIdsWithPagination({ ids: [1, 2, 3] });

      expect(result).toEqual({ users, nextCursor: undefined, total: 3 });
      expect(prismaMock.user.count).not.toHaveBeenCalled();
    });

    it("truncates to the limit and returns the next cursor plus a total on the first page", async () => {
      prismaMock.user.findMany.mockResolvedValue(users);
      prismaMock.user.count.mockResolvedValue(3);

      const result = await repository.findByIdsWithPagination({ ids: [1, 2, 3], limit: 2 });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
      expect(result.users).toEqual(users.slice(0, 2));
      expect(result.nextCursor).toBe(2);
      expect(result.total).toBe(3);
    });

    it("skips the count query and filters past the cursor on subsequent pages", async () => {
      prismaMock.user.findMany.mockResolvedValue([users[2]]);

      const result = await repository.findByIdsWithPagination({ ids: [1, 2, 3], limit: 2, cursor: 2 });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [1, 2, 3], gt: 2 } } })
      );
      expect(result.nextCursor).toBeUndefined();
      expect(result.total).toBeUndefined();
      expect(prismaMock.user.count).not.toHaveBeenCalled();
    });

    it("applies a case-insensitive search to both the page and the count query", async () => {
      prismaMock.user.findMany.mockResolvedValue([users[0]]);
      prismaMock.user.count.mockResolvedValue(1);

      await repository.findByIdsWithPagination({ ids: [1, 2, 3], search: "ali", limit: 5 });

      const searchClause = [
        { name: { contains: "ali", mode: "insensitive" } },
        { email: { contains: "ali", mode: "insensitive" } },
      ];
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [1, 2, 3] }, OR: searchClause } })
      );
      expect(prismaMock.user.count).toHaveBeenCalledWith({
        where: { id: { in: [1, 2, 3] }, OR: searchClause },
      });
    });
  });

  describe("findManyByOrganization", () => {
    it("returns the users behind the organization profiles", async () => {
      profileRepositoryMock.findManyForOrg.mockResolvedValue([{ user: { id: 1 } }, { user: { id: 2 } }]);

      expect(await repository.findManyByOrganization({ organizationId: 10 })).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  describe("membership predicates", () => {
    it("isAMemberOfOrganization checks the user profiles", () => {
      const user = { profiles: [{ organizationId: 10 }] };

      expect(repository.isAMemberOfOrganization({ user, organizationId: 10 })).toBe(true);
      expect(repository.isAMemberOfOrganization({ user, organizationId: 11 })).toBe(false);
    });

    it("findIfAMemberOfSomeOrganization is true only when a profile exists", async () => {
      profileRepositoryMock.findManyForUser.mockResolvedValue([]);
      expect(await repository.findIfAMemberOfSomeOrganization({ user: { id: 1 } })).toBe(false);

      profileRepositoryMock.findManyForUser.mockResolvedValue([buildProfile()]);
      expect(await repository.findIfAMemberOfSomeOrganization({ user: { id: 1 } })).toBe(true);
    });

    it("isMigratedToOrganization reads migratedToOrgFrom out of the metadata", () => {
      expect(repository.isMigratedToOrganization({ user: { metadata: { migratedToOrgFrom: "acme" } } })).toBe(
        true
      );
      expect(repository.isMigratedToOrganization({ user: { metadata: {} } })).toBe(false);
      expect(repository.isMigratedToOrganization({ user: { metadata: null } })).toBe(false);
    });

    it("isMovedToAProfile reflects movedToProfileId", async () => {
      expect(await repository.isMovedToAProfile({ user: { movedToProfileId: 3 } })).toBe(true);
      expect(await repository.isMovedToAProfile({ user: { movedToProfileId: null } })).toBe(false);
    });
  });

  describe("swapPrimaryEmailWithSecondaryEmail", () => {
    it("swaps both records in a single transaction and returns the updated user", async () => {
      const updatedUser = { id: 1, email: "new@example.com" } as User;
      prismaMock.$transaction.mockResolvedValue([{ id: 2 }, updatedUser]);

      const result = await repository.swapPrimaryEmailWithSecondaryEmail({
        userId: 1,
        secondaryEmailId: 2,
        oldPrimaryEmail: "old@example.com",
        oldPrimaryEmailVerified: null,
        newPrimaryEmail: "new@example.com",
        userUpdateData: { name: "Alice" },
      });

      expect(prismaMock.secondaryEmail.update).toHaveBeenCalledWith({
        where: { id: 2, userId: 1 },
        data: { email: "old@example.com", emailVerified: null },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: "Alice", email: "new@example.com" },
      });
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result).toBe(updatedUser);
    });
  });

  describe("enrichUserWithTheProfile", () => {
    it("falls back to the personal profile when the upId has no profile", async () => {
      profileRepositoryMock.findByUpIdWithAuth.mockResolvedValue(null);

      const result = await repository.enrichUserWithTheProfile({
        user: { id: 1, username: "alice" },
        upId: "usr-1",
      });

      expect(result.profile).toEqual(personalProfile);
    });

    it("uses the profile found for the upId", async () => {
      const profile = buildProfile();
      profileRepositoryMock.findByUpIdWithAuth.mockResolvedValue(profile);

      const result = await repository.enrichUserWithTheProfile({
        user: { id: 1, username: "alice" },
        upId: "usr-1",
      });

      expect(profileRepositoryMock.findByUpIdWithAuth).toHaveBeenCalledWith("usr-1", 1);
      expect(result.profile).toBe(profile);
    });
  });

  describe("enrichUserWithItsProfile", () => {
    it("keeps the personal username for users of a platform organization", async () => {
      profileRepositoryMock.findManyForUser.mockResolvedValue([
        buildProfile({ organization: buildOrganization({ isPlatform: true }) }),
      ]);

      const result = await repository.enrichUserWithItsProfile({ user: { id: 1, username: "alice" } });

      expect(result.username).toBe("alice");
      expect(result.nonProfileUsername).toBe("alice");
      expect(result.profile).toEqual(personalProfile);
    });

    it("overrides the username with the org profile username", async () => {
      profileRepositoryMock.findManyForUser.mockResolvedValue([buildProfile()]);

      const result = await repository.enrichUserWithItsProfile({ user: { id: 1, username: "alice" } });

      expect(result.username).toBe("org-username");
      expect(result.nonProfileUsername).toBe("alice");
    });

    it("builds a personal profile when the user has no profiles", async () => {
      profileRepositoryMock.findManyForUser.mockResolvedValue([]);

      const result = await repository.enrichUserWithItsProfile({ user: { id: 1, username: "alice" } });

      expect(result.profile).toEqual(personalProfile);
      expect(result.nonProfileUsername).toBe("alice");
    });
  });

  describe("enrichUserWithItsProfileExcludingOrgMetadata", () => {
    it("returns the enriched user untouched when there is no organization", async () => {
      profileRepositoryMock.findManyForUser.mockResolvedValue([]);

      const result = await repository.enrichUserWithItsProfileExcludingOrgMetadata({
        user: { id: 1, username: "alice" },
      });

      expect(result.profile).toEqual(personalProfile);
    });

    it("strips the organization metadata while keeping the organization settings", async () => {
      profileRepositoryMock.findManyForUser.mockResolvedValue([buildProfile()]);

      const result = await repository.enrichUserWithItsProfileExcludingOrgMetadata({
        user: { id: 1, username: "alice" },
      });

      expect(result.profile.organization?.metadata).toEqual({});
      expect(result.profile.organization?.organizationSettings).toEqual({
        lockEventTypeCreationForUsers: false,
      });
    });
  });

  describe("enrichUsersWithTheirProfiles", () => {
    it("short-circuits on an empty user list", async () => {
      expect(await repository.enrichUsersWithTheirProfiles([])).toEqual([]);
      expect(profileRepositoryMock.findManyForUsers).not.toHaveBeenCalled();
    });

    it("maps each user to its first profile and falls back to personal profiles", async () => {
      profileRepositoryMock.findManyForUsers.mockResolvedValue([
        buildProfile({ userId: 1 }),
        buildProfile({ userId: 2, organization: buildOrganization({ isPlatform: true }) }),
      ]);

      const result = await repository.enrichUsersWithTheirProfiles([
        { id: 1, username: "alice" },
        { id: 2, username: "bob" },
        { id: 3, username: "carol" },
      ]);

      expect(profileRepositoryMock.findManyForUsers).toHaveBeenCalledWith([1, 2, 3]);
      expect(result[0].username).toBe("org-username");
      expect(result[1].username).toBe("bob");
      expect(result[1].profile).toEqual(personalProfile);
      expect(result[2].profile).toEqual(personalProfile);
      expect(result[2].nonProfileUsername).toBe("carol");
    });
  });

  describe("enrichUsersWithTheirProfileExcludingOrgMetadata", () => {
    it("clears organization metadata for org users and leaves personal ones alone", async () => {
      profileRepositoryMock.findManyForUsers.mockResolvedValue([buildProfile({ userId: 1 })]);

      const result = await repository.enrichUsersWithTheirProfileExcludingOrgMetadata([
        { id: 1, username: "alice" },
        { id: 2, username: "bob" },
      ]);

      expect(result[0].profile.organization?.metadata).toEqual({});
      expect(result[1].profile).toEqual(personalProfile);
    });
  });

  describe("enrichUserWithItsProfileBuiltFromUser", () => {
    it("always builds the personal profile without hitting the database", () => {
      const result = repository.enrichUserWithItsProfileBuiltFromUser({
        user: { id: 1, username: "alice" },
      });

      expect(result).toEqual({
        id: 1,
        username: "alice",
        nonProfileUsername: "alice",
        profile: personalProfile,
      });
    });
  });

  describe("enrichEntityWithProfile", () => {
    it("parses the organization of an entity that already carries a profile", async () => {
      const result = await repository.enrichEntityWithProfile({
        profile: {
          id: 1,
          username: "org-username",
          organizationId: 10,
          organization: {
            id: 10,
            name: "Acme",
            bannerUrl: null,
            slug: null,
            metadata: { requestedSlug: "acme" },
          },
        },
      });

      expect(result.profile.organization).toEqual(expect.objectContaining({ id: 10, requestedSlug: "acme" }));
    });

    it("sets a null organization when the profile has none", async () => {
      const result = await repository.enrichEntityWithProfile({
        profile: { id: 1, username: "alice", organizationId: null },
      });

      expect(result.profile.organization).toBeNull();
    });

    it("looks up the profile for entities that only carry a user", async () => {
      const profile = buildProfile();
      profileRepositoryMock.findManyForUser.mockResolvedValue([profile]);

      const result = await repository.enrichEntityWithProfile({ user: { id: 1, username: "alice" } });

      expect(result.profile).toBe(profile);
    });

    it("builds a personal profile for a user without profiles", async () => {
      profileRepositoryMock.findManyForUser.mockResolvedValue([]);

      const result = await repository.enrichEntityWithProfile({ user: { id: 1, username: "alice" } });

      expect(result.profile).toEqual(personalProfile);
    });
  });

  describe("updateWhereId", () => {
    it("connects the profile when a movedToProfileId is given", async () => {
      prismaMock.user.update.mockResolvedValue({ id: 1 } as User);

      await repository.updateWhereId({ whereId: 1, data: { movedToProfileId: 5 } });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { movedToProfile: { connect: { id: 5 } } },
      });
    });

    it("leaves the relation untouched when no movedToProfileId is given", async () => {
      prismaMock.user.update.mockResolvedValue({ id: 1 } as User);

      await repository.updateWhereId({ whereId: 1, data: { movedToProfileId: null } });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { movedToProfile: undefined },
      });
    });
  });

  describe("create", () => {
    it("creates the user with a default schedule and no password", async () => {
      prismaMock.user.create.mockResolvedValue({ id: 1 } as User);

      await repository.create({
        username: "alice",
        email: "alice@example.com",
        organizationId: null,
        creationSource: CreationSource.WEBAPP,
        locked: false,
      });

      const createArgs = prismaMock.user.create.mock.calls[0][0];
      expect(createArgs.data).toEqual(
        expect.objectContaining({ username: "alice", email: "alice@example.com", locked: false })
      );
      expect(createArgs.data).not.toHaveProperty("password");
      expect(createArgs.data.schedules?.create).toEqual(
        expect.objectContaining({ name: "default_schedule_name" })
      );
    });

    it("stores the hashed password and the organization profile", async () => {
      profileRepositoryMock.generateProfileUid.mockReturnValue("uid-1");
      prismaMock.user.create.mockResolvedValue({ id: 1 } as User);

      await repository.create({
        username: "alice",
        email: "alice@example.com",
        hashedPassword: "hashed",
        organizationId: 10,
        creationSource: CreationSource.WEBAPP,
        locked: true,
      });

      const createArgs = prismaMock.user.create.mock.calls[0][0];
      expect(createArgs.data.password).toEqual({ create: { hash: "hashed" } });
      expect(createArgs.data.organizationId).toBe(10);
      expect(createArgs.data.profiles?.create).toEqual({
        username: "alice",
        organizationId: 10,
        uid: "uid-1",
      });
    });
  });

  describe("admin and team helpers", () => {
    it("getUserAdminTeams only returns accepted memberships where the user is admin or owner", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1 } as User);

      await repository.getUserAdminTeams({ userId: 1 });

      const args = prismaMock.user.findUnique.mock.calls[0][0];
      expect(args.select?.teams?.where).toEqual(
        expect.objectContaining({
          accepted: true,
          OR: expect.arrayContaining([{ role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] } }]),
        })
      );
    });

    it("isAdminOfTeamOrParentOrg is true when a team or its parent matches", async () => {
      prismaMock.team.findMany.mockResolvedValue([{ id: 1 }]);
      expect(await repository.isAdminOfTeamOrParentOrg({ userId: 1, teamId: 1 })).toBe(true);

      prismaMock.team.findMany.mockResolvedValue([]);
      expect(await repository.isAdminOfTeamOrParentOrg({ userId: 1, teamId: 1 })).toBe(false);
    });

    it("isAdminOrOwnerOfTeam requires an accepted admin or owner membership", async () => {
      prismaMock.membership.findUnique.mockResolvedValue({ id: 1 });

      expect(await repository.isAdminOrOwnerOfTeam({ userId: 1, teamId: 2 })).toBe(true);
      expect(prismaMock.membership.findUnique).toHaveBeenCalledWith({
        where: {
          userId_teamId: { userId: 1, teamId: 2 },
          role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
          accepted: true,
        },
        select: { id: true },
      });

      prismaMock.membership.findUnique.mockResolvedValue(null);
      expect(await repository.isAdminOrOwnerOfTeam({ userId: 1, teamId: 2 })).toBe(false);
    });

    it("getUserOrganizationAndTeams returns accepted team ids", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ organizationId: 10 } as User);

      await repository.getUserOrganizationAndTeams({ userId: 1 });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { organizationId: true, teams: { where: { accepted: true }, select: { teamId: true } } },
      });
    });

    it("getTimeZoneAndDefaultScheduleId selects scheduling fields", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ timeZone: "UTC" } as User);

      expect(await repository.getTimeZoneAndDefaultScheduleId({ userId: 1 })).toEqual({ timeZone: "UTC" });
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { timeZone: true, defaultScheduleId: true },
      });
    });

    it("findUserTeams returns null for a missing user", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      expect(await repository.findUserTeams({ id: 1 })).toBeNull();
    });

    it("findUserTeams returns the onboarding state along with the teams", async () => {
      const user = { completedOnboarding: true, teams: [] } as unknown as User;
      prismaMock.user.findUnique.mockResolvedValue(user);

      expect(await repository.findUserTeams({ id: 1 })).toBe(user);
    });
  });

  describe("updateAvatar", () => {
    it("only sets the avatar when the user does not have one yet", async () => {
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

      await repository.updateAvatar({ id: 1, avatarUrl: "https://cdn/avatar.png" });

      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: { id: 1, avatarUrl: { equals: null } },
        data: { avatarUrl: "https://cdn/avatar.png" },
      });
    });
  });

  describe("findUserWithCredentials", () => {
    it("returns null when the user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      expect(await repository.findUserWithCredentials({ id: 1 })).toBeNull();
    });

    it("splits selected calendars and drops in-db delegation credentials", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 1,
        timeZone: "UTC",
        selectedCalendars: [
          { eventTypeId: null, externalId: "user-level" },
          { eventTypeId: 5, externalId: "event-level" },
        ],
        credentials: [
          { id: 1, delegationCredentialId: null },
          { id: 2, delegationCredentialId: 3 },
        ],
      } as unknown as User);

      const result = await repository.findUserWithCredentials({ id: 1 });

      expect(result?.allSelectedCalendars).toHaveLength(2);
      expect(result?.userLevelSelectedCalendars).toEqual([{ eventTypeId: null, externalId: "user-level" }]);
      expect(result?.credentials).toEqual([
        expect.objectContaining({ id: 1, delegatedTo: null, delegatedToId: null }),
      ]);
    });
  });

  describe("findUnlockedUserForSession", () => {
    it("returns null when no unlocked user matches", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      expect(await repository.findUnlockedUserForSession({ userId: 1 })).toBeNull();
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1, locked: false } })
      );
    });

    it("normalizes the selected calendars of the session user", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 1,
        selectedCalendars: [
          { eventTypeId: null, id: "a" },
          { eventTypeId: 2, id: "b" },
        ],
      } as unknown as User);

      const result = await repository.findUnlockedUserForSession({ userId: 1 });

      expect(result?.userLevelSelectedCalendars).toEqual([{ eventTypeId: null, id: "a" }]);
      expect(result?.allSelectedCalendars).toHaveLength(2);
    });
  });

  describe("getUserStats", () => {
    it("returns null when the user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      expect(await repository.getUserStats({ userId: 1 })).toBeNull();
    });

    it("renames the selected calendar count to userLevelSelectedCalendars", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        _count: { bookings: 3, selectedCalendars: 2, teams: 1, eventTypes: 4 },
        teams: [],
      } as unknown as User);

      const result = await repository.getUserStats({ userId: 1 });

      expect(result?._count).toEqual({
        bookings: 3,
        teams: 1,
        eventTypes: 4,
        userLevelSelectedCalendars: 2,
      });
    });
  });

  describe("calendar oriented finders", () => {
    it("findManyByIdsIncludeDestinationAndSelectedCalendars normalizes every user", async () => {
      prismaMock.user.findMany.mockResolvedValue([
        { id: 1, selectedCalendars: [{ eventTypeId: null }] },
        { id: 2, selectedCalendars: [{ eventTypeId: 7 }] },
      ] as unknown as User[]);

      const result = await repository.findManyByIdsIncludeDestinationAndSelectedCalendars({ ids: [1, 2] });

      expect(result[0].userLevelSelectedCalendars).toHaveLength(1);
      expect(result[1].userLevelSelectedCalendars).toHaveLength(0);
    });

    it("findManyByIdsWithCredentialsAndSelectedCalendars normalizes every user", async () => {
      prismaMock.user.findMany.mockResolvedValue([
        { id: 1, selectedCalendars: [{ eventTypeId: null }, { eventTypeId: 3 }] },
      ] as unknown as User[]);

      const result = await repository.findManyByIdsWithCredentialsAndSelectedCalendars({ userIds: [1] });

      expect(result[0].allSelectedCalendars).toHaveLength(2);
      expect(result[0].userLevelSelectedCalendars).toHaveLength(1);
    });

    it("findByIdWithSelectedCalendars selects the calendars of the user", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1 } as User);

      await repository.findByIdWithSelectedCalendars({ userId: 1 });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { id: true, email: true, selectedCalendars: true, destinationCalendar: true },
      });
    });

    it("findByIdWithCredentialsAndCalendar includes the destination calendar", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1 } as User);

      await repository.findByIdWithCredentialsAndCalendar({ userId: 1 });

      const args = prismaMock.user.findUnique.mock.calls[0][0];
      expect(args.select).toEqual(expect.objectContaining({ destinationCalendar: true }));
    });
  });

  describe("update helpers", () => {
    it("updateStripeCustomerId merges the customer id into the existing metadata", async () => {
      prismaMock.user.update.mockResolvedValue({ id: 1 } as User);

      await repository.updateStripeCustomerId({
        id: 1,
        stripeCustomerId: "cus_1",
        existingMetadata: { defaultConferencingApp: { appSlug: "daily-video" } },
      });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          metadata: { defaultConferencingApp: { appSlug: "daily-video" }, stripeCustomerId: "cus_1" },
        },
      });
    });

    it("updateWhitelistWorkflows toggles the flag", async () => {
      prismaMock.user.update.mockResolvedValue({ id: 1 } as User);

      await repository.updateWhitelistWorkflows({ id: 1, whitelistWorkflows: true });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { whitelistWorkflows: true },
      });
    });
  });

  describe("findManyUsersForDynamicEventType", () => {
    it("reuses the username where clause and asks for calendar credentials", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      await repository.findManyUsersForDynamicEventType({
        currentOrgDomain: null,
        usernameList: ["alice"],
      });

      const args = prismaMock.user.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ username: { in: ["alice"] }, organization: null });
      expect(args.select).toEqual(
        expect.objectContaining({ locked: true, allowDynamicBooking: true, credentials: expect.any(Object) })
      );
    });
  });

  describe("findUsersWithLastBooking", () => {
    it("only considers the latest accepted booking without no-shows", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      await repository.findUsersWithLastBooking({ userIds: [1], eventTypeId: 9 });

      const args = prismaMock.user.findMany.mock.calls[0][0];
      expect(args.select?.bookings).toEqual(
        expect.objectContaining({
          take: 1,
          orderBy: { createdAt: "desc" },
          where: expect.objectContaining({
            eventTypeId: 9,
            status: BookingStatus.ACCEPTED,
            attendees: { some: { noShow: false } },
            OR: [{ noShowHost: false }, { noShowHost: null }],
          }),
        })
      );
    });
  });

  describe("findUserWithHideBranding", () => {
    it("also selects the organization branding flag", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ hideBranding: true } as User);

      await repository.findUserWithHideBranding({ userId: 1 });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          hideBranding: true,
          profiles: { select: { organization: { select: { hideBranding: true } } } },
        },
      });
    });
  });

  describe("lockByEmail / unlockByEmail", () => {
    it("lockByEmail locks every user with that email", async () => {
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

      await repository.lockByEmail({ email: "alice@example.com" });

      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: { email: "alice@example.com" },
        data: { locked: true },
      });
    });

    it("unlockByEmail returns null and skips the update when no locked user exists", async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      expect(await repository.unlockByEmail({ email: "alice@example.com" })).toBeNull();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it("unlockByEmail unlocks the found user and returns its identity", async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: 1,
        email: "alice@example.com",
        username: "alice",
      } as User);
      prismaMock.user.update.mockResolvedValue({ id: 1 } as User);

      const result = await repository.unlockByEmail({ email: "alice@example.com" });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { locked: false },
      });
      expect(result).toEqual({ email: "alice@example.com", username: "alice" });
    });
  });
});
