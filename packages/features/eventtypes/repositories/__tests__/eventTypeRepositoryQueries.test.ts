import { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/prisma", () => ({
  availabilityUserSelect: { id: true },
  userSelect: { id: true },
}));

vi.mock("@calcom/features/membership/repositories/MembershipRepository", () => ({
  MembershipRepository: { findUserTeamIds: vi.fn() },
}));

const prismaMock = {
  eventType: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    count: vi.fn(),
  },
  membership: { findFirst: vi.fn() },
  team: { findMany: vi.fn() },
} as unknown as PrismaClient;

const eventType = prismaMock.eventType;
const findUserTeamIds = vi.mocked(MembershipRepository.findUserTeamIds);

let repository: EventTypeRepository;

beforeEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  repository = new EventTypeRepository(prismaMock);
  findUserTeamIds.mockResolvedValue([]);
});

describe("findParentEventTypeId", () => {
  it("returns the parent id of a managed child event type", async () => {
    vi.mocked(eventType.findFirst).mockResolvedValue({ parentId: 7 });

    expect(await repository.findParentEventTypeId(3)).toBe(7);
    expect(vi.mocked(eventType.findFirst).mock.calls[0][0].where).toEqual({
      id: 3,
      parentId: { not: null },
    });
  });

  it("returns null when the event type has no parent", async () => {
    vi.mocked(eventType.findFirst).mockResolvedValue(null);

    expect(await repository.findParentEventTypeId(3)).toBeNull();
  });
});

describe("create", () => {
  it("connects the owner, profile, team, parent and schedule relations", async () => {
    await repository.create({
      title: "30 min",
      slug: "30min",
      length: 30,
      userId: 1,
      profileId: 2,
      teamId: 3,
      parentId: 4,
      scheduleId: 5,
      metadata: { key: "value" },
      bookingLimits: { PER_DAY: 1 },
      durationLimits: { PER_DAY: 60 },
      recurringEvent: { count: 2 },
      bookingFields: [],
    });

    expect(vi.mocked(eventType.create).mock.calls[0][0].data).toMatchObject({
      title: "30 min",
      owner: { connect: { id: 1 } },
      profile: { connect: { id: 2 } },
      team: { connect: { id: 3 } },
      parent: { connect: { id: 4 } },
      schedule: { connect: { id: 5 } },
      metadata: { key: "value" },
      bookingLimits: { PER_DAY: 1 },
      durationLimits: { PER_DAY: 60 },
      recurringEvent: { count: 2 },
      bookingFields: [],
    });
  });

  it("omits the relations that were not provided", async () => {
    await repository.create({ title: "30 min", slug: "30min", length: 30 });

    const data = vi.mocked(eventType.create).mock.calls[0][0].data;
    expect(data).not.toHaveProperty("owner");
    expect(data).not.toHaveProperty("team");
    expect(data).not.toHaveProperty("metadata");
  });

  it("maps every entry when creating many event types", async () => {
    await repository.createMany([
      { title: "a", slug: "a", length: 15, userId: 1 },
      { title: "b", slug: "b", length: 30, teamId: 2 },
    ]);

    expect(vi.mocked(eventType.createMany).mock.calls[0][0].data).toMatchObject([
      { title: "a", owner: { connect: { id: 1 } } },
      { title: "b", team: { connect: { id: 2 } } },
    ]);
  });
});

