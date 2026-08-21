import { MembershipRole, SchedulingType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareMembership, getEventTypesByViewer } from "./getEventTypesByViewer";

type ViewerMocks = {
  findProfile: ReturnType<typeof vi.fn>;
  findMemberships: ReturnType<typeof vi.fn>;
  findAllByUpId: ReturnType<typeof vi.fn>;
  getTeamIdsWithPermission: ReturnType<typeof vi.fn>;
  enrichUsersWithTheirProfiles: ReturnType<typeof vi.fn>;
  getBookerBaseUrl: ReturnType<typeof vi.fn>;
  getBookerBaseUrlSync: ReturnType<typeof vi.fn>;
};

const mocks: ViewerMocks = vi.hoisted(() => ({
  findProfile: vi.fn(),
  findMemberships: vi.fn(),
  findAllByUpId: vi.fn(),
  getTeamIdsWithPermission: vi.fn(),
  enrichUsersWithTheirProfiles: vi.fn(),
  getBookerBaseUrl: vi.fn(),
  getBookerBaseUrlSync: vi.fn(),
}));

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: {
    findByUpIdWithAuth: mocks.findProfile,
  },
}));

vi.mock("@calcom/features/membership/repositories/MembershipRepository", () => ({
  MembershipRepository: {
    findAllByUpIdIncludeTeamWithMembersAndEventTypes: mocks.findMemberships,
  },
}));

vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: class {
    findAllByUpId = mocks.findAllByUpId;
  },
}));

vi.mock("@calcom/features/pbac/services/permission-check.service", () => ({
  PermissionCheckService: class {
    getTeamIdsWithPermission = mocks.getTeamIdsWithPermission;
  },
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    enrichUsersWithTheirProfiles = mocks.enrichUsersWithTheirProfiles;
  },
}));

vi.mock("@calcom/features/ee/organizations/lib/getBookerUrlServer", () => ({
  getBookerBaseUrl: mocks.getBookerBaseUrl,
}));

vi.mock("@calcom/features/ee/organizations/lib/getBookerBaseUrlSync", () => ({
  getBookerBaseUrlSync: mocks.getBookerBaseUrlSync,
}));

const user = {
  id: 1,
  profile: {
    upId: "prof-ada",
  },
};

const buildEvent = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 10,
  title: "Meeting",
  slug: "meeting",
  userId: 1,
  teamId: null,
  parentId: null,
  position: 1,
  schedulingType: null,
  description: "## Hello",
  metadata: {},
  users: [
    {
      id: 1,
      name: "Ada",
      username: "ada",
      avatarUrl: null,
    },
  ],
  hosts: [],
  children: [],
  ...overrides,
});

const buildProfile = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 101,
  upId: "prof-ada",
  userId: 1,
  organizationId: 50,
  username: "ada",
  name: "Ada Lovelace",
  avatarUrl: null,
  organization: {
    organizationSettings: {
      lockEventTypeCreationForUsers: true,
    },
  },
  ...overrides,
});

const buildMembership = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  role: MembershipRole.MEMBER,
  team: {
    id: 20,
    name: "Acme Team",
    slug: "acme-team",
    logoUrl: null,
    metadata: {},
    isOrganization: false,
    parentId: null,
    parent: null,
    members: [{ id: 1 }],
    eventTypes: [buildEvent({ teamId: 20, userId: null, schedulingType: SchedulingType.MANAGED })],
  },
  ...overrides,
});

const configureDefaults = (): void => {
  mocks.findProfile.mockResolvedValue(buildProfile());
  mocks.findMemberships.mockResolvedValue([]);
  mocks.findAllByUpId.mockResolvedValue([]);
  mocks.getTeamIdsWithPermission.mockResolvedValue([]);
  mocks.enrichUsersWithTheirProfiles.mockImplementation((users) => users);
  mocks.getBookerBaseUrl.mockResolvedValue("https://booker.example.com");
  mocks.getBookerBaseUrlSync.mockReturnValue("https://booker.example.com");
};

describe("compareMembership", () => {
  it.each([
    [MembershipRole.OWNER, MembershipRole.ADMIN, true],
    [MembershipRole.OWNER, MembershipRole.MEMBER, true],
    [MembershipRole.ADMIN, MembershipRole.MEMBER, true],
    [MembershipRole.ADMIN, MembershipRole.OWNER, false],
    [MembershipRole.MEMBER, MembershipRole.OWNER, false],
    [MembershipRole.MEMBER, MembershipRole.ADMIN, false],
    [MembershipRole.ADMIN, MembershipRole.ADMIN, false],
    [MembershipRole.OWNER, MembershipRole.OWNER, false],
    [MembershipRole.MEMBER, MembershipRole.MEMBER, false],
  ])("compares %s and %s", (first, second, expected) => {
    expect(compareMembership(first, second)).toBe(expected);
  });
});

