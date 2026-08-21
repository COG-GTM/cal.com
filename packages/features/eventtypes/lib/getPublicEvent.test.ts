import type { PrismaClient } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";

type MockState = {
  enrichUsersWithTheirProfiles: ReturnType<typeof vi.fn>;
  enrichUserWithItsProfile: ReturnType<typeof vi.fn>;
  findUsersByUsername: ReturnType<typeof vi.fn>;
  checkPermission: ReturnType<typeof vi.fn>;
  getBookingFieldsWithSystemFields: ReturnType<typeof vi.fn>;
  getAppFromSlug: ReturnType<typeof vi.fn>;
};

const mocks: MockState = vi.hoisted(
  (): MockState => ({
    enrichUsersWithTheirProfiles: vi.fn(),
    enrichUserWithItsProfile: vi.fn(),
    findUsersByUsername: vi.fn(),
    checkPermission: vi.fn(),
    getBookingFieldsWithSystemFields: vi.fn(() => ({ systemField: true })),
    getAppFromSlug: vi.fn(),
  })
);

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    enrichUsersWithTheirProfiles = mocks.enrichUsersWithTheirProfiles;
    enrichUserWithItsProfile = mocks.enrichUserWithItsProfile;
    findUsersByUsername = mocks.findUsersByUsername;
  },
}));

vi.mock("@calcom/features/pbac/services/permission-check.service", () => ({
  PermissionCheckService: class {
    checkPermission = mocks.checkPermission;
  },
}));

vi.mock("@calcom/features/bookings/lib/getBookingFields", () => ({
  getBookingFieldsWithSystemFields: mocks.getBookingFieldsWithSystemFields,
}));

vi.mock("@calcom/app-store/utils", () => ({
  getAppFromSlug: mocks.getAppFromSlug,
}));

import {
  getEventTypeHosts,
  getProfileFromEvent,
  getPublicEvent,
  getPublicEventSelect,
  getUsersFromEvent,
  processEventDataShared,
} from "./getPublicEvent";

type PublicEvent = Prisma.EventTypeGetPayload<{
  select: ReturnType<typeof getPublicEventSelect>;
}>;
type PublicUser = NonNullable<PublicEvent["owner"]>;

const buildUser = (overrides: Record<string, unknown> = {}): PublicUser =>
  ({
    id: 1,
    avatarUrl: "https://example.com/avatar.png",
    username: "alice",
    name: "Alice Example",
    weekStart: "Monday",
    brandColor: "#111111",
    darkBrandColor: "#222222",
    theme: null,
    metadata: {},
    defaultScheduleId: null,
    profile: {
      organizationId: null,
      organization: null,
    },
    ...overrides,
  }) as PublicUser;

const buildEvent = (overrides: Record<string, unknown> = {}): PublicEvent =>
  ({
    id: 10,
    title: "Demo event",
    description: "A **demo** event",
    interfaceLanguage: "en",
    eventName: null,
    slug: "demo",
    isInstantEvent: false,
    instantMeetingParameters: [],
    instantMeetingSchedule: null,
    aiPhoneCallConfig: null,
    schedulingType: null,
    length: 30,
    locations: [],
    enablePerHostLocations: false,
    customInputs: [],
    disableGuests: false,
    metadata: {},
    lockTimeZoneToggleOnBookingPage: false,
    lockedTimeZone: null,
    requiresConfirmation: false,
    autoTranslateDescriptionEnabled: false,
    fieldTranslations: [],
    restrictionScheduleId: null,
    useBookerTimezone: false,
    recurringEvent: null,
    schedule: null,
    owner: buildUser(),
    hosts: [],
    users: [],
    team: null,
    parent: null,
    teamId: null,
    assignAllTeamMembers: false,
    disableCancelling: false,
    disableRescheduling: false,
    allowReschedulingCancelledBookings: false,
    ...overrides,
  }) as PublicEvent;

const host = (
  user: PublicUser,
  overrides: Record<string, unknown> = {}
): { user: PublicUser } & Record<string, unknown> => ({
  user,
  ...overrides,
});

const basePrisma = (): DeepMockProxy<PrismaClient> => mockDeep<PrismaClient>();