describe.each([
  ["findAllByUpId", (repo: EventTypeRepository) => repo.findAllByUpId.bind(repo)],
  [
    "findAllByUpIdWithMinimalData",
    (repo: EventTypeRepository) => repo.findAllByUpIdWithMinimalData.bind(repo),
  ],
] as const)("%s", (_name, getMethod) => {
  const call = (upId: string, options?: Record<string, unknown>) =>
    getMethod(repository)({ upId, userId: 1 }, options);

  it("returns an empty list for an empty upId", async () => {
    expect(await call("")).toEqual([]);
    expect(eventType.findMany).not.toHaveBeenCalled();
  });

  it("queries by userId for a user lookup target", async () => {
    vi.mocked(eventType.findMany).mockResolvedValue([]);

    await call("usr-9", { where: { teamId: null }, limit: 10, cursor: 4 });

    const args = vi.mocked(eventType.findMany).mock.calls[0][0];
    expect(args.where).toMatchObject({ userId: 9, teamId: null });
    expect(args.take).toBe(11);
    expect(args.cursor).toEqual({ id: 4 });
  });

  it("resolves a uuid based profile and queries by profileId", async () => {
    vi.spyOn(ProfileRepository, "findByUid").mockResolvedValue({ id: 20 });
    vi.spyOn(ProfileRepository, "findById").mockResolvedValue({ id: 20, movedFromUser: null });
    vi.mocked(eventType.findMany).mockResolvedValue([]);

    await call("prof-abc");

    expect(ProfileRepository.findByUid).toHaveBeenCalledWith("abc");
    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where.OR).toEqual([
      { profileId: 20 },
      { userId: 1, parentId: { not: null } },
    ]);
  });

  it("includes the events of the user the profile was moved from", async () => {
    vi.spyOn(ProfileRepository, "findById").mockResolvedValue({
      id: 20,
      movedFromUser: { id: 33 },
    });
    vi.mocked(eventType.findMany).mockResolvedValue([]);

    await call("20");

    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where.OR).toEqual([
      { userId: 33, profileId: null },
      { profileId: 20 },
      { userId: 1, parentId: { not: null } },
    ]);
  });

  it("falls back to a userId lookup when the profile uid cannot be resolved", async () => {
    vi.spyOn(ProfileRepository, "findByUid").mockResolvedValue(null);
    vi.mocked(eventType.findMany).mockResolvedValue([]);

    await call("prof-missing");

    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where).toMatchObject({ userId: undefined });
  });
});

describe("findTeamEventTypes", () => {
  it("throws when the user is neither a team member nor an admin of the parent org", async () => {
    vi.mocked(prismaMock.membership.findFirst).mockResolvedValue(null);

    await expect(repository.findTeamEventTypes({ teamId: 5, userId: 1 })).rejects.toThrow(
      "User is not a member of this team"
    );
  });

  it("accepts an org admin through the parent team and paginates", async () => {
    vi.mocked(prismaMock.membership.findFirst).mockResolvedValue({ id: 1 });
    vi.mocked(eventType.findMany).mockResolvedValue([]);

    await repository.findTeamEventTypes({
      teamId: 5,
      parentId: 9,
      userId: 1,
      limit: 2,
      cursor: 3,
      where: { hidden: false },
    });

    const membershipWhere = vi.mocked(prismaMock.membership.findFirst).mock.calls[0][0].where;
    expect(membershipWhere.OR[0]).toEqual({ teamId: 5, userId: 1, accepted: true });
    expect(membershipWhere.OR[1].team.parent).toMatchObject({
      id: 9,
      members: {
        some: {
          userId: 1,
          accepted: true,
          role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
        },
      },
    });

    const args = vi.mocked(eventType.findMany).mock.calls[0][0];
    expect(args.where).toEqual({ teamId: 5, hidden: false });
    expect(args.take).toBe(3);
    expect(args.cursor).toEqual({ id: 3 });
  });
});

describe("findById", () => {
  it("allows access through the user's teams", async () => {
    findUserTeamIds.mockResolvedValue([4, 5]);
    vi.mocked(eventType.findFirst).mockResolvedValue({ id: 1 });

    const result = await repository.findById({ id: 1, userId: 2 });

    expect(result).toEqual({ id: 1 });
    const where = vi.mocked(eventType.findFirst).mock.calls[0][0].where;
    expect(where.AND[0].OR).toEqual([
      { users: { some: { id: 2 } } },
      { AND: [{ teamId: { not: null } }, { teamId: { in: [4, 5] } }] },
      { userId: 2 },
    ]);
    expect(where.AND[1]).toEqual({ id: 1 });
  });
});

describe("findByIdForOrgAdmin", () => {
  it("scopes the lookup to the organization's teams", async () => {
    vi.mocked(eventType.findFirst).mockResolvedValue({ id: 1 });

    await repository.findByIdForOrgAdmin({ id: 1, organizationId: 8 });

    const where = vi.mocked(eventType.findFirst).mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ id: 1 });
    expect(where.AND[1].OR).toEqual([
      { AND: [{ userId: { not: null } }, { owner: { profiles: { some: { organizationId: 8 } } } }] },
      { AND: [{ teamId: { not: null } }, { team: { parentId: 8 } }] },
    ]);
  });
});

