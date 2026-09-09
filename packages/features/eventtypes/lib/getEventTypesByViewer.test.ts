import { getBookerBaseUrl } from "@calcom/features/ee/organizations/lib/getBookerUrlServer";
import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { MembershipRole, SchedulingType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareMembership, getEventTypesByViewer } from "./getEventTypesByViewer";

const mocks = vi.hoisted(() => ({
  findAllByUpId: vi.fn(),
  enrichUsersWithTheirProfiles: vi.fn(),
  getTeamIdsWithPermission: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({ default: {}, prisma: {} }));

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: { findByUpIdWithAuth: vi.fn() },
}));

vi.mock("@calcom/features/membership/repositories/MembershipRepository", () => ({
  MembershipRepository: { findAllByUpIdIncludeTeamWithMembersAndEventTypes: vi.fn() },
}));

vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: class {
    findAllByUpId = mocks.findAllByUpId;
  },
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    enrichUsersWithTheirProfiles = mocks.enrichUsersWithTheirProfiles;
  },
}));

vi.mock("@calcom/features/pbac/services/permission-check.service", () => ({
  PermissionCheckService: class {
    getTeamIdsWithPermission = mocks.getTeamIdsWithPermission;
  },
}));

vi.mock("@calcom/features/ee/organizations/lib/getBookerUrlServer", () => ({
  getBookerBaseUrl: vi.fn(),
}));

vi.mock("@calcom/features/ee/organizations/lib/getBookerBaseUrlSync", () => ({
  getBookerBaseUrlSync: (slug: string | null) => (slug ? `https://${slug}.cal.local` : "https://cal.local"),
}));

const findByUpIdWithAuth = vi.mocked(ProfileRepository.findByUpIdWithAuth);
const findAllMemberships = vi.mocked(MembershipRepository.findAllByUpIdIncludeTeamWithMembersAndEventTypes);
const getBookerBaseUrlMock = vi.mocked(getBookerBaseUrl);

const { findAllByUpId, enrichUsersWithTheirProfiles, getTeamIdsWithPermission } = mocks;

const user = { id: 1, profile: { upId: "usr-1" } };

const buildProfile = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  username: "alice",
  name: "Alice",
  avatarUrl: null,
  organizationId: null,
  organization: null,
  ...overrides,
});

const buildEventType = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  title: "30 min",
  slug: "30min",
  description: null,
  position: 0,
  teamId: null,
  userId: 1,
  parentId: null,
  schedulingType: null,
  metadata: null,
  hosts: [],
  users: [{ id: 1, name: "Alice" }],
  children: [],
  ...overrides,
});

const buildTeamMembership = ({
  team,
  ...overrides
}: { team?: Record<string, unknown> } & Record<string, unknown> = {}) => ({
  role: MembershipRole.MEMBER,
  accepted: true,
  ...overrides,
  team: {
    id: 100,
    name: "Team",
    slug: "team",
    logoUrl: null,
    parentId: null,
    parent: null,
    isOrganization: false,
    metadata: null,
    members: [{ id: 1 }, { id: 2 }],
    eventTypes: [],
    ...team,
  },
});