describe("getPublicEventSelect", () => {
  it("limits host selection only when fetching a subset", () => {
    expect(getPublicEventSelect(false).hosts).toMatchObject({ take: 3 });
    expect(getPublicEventSelect(true).hosts).not.toHaveProperty("take");
  });
});

describe("getPublicEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enrichUsersWithTheirProfiles.mockImplementation(async (users: PublicUser[]) => users);
    mocks.enrichUserWithItsProfile.mockImplementation(async ({ user }: { user: PublicUser }) => user);
    mocks.findUsersByUsername.mockResolvedValue([]);
    mocks.checkPermission.mockResolvedValue(false);
    mocks.getBookingFieldsWithSystemFields.mockReturnValue({ systemField: true });
    mocks.getAppFromSlug.mockReturnValue(undefined);
  });

  it("assembles a dynamic group event and strips user metadata", async () => {
    const users = [
      buildUser({
        id: 1,
        username: "alice",
        metadata: {
          defaultBookerLayouts: {
            enabledLayouts: ["week_view"],
            defaultLayout: "week_view",
          },
        },
        profile: { organizationId: 1, organization: { id: 1, slug: "org", name: "Org" } },
      }),
      buildUser({
        id: 2,
        username: "bob",
        metadata: {},
        profile: { organizationId: null, organization: { id: 2, slug: null, name: "Pending" } },
      }),
    ];
    mocks.findUsersByUsername.mockResolvedValue(users);

    const result = await getPublicEvent(
      "alice+bob",
      "dynamic",
      undefined,
      null,
      basePrisma(),
      false,
      undefined,
      true
    );

    expect(result).toMatchObject({
      isDynamic: true,
      subsetOfUsers: [
        { username: "alice", metadata: undefined },
        { username: "bob", metadata: undefined },
      ],
      users: [{ username: "alice" }, { username: "bob" }],
      profile: { bookerLayouts: users[0].metadata.defaultBookerLayouts },
      entity: { considerUnpublished: true, teamSlug: null },
    });
    expect(result?.locations).toEqual([{ type: "integrations:daily" }]);
    expect(mocks.findUsersByUsername).toHaveBeenCalledWith({
      usernameList: ["alice", "bob"],
      orgSlug: null,
    });
  });

  it("uses the preferred conferencing app and organization profile for dynamic groups", async () => {
    const users = [
      buildUser({
        metadata: { defaultConferencingApp: { appSlug: "custom", appLink: "https://custom.test" } },
        profile: { organizationId: 1, organization: { id: 1, slug: "org", name: "Org" } },
      }),
      buildUser({ profile: { organizationId: 1, organization: { id: 1, slug: "org", name: "Org" } } }),
    ];
    const prisma = basePrisma();
    mocks.findUsersByUsername.mockResolvedValue(users);
    mocks.getAppFromSlug.mockReturnValue({ appData: { location: { type: "custom_video" } } });
    prisma.team.findFirstOrThrow.mockResolvedValue({ logoUrl: "logo", name: "Organization" } as never);

    const result = await getPublicEvent("alice+bob", "dynamic", undefined, "org", prisma, false);

    expect(result?.locations).toEqual([{ type: "custom_video", link: "https://custom.test" }]);
    expect(result?.profile).toMatchObject({ name: "Organization", username: "org" });
    expect(prisma.team.findFirstOrThrow).toHaveBeenCalledWith({
      where: { slug: "org" },
      select: { logoUrl: true, name: true },
    });
  });

  it("does not expose all dynamic users when fetchAllUsers is false", async () => {
    mocks.findUsersByUsername.mockResolvedValue([buildUser(), buildUser({ id: 2, username: "bob" })]);

    const result = await getPublicEvent("alice+bob", "unknown", undefined, null, basePrisma(), true);

    expect(result?.users).toBeUndefined();
    expect(result?.subsetOfUsers).toHaveLength(2);
    expect(result?.entity.considerUnpublished).toBe(false);
  });

  it("keeps the default location when a preferred app cannot be resolved", async () => {
    mocks.findUsersByUsername.mockResolvedValue([
      buildUser({ metadata: { defaultConferencingApp: { appSlug: "missing-app" } } }),
      buildUser({ id: 2, username: "bob" }),
    ]);

    const result = await getPublicEvent("alice+bob", "dynamic", undefined, null, basePrisma(), false);

    expect(result?.locations).toEqual([{ type: "integrations:daily" }]);
    expect(mocks.getAppFromSlug).toHaveBeenCalledWith("missing-app");
  });

  it("builds the single-user organization and non-organization queries", async () => {
    const prisma = basePrisma();
    const event = buildEvent();
    prisma.eventType.findFirst.mockResolvedValue(event as never);

    await getPublicEvent("alice", "demo", false, "Acme Org", prisma, false);
    expect(prisma.eventType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slug: "demo",
          users: {
            some: {
              profiles: {
                some: {
                  organization: {
                    OR: [{ slug: "acme-org" }, { metadata: { path: ["requestedSlug"], equals: "acme-org" } }],
                  },
                  username: "alice",
                },
              },
            },
          },
          team: null,
        },
      })
    );

    prisma.eventType.findFirst.mockReset();
    prisma.eventType.findFirst.mockResolvedValue(event as never);
    await getPublicEvent("alice", "demo", undefined, null, prisma, false);
    expect(prisma.eventType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slug: "demo",
          users: { some: { username: "alice", profiles: { none: {} } } },
          team: null,
        },
      })
    );
  });

  it("tries the platform-managed organization fallback only without an org query", async () => {
    const prisma = basePrisma();
    prisma.eventType.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(getPublicEvent("alice", "demo", undefined, null, prisma, false)).resolves.toBeNull();
    expect(prisma.eventType.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.eventType.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          slug: "demo",
          users: {
            some: {
              username: "alice",
              isPlatformManaged: false,
              profiles: { some: { organization: { isPlatform: true } } },
            },
          },
        },
      })
    );

    prisma.eventType.findFirst.mockReset();
    prisma.eventType.findFirst.mockResolvedValue(null);
    await expect(getPublicEvent("alice", "demo", undefined, "org", prisma, false)).resolves.toBeNull();
    expect(prisma.eventType.findFirst).toHaveBeenCalledTimes(1);
  });

  it("throws when neither an owner nor a users-array owner exists", async () => {
    const prisma = basePrisma();
    prisma.eventType.findFirst.mockResolvedValue(buildEvent({ owner: null }) as never);
    prisma.eventType.findUniqueOrThrow.mockResolvedValue({ users: [] } as never);

    await expect(getPublicEvent("alice", "demo", undefined, null, prisma, false)).rejects.toThrow(
      "EventType 10 has no owner or users."
    );
  });

  it("assembles team entity data and uses requestedSlug when the team slug is null", async () => {
    const owner = buildUser({
      profile: { organizationId: 4, organization: { id: 4, slug: "owner-org", name: "Owner org" } },
    });
    const team = {
      id: 5,
      name: "Team name",
      slug: null,
      metadata: { requestedSlug: "requested-team" },
      parentId: 9,
      parent: {
        name: "Parent org",
        slug: "parent-org",
        brandColor: "#parent",
        darkBrandColor: "#dark",
        theme: "light",
      },
      isPrivate: false,
      hideTeamProfileLink: true,
      brandColor: "#team",
      darkBrandColor: "#team-dark",
      theme: null,
    };
    const teamHost = buildUser({ username: "host" });
    const event = buildEvent({
      owner,
      hosts: [host(teamHost)],
      team,
      teamId: 5,
    });
    const prisma = basePrisma();
    prisma.eventType.findFirst.mockResolvedValue(event as never);

    const result = await getPublicEvent("requested-team", "demo", true, null, prisma, false);

    expect(result?.entity).toMatchObject({
      teamSlug: "requested-team",
      name: "Owner org",
      hideProfileLink: true,
      considerUnpublished: true,
    });
    expect(result?.profile).toMatchObject({ username: null, name: "Team name", weekStart: "Monday" });
    expect(prisma.eventType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slug: "demo",
          team: {
            OR: [
              { slug: "requested-team" },
              { metadata: { path: ["requestedSlug"], equals: "requested-team" } },
            ],
            parent: null,
          },
        },
      })
    );
  });

  it("checks private team permissions and hides members when access is denied", async () => {
    const team = {
      id: 5,
      name: "Private team",
      slug: "private",
      metadata: {},
      parentId: 9,
      parent: null,
      isPrivate: true,
      hideTeamProfileLink: false,
      brandColor: null,
      darkBrandColor: null,
      theme: null,
    };
    const event = buildEvent({
      team,
      teamId: 5,
      hosts: [host(buildUser({ username: "host" }))],
    });
    const prisma = basePrisma();
    prisma.eventType.findFirst.mockResolvedValue(event as never);
    mocks.checkPermission.mockResolvedValue(false);

    const denied = await getPublicEvent("private", "demo", true, null, prisma, false, 7);
    expect(denied?.subsetOfUsers).toEqual([]);
    expect(mocks.checkPermission).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, teamId: 5, permission: "team.read" })
    );

    mocks.checkPermission.mockReset();
    mocks.checkPermission.mockResolvedValue(true);
    const granted = await getPublicEvent("private", "demo", true, null, prisma, false, 7);
    expect(granted?.subsetOfUsers).toHaveLength(1);

    mocks.checkPermission.mockReset();
    await getPublicEvent("private", "demo", true, null, prisma, false);
    expect(mocks.checkPermission).not.toHaveBeenCalled();
  });

  it("checks the parent organization when private team permission is denied", async () => {
    const event = buildEvent({
      teamId: 5,
      team: {
        id: 5,
        name: "Team",
        slug: "team",
        metadata: {},
        parentId: 9,
        parent: null,
        isPrivate: true,
        hideTeamProfileLink: false,
        brandColor: null,
        darkBrandColor: null,
        theme: null,
      },
      hosts: [host(buildUser({ username: "host" }))],
    });
    const prisma = basePrisma();
    prisma.eventType.findFirst.mockResolvedValue(event as never);
    mocks.checkPermission.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const result = await getPublicEvent("team", "demo", true, null, prisma, false, 7);

    expect(result?.subsetOfUsers).toHaveLength(1);
    expect(mocks.checkPermission).toHaveBeenNthCalledWith(2, expect.objectContaining({ teamId: 9 }));
  });

  it("falls back to the owner's schedule and exposes event passthrough fields", async () => {
    const owner = buildUser({ defaultScheduleId: 12 });
    const event = buildEvent({
      owner,
      schedule: null,
      assignAllTeamMembers: true,
      disableCancelling: true,
      disableRescheduling: true,
      allowReschedulingCancelledBookings: true,
      interfaceLanguage: "de",
      restrictionScheduleId: 44,
      useBookerTimezone: true,
      customInputs: [
        {
          id: 1,
          eventTypeId: 10,
          type: "TEXT",
          label: "Company",
          required: false,
          placeholder: "",
        },
      ],
      locations: [{ type: "daily", link: "https://daily.test" }],
    });
    const prisma = basePrisma();
    prisma.eventType.findFirst.mockResolvedValue(event as never);
    prisma.schedule.findUnique.mockResolvedValue({ id: 12, timeZone: "UTC" } as never);

    const result = await getPublicEvent("alice", "demo", undefined, null, prisma, false);

    expect(prisma.schedule.findUnique).toHaveBeenCalledWith({
      where: { id: 12 },
      select: { id: true, timeZone: true },
    });
    expect(result).toMatchObject({
      assignAllTeamMembers: true,
      disableCancelling: true,
      disableRescheduling: true,
      allowReschedulingCancelledBookings: true,
      interfaceLanguage: "de",
      restrictionScheduleId: 44,
      useBookerTimezone: true,
      customInputs: [
        {
          id: 1,
          eventTypeId: 10,
          type: "TEXT",
          label: "Company",
          required: false,
          placeholder: "",
        },
      ],
      locations: [{ type: "daily", link: "https://daily.test" }],
      description: expect.stringContaining("<strong>demo</strong>"),
    });
  });

  it("uses organization details for the entity when an organization is requested", async () => {
    const prisma = basePrisma();
    prisma.eventType.findFirst.mockResolvedValue(
      buildEvent({
        owner: buildUser({
          profile: { organizationId: 1, organization: { id: 1, slug: "org", name: "Owner org" } },
        }),
      }) as never
    );
    prisma.team.findFirst.mockResolvedValue({ logoUrl: "org-logo", name: "Requested org" } as never);

    const result = await getPublicEvent("alice", "demo", undefined, "org", prisma, false);

    expect(result?.entity).toMatchObject({ name: "Requested org" });
    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: { slug: "org", parentId: null },
      select: { logoUrl: true, name: true },
    });
  });

  it("handles missing metadata and exposes all fetched hosts", async () => {
    const firstHost = buildUser({ username: "host", metadata: null });
    const event = buildEvent({
      owner: buildUser({ metadata: null, profile: { organizationId: null, organization: null } }),
      hosts: [host(firstHost)],
      metadata: null,
      customInputs: null,
      locations: null,
    });
    const prisma = basePrisma();
    prisma.eventType.findFirst.mockResolvedValue(event as never);

    const result = await getPublicEvent("host", "demo", undefined, null, prisma, false, undefined, true);

    expect(result).toMatchObject({
      hosts: [{ user: { username: "host" } }],
      users: [{ username: "alice" }],
      metadata: {},
      customInputs: [],
      locations: [],
    });
  });

  it("computes instant availability and falls back to Europe/London", async () => {
    const event = buildEvent({
      isInstantEvent: true,
      instantMeetingSchedule: { id: 8, timeZone: null },
    });
    const prisma = basePrisma();
    prisma.eventType.findFirst.mockResolvedValue(event as never);
    prisma.schedule.findUniqueOrThrow.mockResolvedValue({
      availability: [
        {
          date: null,
          days: [0, 1, 2, 3, 4, 5, 6],
          startTime: new Date("1970-01-01T00:00:00Z"),
          endTime: new Date("1970-01-01T23:59:59Z"),
        },
      ],
    } as never);

    const available = await getPublicEvent("alice", "demo", undefined, null, prisma, false);
    expect(available?.showInstantEventConnectNowModal).toBe(true);
    expect(prisma.schedule.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 8 },
      select: { availability: true },
    });

    prisma.schedule.findUniqueOrThrow.mockResolvedValue({ availability: [] } as never);
    const unavailable = await getPublicEvent("alice", "demo", undefined, null, prisma, false);
    expect(unavailable?.showInstantEventConnectNowModal).toBe(false);
  });
});