describe("getEventTypesByViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureDefaults();
  });

  it("throws a coded error when the profile is missing", async () => {
    mocks.findProfile.mockResolvedValue(null);

    await expect(getEventTypesByViewer(user)).rejects.toMatchObject({
      message: "Profile not found",
      code: "internal_server_error",
    });
  });

  it("builds a personal group and excludes managed event types", async () => {
    const unmanaged = buildEvent({ id: 2, position: 3, schedulingType: null, description: null });
    const lower = buildEvent({ id: 1, position: 3, schedulingType: SchedulingType.ROUND_ROBIN });
    const managed = buildEvent({ id: 3, schedulingType: SchedulingType.MANAGED });
    mocks.findAllByUpId.mockResolvedValue([unmanaged, lower, managed]);
    mocks.getBookerBaseUrl.mockResolvedValue("https://personal.example.com");

    const result = await getEventTypesByViewer(user);
    const group = result.eventTypeGroups[0];

    expect(group).toMatchObject({
      teamId: null,
      bookerUrl: "https://personal.example.com",
      profile: {
        slug: "ada",
        name: "Ada Lovelace",
        eventTypesLockedByOrg: true,
      },
      metadata: { membershipCount: 1, readOnly: false },
    });
    expect(group.eventTypes.map((eventType) => eventType.id)).toEqual([1, 2]);
    expect(group.eventTypes[0]).not.toHaveProperty("users");
    expect(group.eventTypes[0].userIds).toEqual([1]);
    expect(result.allUsersAcrossAllEventTypes.get(1)).toMatchObject({ id: 1 });
    expect(group.eventTypes[0].safeDescription).toContain("<h2");
    expect(group.eventTypes[1].safeDescription).toBeUndefined();
  });

  it("keeps personal events when upId filters exclude the viewer, but skips them for team-only filters", async () => {
    mocks.findAllByUpId.mockResolvedValue([buildEvent()]);

    const excluded = await getEventTypesByViewer(user, { upIds: ["prof-other"] });
    expect(excluded.eventTypeGroups.some((group) => group.teamId === null)).toBe(true);
    expect(mocks.findAllByUpId).toHaveBeenCalled();

    vi.clearAllMocks();
    configureDefaults();
    const teamOnly = await getEventTypesByViewer(user, { teamIds: [20] });
    expect(teamOnly.eventTypeGroups.some((group) => group.teamId === null)).toBe(false);
    expect(mocks.findAllByUpId).not.toHaveBeenCalled();
  });

  it("filters child events to the requesting user and filters unknown child users", async () => {
    const childForViewer = buildEvent({
      id: 2,
      parentId: 10,
      users: [{ id: 1, name: "Ada", username: "ada", avatarUrl: null }],
      children: [
        {
          id: 20,
          users: [
            { id: 1, name: "Ada", username: "ada", avatarUrl: null },
            { id: 99, name: "Unknown", username: "unknown", avatarUrl: null },
          ],
        },
      ],
    });
    const childForOther = buildEvent({
      id: 3,
      parentId: 10,
      users: [{ id: 2, name: "Grace", username: "grace", avatarUrl: null }],
    });
    mocks.findAllByUpId.mockResolvedValue([childForViewer, childForOther]);
    mocks.enrichUsersWithTheirProfiles.mockImplementation((users) =>
      users.filter((candidate: { id: number }) => candidate.id !== 99)
    );

    const result = await getEventTypesByViewer(user);

    expect(result.eventTypeGroups[0].eventTypes.map((eventType) => eventType.id)).toEqual([2]);
    expect(result.eventTypeGroups[0].eventTypes[0].children[0].users).toHaveLength(1);
  });

  it("uses hosts before users and preserves null metadata", async () => {
    const host = { id: 4, name: "Host", username: "host", avatarUrl: null };
    const event = buildEvent({
      metadata: null,
      hosts: [{ user: host }],
      users: [{ id: 1, name: "Ada", username: "ada", avatarUrl: null }],
    });
    mocks.findAllByUpId.mockResolvedValue([event]);

    const result = await getEventTypesByViewer(user);

    expect(result.allUsersAcrossAllEventTypes.get(4)).toMatchObject({ id: 4 });
    expect(result.eventTypeGroups[0].eventTypes[0].metadata).toBeNull();
  });

  it("filters organization memberships and applies team permissions and filters", async () => {
    const organization = buildMembership({
      team: {
        ...buildMembership().team,
        id: 50,
        isOrganization: true,
      },
    });
    const team = buildMembership({
      role: MembershipRole.MEMBER,
      team: {
        ...buildMembership().team,
        id: 20,
        members: [{ id: 1 }, { id: 2 }],
        eventTypes: [
          buildEvent({ id: 1, teamId: 20, userId: null, schedulingType: SchedulingType.ROUND_ROBIN }),
          buildEvent({ id: 2, teamId: 20, userId: 2, schedulingType: SchedulingType.ROUND_ROBIN }),
          buildEvent({ id: 3, teamId: 20, userId: 1, schedulingType: SchedulingType.MANAGED }),
          buildEvent({ id: 4, teamId: 20, userId: 1, schedulingType: null }),
        ],
      },
    });
    mocks.findMemberships.mockResolvedValue([organization, team]);
    mocks.getTeamIdsWithPermission.mockResolvedValueOnce([20]).mockResolvedValueOnce([]);

    const result = await getEventTypesByViewer(user, {
      teamIds: [20],
      schedulingTypes: [SchedulingType.ROUND_ROBIN],
    });
    const group = result.eventTypeGroups.find((candidate) => candidate.teamId === 20);

    expect(group?.eventTypes.map((eventType) => eventType.id)).toEqual([1]);
    expect(result.eventTypeGroups).toHaveLength(1);
    expect(group?.metadata).toMatchObject({ membershipCount: 2, readOnly: false });
  });

  it("shapes team groups for organizations, routing forms, and missing slugs", async () => {
    const parent = {
      id: 99,
      name: "Acme Org",
      slug: "acme",
      logoUrl: "org-logo",
      metadata: { requestedSlug: "requested-acme" },
    };
    const membership = buildMembership({
      role: MembershipRole.ADMIN,
      team: {
        ...buildMembership().team,
        parentId: 99,
        parent,
        slug: "subteam",
      },
    });
    mocks.findMemberships.mockResolvedValue([membership]);
    mocks.getTeamIdsWithPermission.mockResolvedValue([20]);

    const result = await getEventTypesByViewer(user, undefined, false);
    const group = result.eventTypeGroups.find((candidate) => candidate.teamId === 20);
    expect(group?.profile.slug).toBe("subteam");
    expect(group?.bookerUrl).toBe("https://booker.example.com");
    expect(group?.profile.image).toContain("org-logo");

    vi.clearAllMocks();
    configureDefaults();
    mocks.findMemberships.mockResolvedValue([membership]);
    const routingResult = await getEventTypesByViewer(user, undefined, true);
    expect(routingResult.eventTypeGroups.find((candidate) => candidate.teamId === 20)?.profile.slug).toBe(
      "team/subteam"
    );
  });

  it("uses team prefixes, requested slugs, parent branding, and read permissions", async () => {
    const standalone = buildMembership({
      team: {
        ...buildMembership().team,
        slug: "standalone",
        eventTypes: [buildEvent({ teamId: 20, userId: null, schedulingType: SchedulingType.ROUND_ROBIN })],
      },
    });
    mocks.findMemberships.mockResolvedValue([standalone]);
    mocks.getTeamIdsWithPermission.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const standaloneResult = await getEventTypesByViewer(user);
    const standaloneGroup = standaloneResult.eventTypeGroups.find((group) => group.teamId === 20);
    expect(standaloneGroup).toMatchObject({
      profile: { slug: "team/standalone" },
      metadata: { readOnly: true },
    });
    expect(mocks.getBookerBaseUrlSync).toHaveBeenCalledWith(null);

    vi.clearAllMocks();
    configureDefaults();
    const requestedSlugTeam = buildMembership({
      team: {
        ...buildMembership().team,
        slug: null,
        parentId: 99,
        parent: {
          slug: null,
          name: "Acme Org",
          logoUrl: "org-logo",
          metadata: { requestedSlug: "requested-acme" },
        },
        eventTypes: [buildEvent({ teamId: 20, userId: null, schedulingType: SchedulingType.ROUND_ROBIN })],
      },
    });
    mocks.findMemberships.mockResolvedValue([requestedSlugTeam]);
    const requestedResult = await getEventTypesByViewer(user);
    const requestedGroup = requestedResult.eventTypeGroups.find((group) => group.teamId === 20);
    expect(requestedGroup?.profile.slug).toBeNull();
    expect(requestedGroup?.profile.image).toContain("org-logo");
    expect(mocks.getBookerBaseUrlSync).toHaveBeenCalledWith("requested-acme");
  });

  it("uses parent membership precedence and normalizes profiles", async () => {
    const parentMembership = buildMembership({
      role: MembershipRole.OWNER,
      team: { ...buildMembership().team, id: 99, name: "Org", isOrganization: true },
    });
    const childMembership = buildMembership({
      role: MembershipRole.MEMBER,
      team: { ...buildMembership().team, parentId: 99 },
    });
    mocks.findMemberships.mockResolvedValue([parentMembership, childMembership]);
    mocks.getTeamIdsWithPermission.mockResolvedValue([20]);

    const result = await getEventTypesByViewer(user);
    const childGroup = result.eventTypeGroups.find((group) => group.teamId === 20);

    expect(childGroup?.membershipRole).toBe(MembershipRole.OWNER);
    expect(result.profiles.some((profile) => profile.teamId === 20 && profile.membershipCount === 1)).toBe(
      true
    );
  });
});
