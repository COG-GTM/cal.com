import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEventTypeHosts,
  getProfileFromEvent,
  getPublicEvent,
  getPublicEventSelect,
  getUsersFromEvent,
  processEventDataShared,
} from "./getPublicEvent";

const mocks = vi.hoisted(() => ({
  findUsersByUsername: vi.fn(),
  enrichUsersWithTheirProfiles: vi.fn(),
  enrichUserWithItsProfile: vi.fn(),
  checkPermission: vi.fn(),
  getBookingFieldsWithSystemFields: vi.fn(),
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    findUsersByUsername = mocks.findUsersByUsername;
    enrichUsersWithTheirProfiles = mocks.enrichUsersWithTheirProfiles;
    enrichUserWithItsProfile = mocks.enrichUserWithItsProfile;
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

const prismaMock = {
  eventType: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
  team: { findFirst: vi.fn(), findFirstOrThrow: vi.fn() },
  schedule: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
} as unknown as PrismaClient;

const eventTypeFindFirst = vi.mocked(prismaMock.eventType.findFirst);
const eventTypeFindUniqueOrThrow = vi.mocked(prismaMock.eventType.findUniqueOrThrow);
const teamFindFirst = vi.mocked(prismaMock.team.findFirst);
const teamFindFirstOrThrow = vi.mocked(prismaMock.team.findFirstOrThrow);
const scheduleFindUnique = vi.mocked(prismaMock.schedule.findUnique);

const buildOwner = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  username: "alice",
  name: "Alice",
  avatarUrl: null,
  weekStart: "Monday",
  brandColor: "#111111",
  darkBrandColor: "#eeeeee",
  theme: "light",
  metadata: {},
  organization: null,
  defaultScheduleId: null,
  ...overrides,
});

const buildEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  title: "30 min",
  slug: "30min",
  description: "A **bold** event",
  length: 30,
  metadata: {},
  customInputs: [],
  locations: [{ type: "integrations:daily" }],
  recurringEvent: null,
  hosts: [],
  owner: buildOwner(),
  team: null,
  teamId: null,
  parent: null,
  schedule: null,
  instantMeetingSchedule: null,
  isInstantEvent: false,
  instantMeetingParameters: [],
  aiPhoneCallConfig: null,
  assignAllTeamMembers: false,
  disableCancelling: false,
  disableRescheduling: false,
  allowReschedulingCancelledBookings: false,
  interfaceLanguage: null,
  restrictionScheduleId: null,
  useBookerTimezone: false,
  ...overrides,
});

const withProfile = (user: Record<string, unknown>, organization: Record<string, unknown> | null = null) => ({
  ...user,
  profile: { id: 5, organizationId: organization ? 7 : null, organization },
});

describe("getPublicEventSelect", () => {
  it("limits the hosts to three unless all users are requested", () => {
    expect(getPublicEventSelect(false).hosts).toMatchObject({ take: 3 });
    expect(getPublicEventSelect(true).hosts).not.toHaveProperty("take");
  });
});