describe("getEventTypeHosts", () => {
  it("returns enriched hosts and only exposes all hosts when requested", async () => {
    const prisma = basePrisma();
    const users = [buildUser({ username: "first" }), buildUser({ id: 2, username: "second" })];
    mocks.enrichUsersWithTheirProfiles.mockResolvedValue(users);
    const input = [host(users[0]), host(users[1])];

    const subset = await getEventTypeHosts({ hosts: input as never, prisma });
    expect(subset.subsetOfHosts.map(({ user }) => user.username)).toEqual(["first", "second"]);
    expect(subset.hosts).toBeUndefined();

    const all = await getEventTypeHosts({ hosts: input as never, fetchAllUsers: true, prisma });
    expect(all.hosts?.map(({ user }) => user.username)).toEqual(["first", "second"]);
  });
});

describe("getUsersFromEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enrichUsersWithTheirProfiles.mockImplementation(async (users: PublicUser[]) => users);
  });

  it("uses hosts, filters hosts without usernames, and falls back to subset hosts", async () => {
    const users = [buildUser({ username: "host" }), buildUser({ id: 2, username: null })];
    const event = buildEvent({
      team: { id: 1, name: "Team", slug: "team", metadata: {}, parentId: null, parent: null },
      hosts: [host(users[0]), host(users[1])],
      teamId: 1,
    });

    const usersFromHosts = await getUsersFromEvent(
      { ...event, owner: null, subsetOfHosts: event.hosts } as never,
      basePrisma()
    );
    expect(usersFromHosts).toHaveLength(1);
    expect(usersFromHosts?.[0].username).toBe("host");

    const fromSubset = await getUsersFromEvent(
      { ...event, owner: null, hosts: [], subsetOfHosts: [host(users[0])] } as never,
      basePrisma()
    );
    expect(fromSubset).toHaveLength(1);
  });

  it("uses the users-array owner fallback for team events without hosts", async () => {
    const prisma = basePrisma();
    prisma.eventType.findUniqueOrThrow.mockResolvedValue({
      users: [{ id: 1, username: "owner", name: "Owner", weekStart: "Monday", avatarUrl: null }],
    } as never);
    mocks.enrichUsersWithTheirProfiles.mockResolvedValue([
      buildUser({ username: "owner", profile: { organizationId: 2, organization: { slug: "org", id: 2 } } }),
    ]);
    const event = buildEvent({
      team: { id: 1, name: "Team", slug: "team", metadata: {}, parentId: null, parent: null },
      teamId: 1,
      hosts: [],
    });

    const result = await getUsersFromEvent({ ...event, owner: null, subsetOfHosts: [] } as never, prisma);

    expect(result?.[0]).toMatchObject({ username: "owner", organizationId: 2 });
  });

  it("derives a non-team owner and returns null without one", async () => {
    const owner = buildUser({
      username: "alice",
      profile: { organizationId: 3, organization: { id: 3, slug: "org" } },
    });
    const event = buildEvent({ owner });
    const result = await getUsersFromEvent({ ...event, subsetOfHosts: [] } as never, basePrisma());
    expect(result?.[0]).toMatchObject({ username: "alice", organizationId: 3 });

    await expect(
      getUsersFromEvent({ ...event, owner: null, subsetOfHosts: [] } as never, basePrisma())
    ).resolves.toBeNull();
  });
});

