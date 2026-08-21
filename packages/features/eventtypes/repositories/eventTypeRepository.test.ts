import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import { EventTypeRepository } from "./eventTypeRepository";

type RepositoryMocks = {
  getLookupTarget: ReturnType<typeof vi.fn>;
  findByUid: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findUserTeamIds: ReturnType<typeof vi.fn>;
  withSelectedCalendars: ReturnType<typeof vi.fn>;
};

const mocks: RepositoryMocks = vi.hoisted(() => ({
  getLookupTarget: vi.fn(),
  findByUid: vi.fn(),
  findById: vi.fn(),
  findUserTeamIds: vi.fn(),
  withSelectedCalendars: vi.fn((user: { selectedCalendars: unknown[] }) => {
    const { selectedCalendars, ...rest } = user;
    return {
      ...rest,
      allSelectedCalendars: selectedCalendars,
      userLevelSelectedCalendars: selectedCalendars,
    };
  }),
}));

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  LookupTarget: { User: 0, Profile: 1 },
  ProfileRepository: {
    getLookupTarget: mocks.getLookupTarget,
    findByUid: mocks.findByUid,
    findById: mocks.findById,
  },
}));

vi.mock("@calcom/features/membership/repositories/MembershipRepository", () => ({
  MembershipRepository: { findUserTeamIds: mocks.findUserTeamIds },
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  withSelectedCalendars: mocks.withSelectedCalendars,
}));

type PrismaMock = ReturnType<typeof mockDeep<PrismaClient>>;

const prisma: PrismaMock = mockDeep<PrismaClient>();
const repository: EventTypeRepository = new EventTypeRepository(prisma);

const buildUser = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1,
  name: "Ada Lovelace",
  email: "ada@example.com",
  selectedCalendars: [{ id: "calendar-1", eventTypeId: null }],
  ...overrides,
});

const buildHost = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  user: buildUser(),
  weight: 1,
  priority: 0,
  groupId: null,
  createdAt: new Date("2024-01-01"),
  ...overrides,
});

const buildEvent = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 10,
  title: "Team meeting",
  slug: "team-meeting",
  userId: 1,
  teamId: null,
  parentId: null,
  metadata: {},
  rrSegmentQueryValue: null,
  users: [buildUser()],
  hosts: [buildHost()],
  ...overrides,
});

const configureLookup = (): void => {
  mocks.getLookupTarget.mockImplementation((upId: string) => {
    if (upId.startsWith("usr-")) {
      return { type: 0, id: Number(upId.replace("usr-", "")) };
    }
    if (upId.startsWith("prof-")) {
      return { type: 1, uid: upId.replace("prof-", "") };
    }
    return { type: 1, id: Number(upId) };
  });
  mocks.findByUid.mockResolvedValue(null);
  mocks.findById.mockResolvedValue(null);
  mocks.findUserTeamIds.mockResolvedValue([]);
};

beforeEach(() => {
  mockReset(prisma);
  vi.clearAllMocks();
  configureLookup();
});