describe("getPublicEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getBookingFieldsWithSystemFields.mockReturnValue([{ name: "name", type: "name" }]);
    mocks.enrichUsersWithTheirProfiles.mockImplementation(async (users: Record<string, unknown>[]) =>
      users.map((user) => withProfile(user))
    );
    mocks.enrichUserWithItsProfile.mockImplementation(async ({ user }: { user: Record<string, unknown> }) =>
      withProfile(user)
    );
    eventTypeFindFirst.mockResolvedValue(null);
    mocks.checkPermission.mockResolvedValue(false);
  });

  it("returns null when no event type matches", async () => {
    expect(await getPublicEvent("alice", "30min", false, null, prismaMock, false)).toBeNull();
  });

  it("queries a personal event by username with no profiles when there is no org", async () => {
    eventTypeFindFirst.mockResolvedValueOnce(buildEvent());

    await getPublicEvent("alice", "30min", false, null, prismaMock, false);

    expect(eventTypeFindFirst.mock.calls[0][0].where).toMatchObject({
      slug: "30min",
      team: null,
      users: { some: { username: "alice", profiles: { none: {} } } },
    });
  });

  it("queries a team event scoped to the organization", async () => {
    eventTypeFindFirst.mockResolvedValueOnce(
      buildEvent({
        owner: null,
        teamId: 100,
        team: {
          slug: "team",
          name: "Team",
          parentId: null,
          parent: null,
          metadata: {},
          isPrivate: false,
          hideTeamProfileLink: false,
          brandColor: null,
          darkBrandColor: null,
          theme: null,
          logoUrl: null,
        },
        hosts: [{ user: buildOwner({ id: 2, username: "bob", name: "Bob" }) }],
      })
    );

    const event = await getPublicEvent("team", "30min", true, "acme", prismaMock, false);

    const where = eventTypeFindFirst.mock.calls[0][0].where;
    expect(where.team).toMatchObject({ OR: [{ slug: "team" }, expect.anything()] });
    expect(event?.subsetOfUsers.map((user) => user.username)).toEqual(["bob"]);
  });

  it("falls back to a platform organization lookup when the first query finds nothing", async () => {
    eventTypeFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(buildEvent());

    const event = await getPublicEvent("alice", "30min", false, null, prismaMock, false);

    expect(eventTypeFindFirst).toHaveBeenCalledTimes(2);
    expect(eventTypeFindFirst.mock.calls[1][0].where.users.some).toMatchObject({
      username: "alice",
      isPlatformManaged: false,
    });
    expect(event?.id).toBe(10);
  });

  it("renders the description as safe HTML and exposes the owner profile", async () => {
    eventTypeFindFirst.mockResolvedValueOnce(buildEvent());

    const event = await getPublicEvent("alice", "30min", false, null, prismaMock, false);

    expect(event?.description).toContain("<strong>bold</strong>");
    expect(event?.profile).toMatchObject({ username: "alice", name: "Alice", weekStart: "Monday" });
    expect(event?.isDynamic).toBe(false);
  });

  it("only returns the full users array when all users are requested", async () => {
    eventTypeFindFirst.mockResolvedValue(buildEvent());

    const subsetEvent = await getPublicEvent("alice", "30min", false, null, prismaMock, false);
    const fullEvent = await getPublicEvent("alice", "30min", false, null, prismaMock, false, undefined, true);

    expect(subsetEvent?.users).toBeUndefined();
    expect(fullEvent?.users).toHaveLength(1);
  });

  it("uses the owner's default schedule when the event has none", async () => {
    eventTypeFindFirst.mockResolvedValueOnce(
      buildEvent({ owner: buildOwner({ defaultScheduleId: 42 }), schedule: null })
    );
    scheduleFindUnique.mockResolvedValue({ id: 42, timeZone: "Europe/London" });

    const event = await getPublicEvent("alice", "30min", false, null, prismaMock, false);

    expect(scheduleFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42 } }));
    expect(event?.schedule).toMatchObject({ id: 42 });
  });

  it("resolves the instant meeting availability for instant events", async () => {
    eventTypeFindFirst.mockResolvedValueOnce(
      buildEvent({ isInstantEvent: true, instantMeetingSchedule: { id: 4, timeZone: "UTC" } })
    );
    vi.mocked(prismaMock.schedule.findUniqueOrThrow).mockResolvedValue({ availability: [] });

    const event = await getPublicEvent("alice", "30min", false, null, prismaMock, false);

    expect(event?.showInstantEventConnectNowModal).toBe(false);
  });

  it("hides the members of a private team from users without team.read", async () => {
    const teamEvent = buildEvent({
      owner: null,
      teamId: 100,
      team: {
        slug: "team",
        name: "Team",
        parentId: 200,
        parent: { slug: "acme", name: "Acme", logoUrl: null, bannerUrl: null },
        metadata: {},
        isPrivate: true,
        hideTeamProfileLink: false,
        brandColor: null,
        darkBrandColor: null,
        theme: null,
        logoUrl: null,
      },
      hosts: [{ user: buildOwner({ id: 2, username: "bob" }) }],
    });
    eventTypeFindFirst.mockResolvedValue(teamEvent);

    const hidden = await getPublicEvent("team", "30min", true, null, prismaMock, false, 3);
    expect(hidden?.subsetOfUsers).toEqual([]);
    expect(mocks.checkPermission).toHaveBeenCalledTimes(2);

    mocks.checkPermission.mockResolvedValue(true);
    const visible = await getPublicEvent("team", "30min", true, null, prismaMock, false, 3);
    expect(visible?.subsetOfUsers).toHaveLength(1);
  });

  it("adds organization details to the entity when an org slug is given", async () => {
    eventTypeFindFirst.mockResolvedValueOnce(buildEvent());
    teamFindFirst.mockResolvedValue({ logoUrl: "/logo.png", name: "Acme" });

    const event = await getPublicEvent("alice", "30min", false, "acme", prismaMock, false);

    expect(teamFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "acme", parentId: null } })
    );
    expect(event?.entity).toMatchObject({ orgSlug: "acme", name: "Acme" });
  });

  it("builds a dynamic group event for multiple usernames", async () => {
    mocks.findUsersByUsername.mockResolvedValue([
      withProfile(buildOwner({ id: 1, username: "alice" })),
      withProfile(buildOwner({ id: 2, username: "bob" })),
    ]);

    const event = await getPublicEvent("alice+bob", "dynamic", false, null, prismaMock, false);

    expect(mocks.findUsersByUsername).toHaveBeenCalledWith({ usernameList: ["alice", "bob"], orgSlug: null });
    expect(event?.isDynamic).toBe(true);
    expect(event?.subsetOfUsers).toHaveLength(2);
    expect(event?.users).toBeUndefined();
    expect(event?.entity.considerUnpublished).toBe(false);
  });

  it("uses the first user's preferred conferencing app as the dynamic event location", async () => {
    mocks.findUsersByUsername.mockResolvedValue([
      withProfile(
        buildOwner({
          id: 1,
          metadata: { defaultConferencingApp: { appSlug: "google-meet", appLink: "https://meet.example" } },
        })
      ),
      withProfile(buildOwner({ id: 2, username: "bob" })),
    ]);

    const event = await getPublicEvent("alice+bob", "dynamic", false, null, prismaMock, false);

    expect(event?.locations[0]).toMatchObject({ type: "integrations:google:meet" });
  });

  it("marks a dynamic group event as unpublished when a user belongs to an unpublished org", async () => {
    mocks.findUsersByUsername.mockResolvedValue([
      withProfile(buildOwner({ id: 1 }), { slug: null, name: "Acme" }),
      withProfile(buildOwner({ id: 2, username: "bob" })),
    ]);
    teamFindFirstOrThrow.mockResolvedValue({ logoUrl: null, name: "Acme" });

    const event = await getPublicEvent("alice+bob", "dynamic", false, "acme", prismaMock, false);

    expect(event?.entity).toMatchObject({ considerUnpublished: true, name: "Acme", orgSlug: "acme" });
    expect(event?.profile).toMatchObject({ username: "acme", name: "Acme" });
  });

  it("does not consider a dynamic group event unpublished when it came from a non org link redirect", async () => {
    mocks.findUsersByUsername.mockResolvedValue([
      withProfile(buildOwner({ id: 1 }), { slug: null, name: "Acme" }),
      withProfile(buildOwner({ id: 2, username: "bob" })),
    ]);

    const event = await getPublicEvent("alice+bob", "dynamic", false, null, prismaMock, true);

    expect(event?.entity.considerUnpublished).toBe(false);
  });
});