describe("getProfileFromEvent", () => {
  it("uses parent branding and event booker layouts", () => {
    const event = buildEvent({
      metadata: {
        bookerLayouts: {
          enabledLayouts: ["week_view"],
          defaultLayout: "week_view",
        },
      },
      parent: {
        team: { brandColor: "#parent", darkBrandColor: "#parent-dark", theme: "dark" },
      },
    });

    expect(getProfileFromEvent({ ...event, subsetOfHosts: [] } as never)).toMatchObject({
      username: "alice",
      name: "Alice Example",
      brandColor: "#parent",
      darkBrandColor: "#parent-dark",
      theme: "dark",
      bookerLayouts: event.metadata.bookerLayouts,
    });
  });

  it("prefers the first host, then owner, and defaults weekStart", () => {
    const hostUser = buildUser({ username: "host", weekStart: null });
    const owner = buildUser({ username: "owner", weekStart: null });
    const event = buildEvent({ owner, hosts: [host(hostUser)], metadata: {} });

    expect(getProfileFromEvent({ ...event, subsetOfHosts: event.hosts } as never)).toMatchObject({
      username: "host",
      weekStart: "Monday",
    });
    expect(getProfileFromEvent({ ...event, hosts: [], subsetOfHosts: [] } as never)).toMatchObject({
      username: "owner",
    });
    expect(() =>
      getProfileFromEvent({ ...event, owner: null, hosts: [], subsetOfHosts: [] } as never)
    ).toThrow("Event has no owner");
  });
});