describe("basic event-type queries", () => {
  it("finds a parent id and returns null for an event without a parent", async () => {
    prisma.eventType.findFirst.mockResolvedValueOnce({ parentId: 7 } as never);
    await expect(repository.findParentEventTypeId(10)).resolves.toBe(7);
    expect(prisma.eventType.findFirst).toHaveBeenCalledWith({
      where: { id: 10, parentId: { not: null } },
      select: { parentId: true },
    });

    prisma.eventType.findFirst.mockResolvedValueOnce(null);
    await expect(repository.findParentEventTypeId(11)).resolves.toBeNull();
  });

  it("maps relation ids and optional fields for create and createMany", async () => {
    const data = {
      title: "Meeting",
      slug: "meeting",
      length: 30,
      userId: 1,
      profileId: 2,
      teamId: 3,
      parentId: 4,
      scheduleId: 5,
      metadata: { managedEventConfig: {} },
      bookingLimits: { day: 2 },
      recurringEvent: { freq: 2 },
      bookingFields: [{ name: "email" }],
      durationLimits: { "30": { min: 1, max: 2 } },
    };
    const created = { id: 10 };
    prisma.eventType.create.mockResolvedValue(created as never);

    await expect(repository.create(data)).resolves.toBe(created);
    expect(prisma.eventType.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Meeting",
        slug: "meeting",
        length: 30,
        owner: { connect: { id: 1 } },
        profile: { connect: { id: 2 } },
        team: { connect: { id: 3 } },
        parent: { connect: { id: 4 } },
        schedule: { connect: { id: 5 } },
        metadata: data.metadata,
        bookingLimits: data.bookingLimits,
        recurringEvent: data.recurringEvent,
        bookingFields: data.bookingFields,
        durationLimits: data.durationLimits,
      }),
      include: { calVideoSettings: true },
    });

    prisma.eventType.createMany.mockResolvedValue({ count: 2 });
    await expect(repository.createMany([data, { ...data, userId: null }])).resolves.toEqual({ count: 2 });
    expect(prisma.eventType.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ owner: { connect: { id: 1 } } }),
        expect.not.objectContaining({ owner: expect.anything() }),
      ],
    });
  });

  it("omits optional create relations and values when they are absent", async () => {
    prisma.eventType.create.mockResolvedValue({ id: 11 } as never);
    await repository.create({ title: "Minimal", slug: "minimal", length: 15 });
    expect(prisma.eventType.create).toHaveBeenCalledWith({
      data: { title: "Minimal", slug: "minimal", length: 15 },
      include: { calVideoSettings: true },
    });
  });

  it.each([
    ["findAllByUpId", false],
    ["findAllByUpIdWithMinimalData", true],
  ])("returns an empty list for a missing upId in %s", async (methodName, _minimal) => {
    let result: unknown[];
    if (methodName === "findAllByUpId") {
      result = await repository.findAllByUpId({ upId: "", userId: 1 });
    } else {
      result = await repository.findAllByUpIdWithMinimalData({ upId: "", userId: 1 });
    }
    expect(result).toEqual([]);
    expect(prisma.eventType.findMany).not.toHaveBeenCalled();
  });

  it("resolves user and profile upIds with pagination and filters", async () => {
    const rows = [{ id: 1 }];
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    const where = { hidden: false };
    const orderBy = [{ position: "desc" as const }];

    await expect(
      repository.findAllByUpId({ upId: "usr-42", userId: 9 }, { where, orderBy, cursor: 10, limit: 5 })
    ).resolves.toBe(rows);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 42, hidden: false },
        cursor: { id: 10 },
        take: 6,
        orderBy,
      })
    );

    vi.clearAllMocks();
    configureLookup();
    mocks.findByUid.mockResolvedValue({ id: 8 });
    mocks.findById.mockResolvedValue({ movedFromUser: { id: 4 } });
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await repository.findAllByUpIdWithMinimalData(
      { upId: "prof-abc", userId: 9 },
      { cursor: null, limit: null }
    );
    expect(mocks.findByUid).toHaveBeenCalledWith("abc");
    expect(mocks.findById).toHaveBeenCalledWith(8);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ userId: 4, profileId: null }, { profileId: 8 }, { userId: 9, parentId: { not: null } }],
        },
        cursor: undefined,
        take: undefined,
      })
    );
  });

  it("uses profile and moved-from-user filters for the full upId lookup", async () => {
    mocks.findById.mockResolvedValue({ movedFromUser: null });
    const rows = [{ id: 2 }];
    prisma.eventType.findMany.mockResolvedValue(rows as never);

    await expect(repository.findAllByUpId({ upId: "22", userId: 9 })).resolves.toBe(rows);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ profileId: 22 }, { userId: 9, parentId: { not: null } }],
        },
      })
    );
  });

  it("covers resolved profile, moved profile, and minimal lookup pagination branches", async () => {
    const rows = [{ id: 4 }];
    mocks.findByUid.mockResolvedValue({ id: 8 });
    mocks.findById.mockResolvedValue({ movedFromUser: { id: 6 } });
    prisma.eventType.findMany.mockResolvedValue(rows as never);

    await expect(repository.findAllByUpId({ upId: "prof-resolved", userId: 9 })).resolves.toBe(rows);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ userId: 6, profileId: null }, { profileId: 8 }, { userId: 9, parentId: { not: null } }],
        },
      })
    );

    vi.clearAllMocks();
    configureLookup();
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(
      repository.findAllByUpIdWithMinimalData({ upId: "usr-42", userId: 9 }, { cursor: 3, limit: 2 })
    ).resolves.toBe(rows);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 42 }, cursor: { id: 3 }, take: 3 })
    );

    vi.clearAllMocks();
    configureLookup();
    mocks.findById.mockResolvedValue(null);
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(repository.findAllByUpIdWithMinimalData({ upId: "22", userId: 9 })).resolves.toBe(rows);
    expect(mocks.findById).toHaveBeenCalledWith(22);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ profileId: 22 }, { userId: 9, parentId: { not: null } }],
        },
      })
    );
  });

  it("handles a profile uid that cannot be resolved as a user lookup", async () => {
    const rows = [{ id: 3 }];
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(repository.findAllByUpIdWithMinimalData({ upId: "prof-missing", userId: 9 })).resolves.toBe(
      rows
    );
    expect(mocks.findByUid).toHaveBeenCalledWith("missing");
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: undefined } })
    );
  });

  it("finds team events only after accepted membership validation", async () => {
    const rows = [{ id: 3 }];
    prisma.membership.findFirst.mockResolvedValue({ id: 1 } as never);
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(
      repository.findTeamEventTypes({
        teamId: 20,
        parentId: 99,
        userId: 7,
        limit: 4,
        cursor: 6,
        orderBy: [{ id: "asc" }],
        where: { hidden: false },
      })
    ).resolves.toBe(rows);
    expect(prisma.membership.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { teamId: 20, userId: 7, accepted: true },
          {
            team: {
              parent: {
                id: 99,
                members: {
                  some: {
                    userId: 7,
                    accepted: true,
                    role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
                  },
                },
              },
            },
          },
        ],
      },
    });
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId: 20, hidden: false },
        cursor: { id: 6 },
        take: 5,
      })
    );

    vi.clearAllMocks();
    prisma.membership.findFirst.mockResolvedValue(null);
    await expect(repository.findTeamEventTypes({ teamId: 20, userId: 7, parentId: null })).rejects.toThrow(
      "User is not a member of this team"
    );
    expect(prisma.eventType.findMany).not.toHaveBeenCalled();
  });

  it("supports team lookups without an organization, cursor, or limit", async () => {
    const rows = [{ id: 8 }];
    prisma.membership.findFirst.mockResolvedValue({ id: 1 } as never);
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(repository.findTeamEventTypes({ teamId: 20, userId: 7, parentId: null })).resolves.toBe(
      rows
    );
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: undefined,
        take: undefined,
        orderBy: undefined,
      })
    );
  });
});