describe("simple lookups", () => {
  it("finds all event types of a user", async () => {
    await repository.findAllByUserId({ userId: 3 });
    expect(vi.mocked(eventType.findMany).mock.calls[0][0]).toEqual({ where: { userId: 3 } });
  });

  it("finds the title by id", async () => {
    await repository.findTitleById({ id: 3 });
    expect(vi.mocked(eventType.findUnique).mock.calls[0][0]).toEqual({
      where: { id: 3 },
      select: { title: true },
    });
  });

  it("restricts findByIdWithUserAccess to owners, hosts and users", async () => {
    await repository.findByIdWithUserAccess({ id: 3, userId: 4 });
    expect(vi.mocked(eventType.findUnique).mock.calls[0][0].where.OR).toEqual([
      { userId: 4 },
      { hosts: { some: { userId: 4 } } },
      { users: { some: { id: 4 } } },
    ]);
  });

  it("finds a minimal event type by id", async () => {
    await repository.findByIdMinimal({ id: 3 });
    expect(vi.mocked(eventType.findUnique).mock.calls[0][0]).toEqual({ where: { id: 3 } });
  });

  it("finds the first personal event type of a user", async () => {
    await repository.getFirstEventTypeByUserId({ userId: 3 });
    expect(vi.mocked(eventType.findFirst).mock.calls[0][0].where).toEqual({ userId: 3, teamId: null });
  });

  it("finds the team id of an event type", async () => {
    await repository.getTeamIdByEventTypeId({ id: 3 });
    expect(vi.mocked(eventType.findFirst).mock.calls[0][0]).toEqual({
      where: { id: 3 },
      select: { teamId: true },
    });
  });

  it("finds an event type together with its team id", async () => {
    await repository.findByIdWithTeamId({ id: 3 });
    expect(vi.mocked(eventType.findUnique).mock.calls[0][0].select).toEqual({ id: true, teamId: true });
  });

  it("finds an event type together with its parent", async () => {
    await repository.findByIdWithParent(3);
    expect(vi.mocked(eventType.findUnique).mock.calls[0][0].select).toEqual({
      id: true,
      parentId: true,
      userId: true,
    });
  });

  it("finds an event type with its parent, user and scheduling type", async () => {
    await repository.findByIdWithParentAndUserId(3);
    expect(vi.mocked(eventType.findUnique).mock.calls[0][0].select).toEqual({
      id: true,
      parentId: true,
      userId: true,
      schedulingType: true,
    });
  });

  it("finds the child event type of a user by its parent", async () => {
    await repository.findByIdTargetChildEventType(4, 3);
    expect(vi.mocked(eventType.findUnique).mock.calls[0][0].where).toEqual({
      userId_parentId: { userId: 4, parentId: 3 },
    });
  });

  it("selects the branding information of an event type", async () => {
    await repository.findByIdIncludeBrandingInfo({ id: 3 });
    expect(vi.mocked(eventType.findUnique).mock.calls[0][0].select.team.select).toMatchObject({
      hideBranding: true,
    });
  });

  it("finds the children of a parent including their owners", async () => {
    await repository.findChildrenByParentIdIncludeOwner(3);
    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where).toEqual({ parentId: 3 });
  });

  it("includes managed children when listing the event types of a team", async () => {
    await repository.findAllByTeamIdIncludeManagedEventTypes({ teamId: 3 });
    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where.OR).toEqual([
      { teamId: 3 },
      { parent: { teamId: 3 } },
    ]);
  });

  it("lists the event types including their children by team", async () => {
    await repository.findAllIncludingChildrenByTeamId({ teamId: 3 });
    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where).toEqual({ teamId: 3 });
  });
});

describe("findFirstEventTypeId", () => {
  it("uses the compound team key when a team id is given", async () => {
    await repository.findFirstEventTypeId({ slug: "30min", teamId: 2 });

    expect(vi.mocked(eventType.findUnique).mock.calls[0][0].where).toEqual({
      teamId_slug: { teamId: 2, slug: "30min" },
    });
  });

  it("uses the compound user key when a user id is given", async () => {
    await repository.findFirstEventTypeId({ slug: "30min", userId: 5 });

    expect(vi.mocked(eventType.findUnique).mock.calls[0][0].where).toEqual({
      userId_slug: { userId: 5, slug: "30min" },
    });
  });

  it("falls back to a slug lookup when neither is given", async () => {
    await repository.findFirstEventTypeId({ slug: "30min" });

    expect(vi.mocked(eventType.findFirst).mock.calls[0][0].where).toEqual({ slug: "30min" });
    expect(eventType.findUnique).not.toHaveBeenCalled();
  });
});