describe("getEventTypesByViewer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    findByUpIdWithAuth.mockResolvedValue(buildProfile());
    findAllMemberships.mockResolvedValue([]);
    findAllByUpId.mockResolvedValue([]);
    enrichUsersWithTheirProfiles.mockImplementation(async (users: { id: number }[]) => users);
    getTeamIdsWithPermission.mockResolvedValue([]);
    getBookerBaseUrlMock.mockResolvedValue("https://cal.local");
  });

  it("throws when the profile cannot be resolved", async () => {
    findByUpIdWithAuth.mockResolvedValue(null);

    await expect(getEventTypesByViewer(user)).rejects.toThrow("Profile not found");
  });

  it("returns a personal group with the user's event types and safe descriptions", async () => {
    findAllByUpId.mockResolvedValue([buildEventType({ description: "A **bold** event" })]);

    const result = await getEventTypesByViewer(user);

    expect(result.eventTypeGroups).toHaveLength(1);
    const group = result.eventTypeGroups[0];
    expect(group.teamId).toBeNull();
    expect(group.profile.slug).toBe("alice");
    expect(group.metadata).toEqual({ membershipCount: 1, readOnly: false });
    expect(group.eventTypes[0].safeDescription).toContain("<strong>bold</strong>");
  });

  it("moves users out of each event type into allUsersAcrossAllEventTypes", async () => {
    findAllByUpId.mockResolvedValue([buildEventType({ users: [{ id: 1, name: "Alice" }] })]);

    const result = await getEventTypesByViewer(user);

    const eventType = result.eventTypeGroups[0].eventTypes[0];
    expect(eventType.userIds).toEqual([1]);
    expect(eventType).not.toHaveProperty("users");
    expect(result.allUsersAcrossAllEventTypes.get(1)).toMatchObject({ id: 1, name: "Alice" });
  });

  it("prefers host users over the users relation when hosts exist", async () => {
    findAllByUpId.mockResolvedValue([
      buildEventType({ users: [{ id: 1 }], hosts: [{ user: { id: 5, name: "Host" } }] }),
    ]);

    await getEventTypesByViewer(user);

    expect(enrichUsersWithTheirProfiles).toHaveBeenCalledWith([{ id: 5, name: "Host" }]);
  });

  it("keeps child events assigned to the user and drops the others", async () => {
    findAllByUpId.mockResolvedValue([
      buildEventType({ id: 11, parentId: 3, users: [{ id: 1 }] }),
      buildEventType({ id: 12, parentId: 3, users: [{ id: 2 }] }),
      buildEventType({ id: 13, parentId: 3, users: [] }),
    ]);

    const result = await getEventTypesByViewer(user);

    expect(result.eventTypeGroups[0].eventTypes.map((eventType) => eventType.id)).toEqual([11]);
  });

  it("excludes managed event types from the personal group", async () => {
    findAllByUpId.mockResolvedValue([
      buildEventType({ id: 10 }),
      buildEventType({ id: 11, schedulingType: SchedulingType.MANAGED }),
    ]);

    const result = await getEventTypesByViewer(user);

    expect(result.eventTypeGroups[0].eventTypes.map((eventType) => eventType.id)).toEqual([10]);
  });

  it("flags event types as locked when the parent organization locks creation", async () => {
    findByUpIdWithAuth.mockResolvedValue(
      buildProfile({
        organizationId: 9,
        organization: { organizationSettings: { lockEventTypeCreationForUsers: true } },
      })
    );

    const result = await getEventTypesByViewer(user);

    expect(result.eventTypeGroups[0].profile.eventTypesLockedByOrg).toBe(true);
    expect(getBookerBaseUrlMock).toHaveBeenCalledWith(9);
  });

  it("does not query personal event types when a team filter excludes the user", async () => {
    const result = await getEventTypesByViewer(user, { teamIds: [100] });

    expect(findAllByUpId).not.toHaveBeenCalled();
    expect(result.eventTypeGroups).toHaveLength(0);
  });

  it("still lists user events when an upIds filter does not contain the user's upId", async () => {
    findAllByUpId.mockResolvedValue([buildEventType()]);

    const result = await getEventTypesByViewer(user, { upIds: ["usr-2"] });

    expect(findAllByUpId).toHaveBeenCalled();
    expect(result.eventTypeGroups[0].teamId).toBeNull();
  });

  it("skips organization memberships but keeps team memberships", async () => {
    findAllMemberships.mockResolvedValue([
      buildTeamMembership({ team: { id: 100, name: "Team", isOrganization: false } }),
      buildTeamMembership({ team: { id: 200, name: "Org", isOrganization: true } }),
    ]);

    const result = await getEventTypesByViewer(user);

    expect(result.eventTypeGroups.map((group) => group.teamId)).toEqual([null, 100]);
  });

  it("marks a team group readOnly when the user lacks eventType.read on it", async () => {
    findAllMemberships.mockResolvedValue([buildTeamMembership()]);

    const result = await getEventTypesByViewer(user);

    const teamGroup = result.eventTypeGroups[1];
    expect(teamGroup.metadata).toEqual({ membershipCount: 2, readOnly: true });
    expect(teamGroup.profile.slug).toBe("team/team");
  });

  it("uses the sub-team slug without the team prefix inside an organization", async () => {
    findAllMemberships.mockResolvedValue([
      buildTeamMembership({
        team: {
          id: 100,
          name: "Team",
          slug: "team",
          parentId: 200,
          parent: { slug: "acme", name: "Acme", logoUrl: null, metadata: null },
          isOrganization: false,
          metadata: null,
          members: [],
          eventTypes: [],
        },
      }),
    ]);

    const result = await getEventTypesByViewer(user);

    expect(result.eventTypeGroups[1].profile.slug).toBe("team");
    expect(result.eventTypeGroups[1].bookerUrl).toBe("https://acme.cal.local");
  });

  it("prefixes the slug with team/ for routing forms even inside an organization", async () => {
    findAllMemberships.mockResolvedValue([
      buildTeamMembership({
        team: {
          id: 100,
          name: "Team",
          slug: "team",
          parentId: 200,
          parent: { slug: "acme", name: "Acme", logoUrl: null, metadata: null },
          isOrganization: false,
          metadata: null,
          members: [],
          eventTypes: [],
        },
      }),
    ]);

    const result = await getEventTypesByViewer(user, undefined, true);

    expect(result.eventTypeGroups[1].profile.slug).toBe("team/team");
  });

  it("hides managed team events from members without eventType.update permission", async () => {
    findAllMemberships.mockResolvedValue([
      buildTeamMembership({
        team: {
          id: 100,
          name: "Team",
          slug: "team",
          parentId: null,
          parent: null,
          isOrganization: false,
          metadata: null,
          members: [],
          eventTypes: [
            buildEventType({ id: 20, teamId: 100, userId: null }),
            buildEventType({ id: 21, teamId: 100, userId: null, schedulingType: SchedulingType.MANAGED }),
          ],
        },
      }),
    ]);

    const result = await getEventTypesByViewer(user);

    expect(result.eventTypeGroups[1].eventTypes.map((eventType) => eventType.id)).toEqual([20]);
  });

  it("shows managed team events to users with eventType.update permission", async () => {
    getTeamIdsWithPermission.mockResolvedValue([100]);
    findAllMemberships.mockResolvedValue([
      buildTeamMembership({
        team: {
          id: 100,
          name: "Team",
          slug: "team",
          parentId: null,
          parent: null,
          isOrganization: false,
          metadata: null,
          members: [],
          eventTypes: [
            buildEventType({ id: 21, teamId: 100, userId: null, schedulingType: SchedulingType.MANAGED }),
          ],
        },
      }),
    ]);

    const result = await getEventTypesByViewer(user);

    expect(result.eventTypeGroups[1].eventTypes.map((eventType) => eventType.id)).toEqual([21]);
    expect(result.eventTypeGroups[1].metadata.readOnly).toBe(false);
  });

  it("filters team event types by scheduling type when the filter is set", async () => {
    findAllMemberships.mockResolvedValue([
      buildTeamMembership({
        team: {
          id: 100,
          name: "Team",
          slug: "team",
          parentId: null,
          parent: null,
          isOrganization: false,
          metadata: null,
          members: [],
          eventTypes: [
            buildEventType({ id: 20, teamId: 100, userId: null, schedulingType: SchedulingType.COLLECTIVE }),
            buildEventType({
              id: 22,
              teamId: 100,
              userId: null,
              schedulingType: SchedulingType.ROUND_ROBIN,
            }),
            buildEventType({ id: 23, teamId: 100, userId: null, schedulingType: null }),
          ],
        },
      }),
    ]);

    const result = await getEventTypesByViewer(user, {
      teamIds: [100],
      schedulingTypes: [SchedulingType.ROUND_ROBIN],
    });

    const teamGroup = result.eventTypeGroups.find((group) => group.teamId === 100);
    expect(teamGroup?.eventTypes.map((eventType) => eventType.id)).toEqual([22]);
  });

  it("uses the organization membership role when it outranks the team role", async () => {
    findAllMemberships.mockResolvedValue([
      buildTeamMembership({
        role: MembershipRole.OWNER,
        team: { id: 200, name: "Org", isOrganization: true },
      }),
      buildTeamMembership({
        role: MembershipRole.MEMBER,
        team: {
          id: 100,
          name: "Team",
          slug: "team",
          parentId: 200,
          parent: null,
          isOrganization: false,
          metadata: null,
          members: [],
          eventTypes: [],
        },
      }),
    ]);

    const result = await getEventTypesByViewer(user);

    expect(result.eventTypeGroups[1].membershipRole).toBe(MembershipRole.OWNER);
  });

  it("exposes one profile entry per group", async () => {
    findAllMemberships.mockResolvedValue([buildTeamMembership()]);

    const result = await getEventTypesByViewer(user);

    expect(result.profiles).toHaveLength(2);
    expect(result.profiles[1]).toMatchObject({
      teamId: 100,
      membershipRole: MembershipRole.MEMBER,
      membershipCount: 2,
    });
  });
});

describe("compareMembership", () => {
  it("returns true only when the first role outranks the second", () => {
    expect(compareMembership(MembershipRole.OWNER, MembershipRole.MEMBER)).toBe(true);
    expect(compareMembership(MembershipRole.MEMBER, MembershipRole.OWNER)).toBe(false);
    expect(compareMembership(MembershipRole.ADMIN, MembershipRole.ADMIN)).toBe(false);
  });
});