describe("single event-type lookups", () => {
  it("passes user, title, access, and minimal queries through", async () => {
    const rows = [{ id: 1 }];
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(repository.findAllByUserId({ userId: 8 })).resolves.toBe(rows);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith({ where: { userId: 8 } });

    const title = { title: "Meeting" };
    prisma.eventType.findUnique.mockResolvedValue(title as never);
    await expect(repository.findTitleById({ id: 4 })).resolves.toBe(title);
    expect(prisma.eventType.findUnique).toHaveBeenCalledWith({
      where: { id: 4 },
      select: { title: true },
    });

    const accessible = { id: 4 };
    prisma.eventType.findUnique.mockResolvedValue(accessible as never);
    await expect(repository.findByIdWithUserAccess({ id: 4, userId: 8 })).resolves.toBe(accessible);
    expect(prisma.eventType.findUnique).toHaveBeenCalledWith({
      where: {
        id: 4,
        OR: [{ userId: 8 }, { hosts: { some: { userId: 8 } } }, { users: { some: { id: 8 } } }],
      },
    });

    prisma.eventType.findUnique.mockResolvedValue(null);
    await expect(repository.findByIdMinimal({ id: 12 })).resolves.toBeNull();
    expect(prisma.eventType.findUnique).toHaveBeenCalledWith({ where: { id: 12 } });
  });

  it("scopes findById to the user's teams and returns the selected event", async () => {
    const event = { id: 4, title: "Meeting" };
    mocks.findUserTeamIds.mockResolvedValue([20, 21]);
    prisma.eventType.findFirst.mockResolvedValue(event as never);

    await expect(repository.findById({ id: 4, userId: 8 })).resolves.toBe(event);
    expect(mocks.findUserTeamIds).toHaveBeenCalledWith({ userId: 8 });
    expect(prisma.eventType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { users: { some: { id: 8 } } },
                { AND: [{ teamId: { not: null } }, { teamId: { in: [20, 21] } }] },
                { userId: 8 },
              ],
            },
            { id: 4 },
          ],
        },
      })
    );
  });

  it("queries organization-admin events with user and team organization scopes", async () => {
    const event = { id: 6 };
    prisma.eventType.findFirst.mockResolvedValue(event as never);
    await expect(repository.findByIdForOrgAdmin({ id: 6, organizationId: 99 })).resolves.toBe(event);
    expect(prisma.eventType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { id: 6 },
            {
              OR: [
                {
                  AND: [{ userId: { not: null } }, { owner: { profiles: { some: { organizationId: 99 } } } }],
                },
                { AND: [{ teamId: { not: null } }, { team: { parentId: 99 } }] },
              ],
            },
          ],
        },
      })
    );
  });

  it.each([
    ["team", { teamId: 20, slug: "team" }],
    ["user", { userId: 8, slug: "personal" }],
    ["fallback", { slug: "fallback" }],
  ])("uses the appropriate unique key in findFirstEventTypeId for %s", async (_kind, values) => {
    const result = { id: 5 };
    prisma.eventType.findUnique.mockResolvedValue(result as never);
    prisma.eventType.findFirst.mockResolvedValue(result as never);
    await expect(
      repository.findFirstEventTypeId({
        slug: values.slug,
        teamId: values.teamId,
        userId: values.userId,
      })
    ).resolves.toBe(result);
    if (values.teamId) {
      expect(prisma.eventType.findUnique).toHaveBeenCalledWith({
        where: { teamId_slug: { teamId: values.teamId, slug: values.slug } },
        select: { id: true },
      });
    } else if (values.userId) {
      expect(prisma.eventType.findUnique).toHaveBeenCalledWith({
        where: { userId_slug: { userId: values.userId, slug: values.slug } },
        select: { id: true },
      });
    } else {
      expect(prisma.eventType.findFirst).toHaveBeenCalledWith({
        where: { slug: values.slug },
        select: { id: true },
      });
    }
  });
});