describe("findEventTypesWithoutChildren", () => {
  it("only excludes managed children when a team id is given", async () => {
    await repository.findEventTypesWithoutChildren([1, 2], 5);
    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where).toEqual({
      id: { in: [1, 2] },
      parentId: null,
    });

    await repository.findEventTypesWithoutChildren([1, 2]);
    expect(vi.mocked(eventType.findMany).mock.calls[1][0].where).toEqual({ id: { in: [1, 2] } });
  });
});

describe("findAllIncludingChildrenByUserId", () => {
  it("returns an empty list for a missing user", async () => {
    expect(await repository.findAllIncludingChildrenByUserId({ userId: null })).toEqual([]);
    expect(eventType.findMany).not.toHaveBeenCalled();
  });

  it("queries by user id otherwise", async () => {
    await repository.findAllIncludingChildrenByUserId({ userId: 3 });
    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where).toEqual({ userId: 3 });
  });
});

describe("findManyChildEventTypes", () => {
  it("excludes a user only when an exclusion is requested", async () => {
    await repository.findManyChildEventTypes(3, 9);
    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where).toEqual({
      parentId: 3,
      userId: { not: 9 },
    });

    await repository.findManyChildEventTypes(3);
    expect(vi.mocked(eventType.findMany).mock.calls[1][0].where).toEqual({ parentId: 3 });
  });
});

describe("findByIdIncludeHostsAndTeam", () => {
  it("returns null when the event type does not exist", async () => {
    vi.mocked(eventType.findUnique).mockResolvedValue(null);

    expect(await repository.findByIdIncludeHostsAndTeam({ id: 3 })).toBeNull();
  });

  it("normalizes the selected calendars of every host", async () => {
    vi.mocked(eventType.findUnique).mockResolvedValue({
      id: 3,
      hosts: [{ user: { id: 1, selectedCalendars: [{ externalId: "a", eventTypeId: null }] } }],
      team: null,
    });

    const result = await repository.findByIdIncludeHostsAndTeam({ id: 3 });

    expect(result?.hosts[0].user).toHaveProperty("userLevelSelectedCalendars");
  });
});

describe("findByIdForUserAvailability", () => {
  it("returns null when the event type does not exist", async () => {
    vi.mocked(eventType.findUnique).mockResolvedValue(null);

    expect(await repository.findByIdForUserAvailability({ id: 3 })).toBeNull();
  });

  it("parses the event type metadata", async () => {
    vi.mocked(eventType.findUnique).mockResolvedValue({
      id: 3,
      metadata: { multipleDuration: [15, 30] },
    });

    const result = await repository.findByIdForUserAvailability({ id: 3 });

    expect(result?.metadata?.multipleDuration).toEqual([15, 30]);
  });
});

describe("findForSlots", () => {
  it("returns null when the event type does not exist", async () => {
    vi.mocked(eventType.findUnique).mockResolvedValue(null);

    expect(await repository.findForSlots({ id: 3 })).toBeNull();
  });

  it("normalizes hosts, users, metadata and the round robin segment", async () => {
    vi.mocked(eventType.findUnique).mockResolvedValue({
      id: 3,
      hosts: [{ user: { id: 1, selectedCalendars: [] } }],
      users: [{ id: 2, selectedCalendars: [] }],
      metadata: { multipleDuration: [15] },
      rrSegmentQueryValue: null,
    });

    const result = await repository.findForSlots({ id: 3 });

    expect(result?.hosts[0].user).toHaveProperty("userLevelSelectedCalendars");
    expect(result?.users[0]).toHaveProperty("userLevelSelectedCalendars");
    expect(result?.metadata?.multipleDuration).toEqual([15]);
    expect(result?.rrSegmentQueryValue).toBeNull();
  });
});

describe("findManyWithPagination", () => {
  it("returns the page together with the total count", async () => {
    vi.mocked(eventType.findMany).mockResolvedValue([{ id: 1 }]);
    vi.mocked(eventType.count).mockResolvedValue(12);

    const result = await repository.findManyWithPagination({
      where: { teamId: 2 },
      skip: 10,
      take: 5,
      orderBy: { id: "asc" },
    });

    expect(result).toEqual({ eventTypes: [{ id: 1 }], total: 12 });
    expect(vi.mocked(eventType.findMany).mock.calls[0][0]).toMatchObject({ skip: 10, take: 5 });
  });
});