describe("processEventDataShared", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBookingFieldsWithSystemFields.mockReturnValue({ systemField: true });
  });

  it("parses and sanitizes ordinary event data", async () => {
    const event = buildEvent();
    const result = await processEventDataShared({
      eventData: event,
      metadata: {},
      prisma: basePrisma(),
    });

    expect(result).toMatchObject({
      description: expect.stringContaining("<strong>demo</strong>"),
      metadata: {},
      recurringEvent: null,
      isDynamic: false,
      showInstantEventConnectNowModal: false,
    });
  });

  it("parses recurring event data and preserves an existing schedule", async () => {
    const prisma = basePrisma();
    const schedule = { id: 3, timeZone: "UTC" };
    prisma.eventType.findFirst.mockResolvedValue(
      buildEvent({
        schedule,
        owner: buildUser({ defaultScheduleId: 12 }),
        recurringEvent: { freq: 2, count: 5, interval: 1 },
      }) as never
    );

    const result = await processEventDataShared({
      eventData: buildEvent({
        schedule,
        recurringEvent: { freq: 2, count: 5, interval: 1 },
      }),
      metadata: {},
      prisma,
    });

    expect(result.recurringEvent).toEqual({ freq: 2, count: 5, interval: 1 });
    expect(prisma.schedule.findUnique).not.toHaveBeenCalled();
  });

  it("uses instant schedule availability when processing instant events", async () => {
    const prisma = basePrisma();
    prisma.schedule.findUniqueOrThrow.mockResolvedValue({
      availability: [],
    } as never);
    const result = await processEventDataShared({
      eventData: buildEvent({
        isInstantEvent: true,
        instantMeetingSchedule: { id: 3, timeZone: null },
      }),
      metadata: {},
      prisma,
    });

    expect(result.showInstantEventConnectNowModal).toBe(false);
  });
});