describe("host, team, and availability lookups", () => {
  it("flattens selected calendars for hosts and preserves null results", async () => {
    const event = {
      id: 1,
      hosts: [buildHost()],
      team: { parentId: 20, rrResetInterval: 5, rrTimestampBasis: "EVENT" },
    };
    prisma.eventType.findUnique.mockResolvedValue(event as never);
    const result = await repository.findByIdIncludeHostsAndTeam({ id: 1 });
    expect(result?.hosts[0].user).toMatchObject({
      allSelectedCalendars: [{ id: "calendar-1", eventTypeId: null }],
    });
    expect(prisma.eventType.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        include: expect.objectContaining({ hosts: expect.anything() }),
      })
    );

    prisma.eventType.findUnique.mockResolvedValue(null);
    await expect(repository.findByIdIncludeHostsAndTeam({ id: 2 })).resolves.toBeNull();
  });

  it("returns host and accepted admin or owner team members", async () => {
    const event = {
      id: 2,
      bookingRequiresAuthentication: true,
      userId: 1,
      teamId: 20,
      hosts: [{ userId: 7 }],
      team: {
        id: 20,
        parentId: 99,
        isOrganization: false,
        members: [{ userId: 7, role: "ADMIN" }],
      },
    };
    prisma.eventType.findUnique.mockResolvedValue(event as never);
    await expect(repository.findByIdIncludeHostsAndTeamMembers({ id: 2 })).resolves.toBe(event);
    expect(prisma.eventType.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        select: expect.objectContaining({
          team: expect.objectContaining({
            select: expect.objectContaining({
              members: {
                where: { accepted: true, role: { in: ["ADMIN", "OWNER"] } },
                select: { userId: true, role: true },
              },
            }),
          }),
        }),
      })
    );
  });

  it("finds managed events, first user events, and event ids without children", async () => {
    const rows = [{ id: 1 }];
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(repository.findAllByTeamIdIncludeManagedEventTypes({ teamId: 20 })).resolves.toBe(rows);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith({
      where: { OR: [{ teamId: 20 }, { parent: { teamId: 20 } }] },
    });

    const first = { id: 2 };
    prisma.eventType.findFirst.mockResolvedValue(first as never);
    await expect(repository.getFirstEventTypeByUserId({ userId: 3 })).resolves.toBe(first);
    expect(prisma.eventType.findFirst).toHaveBeenCalledWith({
      where: { userId: 3, teamId: null },
      select: { id: true },
    });

    prisma.eventType.findMany.mockResolvedValue([{ id: 4, children: [] }] as never);
    await repository.findEventTypesWithoutChildren([4, 5], 20);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [4, 5] }, parentId: null } })
    );
    await repository.findEventTypesWithoutChildren([4, 5]);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [4, 5] } } })
    );

    await repository.findAllByTeamIdIncludeManagedEventTypes({});
    expect(prisma.eventType.findMany).toHaveBeenCalledWith({
      where: { OR: [{ teamId: undefined }, { parent: { teamId: undefined } }] },
    });
  });

  it("handles slot and availability transformations and missing rows", async () => {
    const event = buildEvent({
      hosts: [buildHost()],
      users: [buildUser()],
      metadata: {},
      rrSegmentQueryValue: null,
    });
    prisma.eventType.findUnique.mockResolvedValue(event as never);
    const slots = await repository.findForSlots({ id: 10 });
    expect(slots).toMatchObject({
      id: 10,
      metadata: {},
      hosts: [{ user: { allSelectedCalendars: [{ id: "calendar-1", eventTypeId: null }] } }],
      users: [{ allSelectedCalendars: [{ id: "calendar-1", eventTypeId: null }] }],
    });

    prisma.eventType.findUnique.mockResolvedValue(null);
    await expect(repository.findForSlots({ id: 11 })).resolves.toBeNull();

    const availability = { id: 12, metadata: {} };
    prisma.eventType.findUnique.mockResolvedValue(availability as never);
    await expect(repository.findByIdForUserAvailability({ id: 12 })).resolves.toMatchObject({
      id: 12,
      metadata: {},
    });
    prisma.eventType.findUnique.mockResolvedValue(null);
    await expect(repository.findByIdForUserAvailability({ id: 13 })).resolves.toBeNull();
  });
});