describe("listChildEventTypes", () => {
  beforeEach(() => {
    vi.mocked(eventType.count).mockResolvedValue(3);
  });

  it("reports the next cursor when there are more rows than the limit", async () => {
    vi.mocked(eventType.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const result = await repository.listChildEventTypes({ parentEventTypeId: 9, limit: 2 });

    expect(result).toMatchObject({ totalCount: 3, hasMore: true, nextCursor: 2 });
    expect(result.items).toHaveLength(2);
    expect(vi.mocked(eventType.findMany).mock.calls[0][0].take).toBe(3);
  });

  it("has no next cursor when the page is not full", async () => {
    vi.mocked(eventType.findMany).mockResolvedValue([{ id: 1 }]);

    const result = await repository.listChildEventTypes({ parentEventTypeId: 9, limit: 2 });

    expect(result).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("filters by search term and excluded user and skips the cursor row", async () => {
    vi.mocked(eventType.findMany).mockResolvedValue([]);

    await repository.listChildEventTypes({
      parentEventTypeId: 9,
      excludeUserId: 4,
      searchTerm: "ali",
      limit: 2,
      cursor: 7,
    });

    const args = vi.mocked(eventType.findMany).mock.calls[0][0];
    expect(args.where).toEqual({
      parentId: 9,
      userId: { not: 4 },
      owner: {
        OR: [
          { name: { contains: "ali", mode: "insensitive" } },
          { email: { contains: "ali", mode: "insensitive" } },
        ],
      },
    });
    expect(args).toMatchObject({ skip: 1, cursor: { id: 7 } });
  });
});

describe("findByIdIncludeHostsAndTeamMembers", () => {
  it("only selects accepted admins and owners of the team", async () => {
    await repository.findByIdIncludeHostsAndTeamMembers({ id: 3 });

    expect(vi.mocked(eventType.findUnique).mock.calls[0][0].select.team.select.members.where).toEqual({
      accepted: true,
      role: { in: ["ADMIN", "OWNER"] },
    });
  });
});

describe("getEventTypeList", () => {
  const user = { id: 1, organizationId: 10, isOwnerAdminOfParentTeam: false };

  it("returns the team events of an admin of the parent team without a membership", async () => {
    vi.mocked(prismaMock.membership.findFirst).mockResolvedValue(null);
    vi.mocked(eventType.findMany).mockResolvedValue([{ id: 1 }]);

    const result = await repository.getEventTypeList({
      teamId: 5,
      userId: null,
      isAll: false,
      user: { ...user, isOwnerAdminOfParentTeam: true },
    });

    expect(result).toEqual([{ id: 1 }]);
    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where).toEqual({ teamId: 5 });
  });

  it("restricts a plain team member to their own events", async () => {
    vi.mocked(prismaMock.membership.findFirst).mockResolvedValue({ role: MembershipRole.MEMBER });
    vi.mocked(eventType.findMany).mockResolvedValue([]);

    await repository.getEventTypeList({ teamId: 5, userId: null, isAll: false, user });

    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where).toEqual({
      teamId: 5,
      OR: [{ userId: 1 }, { users: { some: { id: 1 } } }],
    });
  });

  it("does not restrict an admin of the team", async () => {
    vi.mocked(prismaMock.membership.findFirst).mockResolvedValue({ role: MembershipRole.ADMIN });
    vi.mocked(eventType.findMany).mockResolvedValue([]);

    await repository.getEventTypeList({ teamId: 5, userId: null, isAll: false, user });

    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where).toEqual({ teamId: 5 });
  });

  it("only queries the organization teams it can find for an org wide view", async () => {
    vi.mocked(prismaMock.team.findMany).mockResolvedValue([]);
    vi.mocked(eventType.findMany).mockResolvedValue([]);

    await repository.getEventTypeList({
      teamId: null,
      userId: null,
      isAll: true,
      user: { ...user, isOwnerAdminOfParentTeam: true },
    });

    expect(vi.mocked(eventType.findMany).mock.calls[0][0].where.OR[0]).toEqual({ teamId: { in: [10] } });
  });
});