describe("getEventTypeHosts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.enrichUsersWithTheirProfiles.mockImplementation(async (users: Record<string, unknown>[]) =>
      users.map((user) => withProfile(user))
    );
  });

  it("returns only a subset of hosts by default", async () => {
    const result = await getEventTypeHosts({
      hosts: [{ user: buildOwner() }],
      prisma: prismaMock,
    });

    expect(result.subsetOfHosts[0].user.profile).toBeDefined();
    expect(result.hosts).toBeUndefined();
  });

  it("returns the full host list when all users are requested", async () => {
    const result = await getEventTypeHosts({
      hosts: [{ user: buildOwner() }],
      fetchAllUsers: true,
      prisma: prismaMock,
    });

    expect(result.hosts).toHaveLength(1);
  });
});

describe("getProfileFromEvent", () => {
  it("throws when the event has neither a team, hosts nor an owner", () => {
    expect(() =>
      getProfileFromEvent(buildEvent({ owner: null, subsetOfHosts: [], hosts: undefined }))
    ).toThrow("Event has no owner");
  });

  it("uses the owner profile for a personal event", () => {
    const profile = getProfileFromEvent(buildEvent({ subsetOfHosts: [] }));

    expect(profile).toMatchObject({
      username: "alice",
      name: "Alice",
      weekStart: "Monday",
      brandColor: "#111111",
    });
  });

  it("prefers the team profile and the team slug as the username", () => {
    const profile = getProfileFromEvent(
      buildEvent({
        owner: null,
        subsetOfHosts: [],
        team: {
          slug: "team",
          name: "Team",
          logoUrl: null,
          brandColor: "#222222",
          darkBrandColor: "#333333",
          theme: "dark",
          metadata: {},
          parentId: null,
          parent: null,
        },
      })
    );

    expect(profile).toMatchObject({ username: "team", name: "Team", brandColor: "#222222", theme: "dark" });
  });

  it("falls back to the parent event's team for styling of a managed child event", () => {
    const profile = getProfileFromEvent(
      buildEvent({
        subsetOfHosts: [],
        parent: { team: { theme: "dark", brandColor: "#444444", darkBrandColor: "#555555" } },
      })
    );

    expect(profile).toMatchObject({ username: "alice", brandColor: "#444444", theme: "dark" });
  });

  it("uses the first host for the week start when hosts exist", () => {
    const profile = getProfileFromEvent(
      buildEvent({
        subsetOfHosts: [{ user: buildOwner({ username: "bob", weekStart: "Sunday" }) }],
      })
    );

    expect(profile.weekStart).toBe("Sunday");
  });
});