describe("child and pagination queries", () => {
  it("lists children for users and teams, including null-user handling", async () => {
    const rows = [{ id: 1, children: [{ id: 2 }] }];
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(repository.findAllIncludingChildrenByUserId({ userId: 4 })).resolves.toBe(rows);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith({
      where: { userId: 4 },
      select: { id: true, children: { select: { id: true } } },
    });
    await expect(repository.findAllIncludingChildrenByUserId({ userId: null })).resolves.toEqual([]);

    await expect(repository.findAllIncludingChildrenByTeamId({ teamId: 20 })).resolves.toBe(rows);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith({
      where: { teamId: 20 },
      select: { id: true, children: { select: { id: true } } },
    });
  });

  it("supports child exclusion, ids, parent lookup, branding, and target lookup", async () => {
    const row = { id: 1, userId: 2 };
    prisma.eventType.findMany.mockResolvedValue([row] as never);
    await expect(repository.findManyChildEventTypes(9, 3)).resolves.toEqual([row]);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith({
      where: { parentId: 9, userId: { not: 3 } },
      select: { id: true, userId: true },
    });
    await repository.findManyChildEventTypes(9);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith({
      where: { parentId: 9 },
      select: { id: true, userId: true },
    });

    prisma.eventType.findFirst.mockResolvedValue({ teamId: 20 } as never);
    await expect(repository.getTeamIdByEventTypeId({ id: 8 })).resolves.toEqual({ teamId: 20 });
    expect(prisma.eventType.findFirst).toHaveBeenCalledWith({
      where: { id: 8 },
      select: { teamId: true },
    });

    const parent = { id: 8, parentId: 7, userId: 2, schedulingType: null };
    prisma.eventType.findUnique.mockResolvedValue(parent as never);
    await expect(repository.findByIdWithParent(8)).resolves.toBe(parent);
    await expect(repository.findByIdWithParentAndUserId(8)).resolves.toBe(parent);

    const target = { id: 8, parentId: 7, userId: 2 };
    prisma.eventType.findUnique.mockResolvedValue(target as never);
    await expect(repository.findByIdTargetChildEventType(2, 7)).resolves.toBe(target);
    expect(prisma.eventType.findUnique).toHaveBeenCalledWith({
      where: { userId_parentId: { userId: 2, parentId: 7 } },
      select: { id: true, parentId: true, userId: true },
    });

    const branding = { id: 8, team: null, owner: null };
    prisma.eventType.findUnique.mockResolvedValue(branding as never);
    await expect(repository.findByIdIncludeBrandingInfo({ id: 8 })).resolves.toBe(branding);
    expect(prisma.eventType.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 8 },
        select: expect.objectContaining({ team: expect.anything() }),
      })
    );
  });

  it("returns paginated event types with a total count", async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    prisma.eventType.count.mockResolvedValue(2);
    await expect(
      repository.findManyWithPagination({
        where: { teamId: 20 },
        skip: 5,
        take: 10,
        orderBy: { title: "asc" },
      })
    ).resolves.toEqual({ eventTypes: rows, total: 2 });
    expect(prisma.eventType.findMany).toHaveBeenCalledWith({
      where: { teamId: 20 },
      skip: 5,
      take: 10,
      orderBy: { title: "asc" },
    });
    expect(prisma.eventType.count).toHaveBeenCalledWith({ where: { teamId: 20 } });
  });

  it("builds child pagination filters and derives nextCursor", async () => {
    const rows = [
      { id: 1, userId: 1, owner: buildUser() },
      { id: 2, userId: 2, owner: buildUser({ id: 2 }) },
      { id: 3, userId: 3, owner: buildUser({ id: 3 }) },
    ];
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    prisma.eventType.count.mockResolvedValue(3);
    const result = await repository.listChildEventTypes({
      parentEventTypeId: 10,
      excludeUserId: 2,
      searchTerm: "ada",
      limit: 2,
      cursor: 4,
    });
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          parentId: 10,
          userId: { not: 2 },
          owner: {
            OR: [
              { name: { contains: "ada", mode: "insensitive" } },
              { email: { contains: "ada", mode: "insensitive" } },
            ],
          },
        },
        take: 3,
        skip: 1,
        cursor: { id: 4 },
        orderBy: { id: "asc" },
      })
    );
    expect(result).toEqual({
      totalCount: 3,
      items: rows.slice(0, 2),
      hasMore: true,
      nextCursor: 2,
    });

    prisma.eventType.findMany.mockResolvedValue(rows.slice(0, 1) as never);
    prisma.eventType.count.mockResolvedValue(1);
    await expect(repository.listChildEventTypes({ parentEventTypeId: 10, limit: 2 })).resolves.toMatchObject({
      totalCount: 1,
      hasMore: false,
      nextCursor: null,
    });
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentId: 10 },
        take: 3,
        orderBy: { id: "asc" },
      })
    );
  });

  it("finds child owners and returns direct parent/team ids", async () => {
    const rows = [{ id: 1, hidden: false, slug: "child", owner: buildUser() }];
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(repository.findChildrenByParentIdIncludeOwner(7)).resolves.toBe(rows);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith({
      where: { parentId: 7 },
      select: expect.objectContaining({ hidden: true, slug: true, owner: expect.anything() }),
    });

    const event = { id: 7, teamId: 20 };
    prisma.eventType.findUnique.mockResolvedValue(event as never);
    await expect(repository.findByIdWithTeamId({ id: 7 })).resolves.toBe(event);
    expect(prisma.eventType.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { id: true, teamId: true },
    });
  });
});

