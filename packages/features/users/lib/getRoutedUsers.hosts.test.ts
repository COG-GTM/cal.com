import { enrichHostsWithDelegationCredentials } from "@calcom/app-store/delegationCredential";
import { findTeamMembersMatchingAttributeLogic } from "@calcom/features/routing-forms/lib/findTeamMembersMatchingAttributeLogic";
import getOrgIdFromMemberOrTeamId from "@calcom/lib/getOrgIdFromMemberOrTeamId";
import { SchedulingType } from "@calcom/prisma/enums";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventType } from "./getRoutedUsers";
import {
  findMatchingHostsWithEventSegment,
  getNormalizedHosts,
  getNormalizedHostsWithDelegationCredentials,
} from "./getRoutedUsers";

vi.mock("@calcom/prisma", () => ({ default: vi.fn() }));

vi.mock("@calcom/app-store/delegationCredential", () => ({
  enrichHostsWithDelegationCredentials: vi.fn(),
}));

vi.mock("@calcom/lib/getOrgIdFromMemberOrTeamId", () => ({
  default: vi.fn(),
}));

vi.mock("@calcom/features/routing-forms/lib/findTeamMembersMatchingAttributeLogic", () => ({
  findTeamMembersMatchingAttributeLogic: vi.fn(),
}));

type AsyncMock = MockInstance<(...args: never[]) => Promise<unknown>>;

const enrichHostsMock = enrichHostsWithDelegationCredentials as unknown as AsyncMock;
const getOrgIdMock = vi.mocked(getOrgIdFromMemberOrTeamId);
const findTeamMembersMock = findTeamMembersMatchingAttributeLogic as unknown as AsyncMock;

const buildUser = (id: number) => ({
  id,
  uuid: `uuid-${id}`,
  email: `user${id}@example.com`,
  credentials: [],
});

const buildHost = (id: number, isFixed = false) => ({
  isFixed,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  priority: 2,
  weight: 100,
  groupId: null,
  user: buildUser(id),
});

const buildEventType = (overrides: Partial<EventType> = {}): EventType => ({
  assignAllTeamMembers: true,
  assignRRMembersUsingSegment: true,
  rrSegmentQueryValue: null,
  team: { id: 5, parentId: 9, rrResetInterval: null, rrTimestampBasis: "CREATED_AT" },
  ...overrides,
});

describe("getNormalizedHosts", () => {
  it("maps the configured hosts when the event type is a team event with hosts", () => {
    const host = buildHost(1, true);

    const result = getNormalizedHosts({
      eventType: {
        schedulingType: SchedulingType.ROUND_ROBIN,
        hosts: [host],
        users: [buildUser(2)],
      },
    });

    expect(result.fallbackHosts).toBeNull();
    expect(result.hosts).toEqual([
      {
        isFixed: true,
        user: host.user,
        priority: 2,
        weight: 100,
        createdAt: host.createdAt,
        groupId: null,
      },
    ]);
  });

  it("marks fallback hosts as fixed for collective events", () => {
    const result = getNormalizedHosts({
      eventType: { schedulingType: SchedulingType.COLLECTIVE, hosts: [], users: [buildUser(1)] },
    });

    expect(result.hosts).toBeNull();
    expect(result.fallbackHosts).toEqual([
      {
        isFixed: true,
        email: "user1@example.com",
        user: expect.objectContaining({ id: 1 }),
        createdAt: null,
        groupId: null,
      },
    ]);
  });

  it("marks fallback hosts as non-fixed for round robin events without hosts", () => {
    const result = getNormalizedHosts({
      eventType: { schedulingType: SchedulingType.ROUND_ROBIN, users: [buildUser(1)] },
    });

    expect(result.fallbackHosts?.[0].isFixed).toBe(false);
  });

  it("treats users of an event type without scheduling type as fixed", () => {
    const result = getNormalizedHosts({
      eventType: { schedulingType: null, hosts: [buildHost(1)], users: [buildUser(2)] },
    });

    expect(result.hosts).toBeNull();
    expect(result.fallbackHosts?.[0].isFixed).toBe(true);
  });
});

describe("getNormalizedHostsWithDelegationCredentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enrichHostsMock.mockImplementation(async (args) => (args as { hosts: unknown[] }).hosts);
  });

  it("enriches the configured hosts with the org of the first host", async () => {
    getOrgIdMock.mockResolvedValue(42);
    const host = buildHost(1);

    const result = await getNormalizedHostsWithDelegationCredentials({
      eventType: {
        schedulingType: SchedulingType.ROUND_ROBIN,
        hosts: [host],
        users: [buildUser(2)],
        teamId: 7,
      },
    });

    expect(getOrgIdMock).toHaveBeenCalledWith({ memberId: 1, teamId: 7 });
    expect(enrichHostsMock).toHaveBeenCalledWith({
      orgId: 42,
      hosts: [expect.objectContaining({ isFixed: false, user: host.user })],
    });
    expect(result.fallbackHosts).toBeNull();
    expect(result.hosts).toHaveLength(1);
  });

  it("enriches fallback hosts and passes a null orgId when the member has no organization", async () => {
    getOrgIdMock.mockResolvedValue(undefined);

    const result = await getNormalizedHostsWithDelegationCredentials({
      eventType: { schedulingType: SchedulingType.COLLECTIVE, hosts: [], users: [buildUser(3)] },
    });

    expect(getOrgIdMock).toHaveBeenCalledWith({ memberId: 3, teamId: undefined });
    expect(enrichHostsMock).toHaveBeenCalledWith({
      orgId: null,
      hosts: [expect.objectContaining({ isFixed: true, email: "user3@example.com", createdAt: null })],
    });
    expect(result.hosts).toBeNull();
    expect(result.fallbackHosts).toHaveLength(1);
  });

  it("passes a null memberId when there is no host at all", async () => {
    getOrgIdMock.mockResolvedValue(undefined);

    await getNormalizedHostsWithDelegationCredentials({
      eventType: { schedulingType: SchedulingType.ROUND_ROBIN, hosts: [], users: [] },
    });

    expect(getOrgIdMock).toHaveBeenCalledWith({ memberId: null, teamId: undefined });
  });
});

describe("findMatchingHostsWithEventSegment", () => {
  const hosts = [
    { isFixed: false, user: buildUser(1), createdAt: null, groupId: null },
    { isFixed: false, user: buildUser(2), createdAt: null, groupId: null },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all hosts when segmentation is disabled", async () => {
    const result = await findMatchingHostsWithEventSegment({
      eventType: buildEventType({ assignRRMembersUsingSegment: false }),
      hosts,
    });

    expect(result).toEqual(hosts);
    expect(findTeamMembersMock).not.toHaveBeenCalled();
  });

  it("returns all hosts when all team members are not assigned", async () => {
    const result = await findMatchingHostsWithEventSegment({
      eventType: buildEventType({ assignAllTeamMembers: false }),
      hosts,
    });

    expect(result).toEqual(hosts);
    expect(findTeamMembersMock).not.toHaveBeenCalled();
  });

  it("returns all hosts when the event type has no team", async () => {
    const result = await findMatchingHostsWithEventSegment({
      eventType: buildEventType({ team: null }),
      hosts,
    });

    expect(result).toEqual(hosts);
    expect(findTeamMembersMock).not.toHaveBeenCalled();
  });

  it("returns all hosts when the team is not part of an organization", async () => {
    const result = await findMatchingHostsWithEventSegment({
      eventType: buildEventType({
        team: { id: 5, parentId: null, rrResetInterval: null, rrTimestampBasis: "CREATED_AT" },
      }),
      hosts,
    });

    expect(result).toEqual(hosts);
    expect(findTeamMembersMock).not.toHaveBeenCalled();
  });

  it("filters the hosts down to the members matching the attribute logic", async () => {
    findTeamMembersMock.mockResolvedValue({
      teamMembersMatchingAttributeLogic: [{ userId: 2, result: "MATCH" }],
    });

    const result = await findMatchingHostsWithEventSegment({
      eventType: buildEventType({ rrSegmentQueryValue: undefined }),
      hosts,
    });

    expect(findTeamMembersMock).toHaveBeenCalledWith({
      attributesQueryValue: null,
      teamId: 5,
      orgId: 9,
    });
    expect(result).toEqual([hosts[1]]);
  });

  it("returns all hosts when the attribute logic yields no member list", async () => {
    findTeamMembersMock.mockResolvedValue({ teamMembersMatchingAttributeLogic: null });

    const result = await findMatchingHostsWithEventSegment({ eventType: buildEventType(), hosts });

    expect(result).toEqual(hosts);
  });
});