describe("getUsersFromEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.enrichUsersWithTheirProfiles.mockImplementation(async (users: Record<string, unknown>[]) =>
      users.map((user) => withProfile(user))
    );
  });

  it("returns null for an event without a team and without an owner", async () => {
    expect(await getUsersFromEvent(buildEvent({ owner: null, subsetOfHosts: [] }), prismaMock)).toBeNull();
  });

  it("returns the owner with its booker url for a personal event", async () => {
    const users = await getUsersFromEvent(
      buildEvent({ owner: withProfile(buildOwner(), { id: 7, slug: "acme" }), subsetOfHosts: [] }),
      prismaMock
    );

    expect(users?.[0]).toMatchObject({ username: "alice", organizationId: 7 });
    expect(users?.[0].bookerUrl).toContain("acme");
  });

  it("maps team hosts and skips hosts without a username", async () => {
    const users = await getUsersFromEvent(
      buildEvent({
        team: { slug: "team" },
        subsetOfHosts: [
          { user: withProfile(buildOwner({ username: "bob" })) },
          { user: withProfile(buildOwner({ username: null })) },
        ],
      }),
      prismaMock
    );

    expect(users?.map((user) => user.username)).toEqual(["bob"]);
  });

  it("falls back to the users relation when a team event has no hosts", async () => {
    eventTypeFindUniqueOrThrow.mockResolvedValue({
      users: [{ id: 3, username: "carol", name: "Carol", weekStart: "Monday", avatarUrl: null }],
    });

    const users = await getUsersFromEvent(
      buildEvent({ team: { slug: "team" }, subsetOfHosts: [] }),
      prismaMock
    );

    expect(users?.map((user) => user.username)).toEqual(["carol"]);
  });

  it("returns an empty list when a team event has neither hosts nor users", async () => {
    eventTypeFindUniqueOrThrow.mockResolvedValue({ users: [] });

    expect(
      await getUsersFromEvent(buildEvent({ team: { slug: "team" }, subsetOfHosts: [] }), prismaMock)
    ).toEqual([]);
  });
});

describe("processEventDataShared", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getBookingFieldsWithSystemFields.mockReturnValue([{ name: "name", type: "name" }]);
  });

  it("parses the shared event fields", async () => {
    const result = await processEventDataShared({
      eventData: buildEvent(),
      metadata: {},
      prisma: prismaMock,
    });

    expect(result.description).toContain("<strong>bold</strong>");
    expect(result.isDynamic).toBe(false);
    expect(result.recurringEvent).toBeNull();
    expect(result.showInstantEventConnectNowModal).toBe(false);
    expect(result.locations).toEqual([{ type: "integrations:daily" }]);
  });

  it("parses a recurring event when one is set", async () => {
    const result = await processEventDataShared({
      eventData: buildEvent({ recurringEvent: { freq: 2, count: 3, interval: 1 } }),
      metadata: {},
      prisma: prismaMock,
    });

    expect(result.recurringEvent).toMatchObject({ count: 3, interval: 1 });
  });

  it("checks the instant meeting schedule for instant events", async () => {
    vi.mocked(prismaMock.schedule.findUniqueOrThrow).mockResolvedValue({ availability: [] });

    const result = await processEventDataShared({
      eventData: buildEvent({ isInstantEvent: true, instantMeetingSchedule: { id: 4, timeZone: null } }),
      metadata: {},
      prisma: prismaMock,
    });

    expect(prismaMock.schedule.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 4 } })
    );
    expect(result.showInstantEventConnectNowModal).toBe(false);
  });
});