describe("getEventTypeList", () => {
  const user = {
    id: 1,
    organizationId: 10,
    isOwnerAdminOfParentTeam: false,
  };

  it("returns no events when no list selector is provided", async () => {
    await expect(
      repository.getEventTypeList({
        teamId: null,
        userId: null,
        isAll: false,
        user,
      })
    ).resolves.toEqual([]);
    expect(prisma.eventType.findMany).not.toHaveBeenCalled();
  });

  it("returns personal events when only a user filter is provided", async () => {
    const rows = [{ id: 4 }];
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(
      repository.getEventTypeList({
        teamId: null,
        userId: 1,
        isAll: false,
        user,
      })
    ).resolves.toBe(rows);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 1, teamId: null },
      })
    );
  });

  it("rejects a non-admin with no team membership when listing all events", async () => {
    prisma.membership.findFirst.mockResolvedValue(null);
    await expect(
      repository.getEventTypeList({
        teamId: null,
        userId: null,
        isAll: true,
        user: { ...user, organizationId: null, isOwnerAdminOfParentTeam: false },
      })
    ).rejects.toThrow("User is not part of a team/org");
    expect(prisma.eventType.findMany).not.toHaveBeenCalled();
  });

  it("returns all organization and child-team event types for an owner admin", async () => {
    const teams = [{ id: 11 }, { id: 12 }];
    const rows = [{ id: 1 }];
    prisma.team.findMany.mockResolvedValue(teams as never);
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(
      repository.getEventTypeList({
        teamId: null,
        userId: null,
        isAll: true,
        user: { ...user, isOwnerAdminOfParentTeam: true },
      })
    ).resolves.toBe(rows);
    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: { parentId: 10 },
      select: { id: true },
    });
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ teamId: { in: [10, 11, 12] } }, { userId: 1, teamId: null }],
        },
      })
    );
  });

  it("returns organization events for an owner admin with no child teams", async () => {
    const rows = [{ id: 3 }];
    prisma.team.findMany.mockResolvedValue([]);
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(
      repository.getEventTypeList({
        teamId: null,
        userId: null,
        isAll: true,
        user: { ...user, isOwnerAdminOfParentTeam: true },
      })
    ).resolves.toBe(rows);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ teamId: { in: [10] } }, { userId: 1, teamId: null }],
        },
      })
    );
  });

  it("lists team events for admins without a membership and filters member events", async () => {
    const rows = [{ id: 2 }];
    prisma.membership.findFirst.mockResolvedValue(null);
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await expect(
      repository.getEventTypeList({
        teamId: 20,
        userId: null,
        isAll: false,
        user: { ...user, isOwnerAdminOfParentTeam: true },
      })
    ).resolves.toBe(rows);
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: 20 } })
    );

    vi.clearAllMocks();
    prisma.membership.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    prisma.eventType.findMany.mockResolvedValue(rows as never);
    await repository.getEventTypeList({
      teamId: 20,
      userId: null,
      isAll: false,
      user,
    });
    expect(prisma.membership.findFirst).toHaveBeenCalledWith({
      where: { teamId: 20, userId: 1 },
    });
    expect(prisma.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId: 20, OR: [{ userId: 1 }, { users: { some: { id: 1 } } }] },
      })
    );
  });
});
