import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole, SchedulingType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEventTypeById, getRawEventType } from "./getEventTypeById";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findByIdForOrgAdmin: vi.fn(),
  organizationFindById: vi.fn(),
  enrichUserWithItsProfile: vi.fn(),
  getBookerBaseUrl: vi.fn(),
  getLocationGroupedOptions: vi.fn(),
  getBookingFieldsWithSystemFields: vi.fn(),
}));

vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: class {
    findById = mocks.findById;
    findByIdForOrgAdmin = mocks.findByIdForOrgAdmin;
  },
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    enrichUserWithItsProfile = mocks.enrichUserWithItsProfile;
  },
}));

vi.mock("@calcom/features/ee/organizations/di/OrganizationRepository.container", () => ({
  getOrganizationRepository: () => ({ findById: mocks.organizationFindById }),
}));

vi.mock("@calcom/features/ee/organizations/lib/getBookerUrlServer", () => ({
  getBookerBaseUrl: mocks.getBookerBaseUrl,
}));

vi.mock("@calcom/app-store/server", () => ({
  getLocationGroupedOptions: mocks.getLocationGroupedOptions,
}));

vi.mock("@calcom/features/bookings/lib/getBookingFields", () => ({
  getBookingFieldsWithSystemFields: mocks.getBookingFieldsWithSystemFields,
}));

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: async () => (key: string) => key,
}));

const buildUser = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Alice",
  username: "alice",
  email: "alice@example.com",
  avatarUrl: null,
  locale: "en",
  defaultScheduleId: 7,
  isPlatformManaged: false,
  timeZone: "UTC",
  ...overrides,
});

const buildRawEventType = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  title: "30 min",
  slug: "30min",
  teamId: null,
  team: null,
  owner: { id: 1 },
  users: [buildUser()],
  children: [],
  customInputs: [],
  locations: [{ type: "integrations:daily" }],
  metadata: {},
  schedule: null,
  instantMeetingSchedule: null,
  restrictionSchedule: null,
  restrictionScheduleId: null,
  useBookerTimezone: null,
  recurringEvent: null,
  bookingLimits: null,
  durationLimits: null,
  eventTypeColor: null,
  periodStartDate: null,
  periodEndDate: null,
  destinationCalendar: null,
  schedulingType: null,
  ...overrides,
});

const prismaMock = {
  user: { findUnique: vi.fn() },
  destinationCalendar: { findFirst: vi.fn() },
} as unknown as PrismaClient;

const prismaUserFindUnique = vi.mocked(prismaMock.user.findUnique);
const prismaDestinationCalendarFindFirst = vi.mocked(prismaMock.destinationCalendar.findFirst);

const callGetEventTypeById = (overrides: Record<string, unknown> = {}) =>
  getEventTypeById({
    eventTypeId: 10,
    userId: 1,
    prisma: prismaMock,
    isUserOrganizationAdmin: false,
    currentOrganizationId: null,
    ...overrides,
  });

describe("getRawEventType", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.organizationFindById.mockResolvedValue(null);
    mocks.findById.mockResolvedValue(null);
    mocks.findByIdForOrgAdmin.mockResolvedValue(null);
  });

  it("looks the event type up by user membership for a regular user", async () => {
    await getRawEventType({
      userId: 1,
      eventTypeId: 10,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
      prisma: prismaMock,
    });

    expect(mocks.findById).toHaveBeenCalledWith({ id: 10, userId: 1 });
    expect(mocks.findByIdForOrgAdmin).not.toHaveBeenCalled();
  });

  it("uses the org admin lookup for an admin of a platform organization", async () => {
    mocks.organizationFindById.mockResolvedValue({ id: 5, isPlatform: true });

    await getRawEventType({
      userId: 1,
      eventTypeId: 10,
      isUserOrganizationAdmin: true,
      currentOrganizationId: 5,
      prisma: prismaMock,
    });

    expect(mocks.findByIdForOrgAdmin).toHaveBeenCalledWith({ id: 10, organizationId: 5 });
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it("falls back to the membership lookup for an admin of a non platform organization", async () => {
    mocks.organizationFindById.mockResolvedValue({ id: 5, isPlatform: false });

    await getRawEventType({
      userId: 1,
      eventTypeId: 10,
      isUserOrganizationAdmin: true,
      currentOrganizationId: 5,
      prisma: prismaMock,
    });

    expect(mocks.findById).toHaveBeenCalledWith({ id: 10, userId: 1 });
  });
});

describe("getEventTypeById", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.organizationFindById.mockResolvedValue(null);
    mocks.findById.mockResolvedValue(buildRawEventType());
    mocks.enrichUserWithItsProfile.mockImplementation(
      async ({ user }: { user: Record<string, unknown> }) => ({
        ...user,
        profile: { id: 900 },
        eventTypes: [{ slug: "30min" }],
      })
    );
    mocks.getBookerBaseUrl.mockResolvedValue("https://acme.cal.local");
    mocks.getLocationGroupedOptions.mockResolvedValue([{ label: "Conferencing", options: [] }]);
    mocks.getBookingFieldsWithSystemFields.mockReturnValue([{ name: "name", type: "name" }]);
    prismaUserFindUnique.mockResolvedValue(null);
    prismaDestinationCalendarFindFirst.mockResolvedValue(null);
  });

  it("throws a plain error when the event type is not found outside tRPC", async () => {
    mocks.findById.mockResolvedValue(null);

    await expect(callGetEventTypeById()).rejects.toThrow("Event type not found");
  });

  it("throws a NOT_FOUND TRPCError when the event type is missing during a tRPC call", async () => {
    mocks.findById.mockResolvedValue(null);

    await expect(callGetEventTypeById({ isTrpcCall: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the parsed event type with the personal booker url and location options", async () => {
    const result = await callGetEventTypeById();

    expect(result.eventType.id).toBe(10);
    expect(result.eventType.bookerUrl).toBe("https://acme.cal.local");
    expect(mocks.getBookerBaseUrl).toHaveBeenCalledWith(null);
    expect(result.locationOptions).toEqual([{ label: "Conferencing", options: [] }]);
    expect(result.team).toBeNull();
    expect(result.teamMembers).toEqual([]);
    expect(result.currentUserMembership).toBeNull();
  });

  it("falls back to the user's default schedule when the event type has none", async () => {
    const result = await callGetEventTypeById();

    expect(result.eventType.schedule).toBe(7);
    expect(result.eventType.scheduleName).toBeNull();
  });

  it("prefers the event type's own schedule and exposes its name", async () => {
    mocks.findById.mockResolvedValue(
      buildRawEventType({
        schedule: { id: 55, name: "Working hours" },
        restrictionScheduleId: 3,
        restrictionSchedule: { name: "Restriction" },
      })
    );

    const result = await callGetEventTypeById();

    expect(result.eventType.schedule).toBe(55);
    expect(result.eventType.scheduleName).toBe("Working hours");
    expect(result.eventType.restrictionScheduleId).toBe(3);
    expect(result.eventType.restrictionScheduleName).toBe("Restriction");
  });

  it("adds the members default location option for managed event types", async () => {
    mocks.findById.mockResolvedValue(buildRawEventType({ schedulingType: SchedulingType.MANAGED }));

    const result = await callGetEventTypeById();

    expect(result.locationOptions[0]).toMatchObject({
      label: "default",
      options: [{ label: "members_default_location", value: "", icon: "/user-check.svg" }],
    });
  });

  it("looks up a fallback user when the event type has no users", async () => {
    mocks.findById.mockResolvedValue(buildRawEventType({ users: [] }));
    prismaUserFindUnique.mockResolvedValue(buildUser({ id: 1 }));

    const result = await callGetEventTypeById();

    expect(prismaUserFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 } }));
    expect(result.eventType.users).toEqual([]);
  });

  it("throws when there is no user on the event type and no fallback user exists", async () => {
    mocks.findById.mockResolvedValue(buildRawEventType({ users: [] }));

    await expect(callGetEventTypeById()).rejects.toThrow(
      "The event type doesn't have user and no fallback user was found"
    );
    await expect(callGetEventTypeById({ isTrpcCall: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws when neither the current user nor a team can be resolved", async () => {
    mocks.findById.mockResolvedValue(buildRawEventType({ users: [buildUser({ id: 2 })] }));

    await expect(callGetEventTypeById()).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Could not find user or team",
    });
  });

  it("builds team members and the current user membership for a team event", async () => {
    mocks.findById.mockResolvedValue(
      buildRawEventType({
        teamId: 100,
        owner: null,
        team: {
          id: 100,
          parentId: 200,
          members: [
            { role: MembershipRole.OWNER, accepted: true, user: buildUser({ id: 1 }) },
            { role: MembershipRole.MEMBER, accepted: false, user: buildUser({ id: 2 }) },
          ],
        },
      })
    );

    const result = await callGetEventTypeById();

    expect(mocks.getBookerBaseUrl).toHaveBeenCalledWith(200);
    expect(result.teamMembers.map((member) => member.id)).toEqual([1, 2]);
    expect(result.teamMembers[0]).toMatchObject({
      profileId: 900,
      eventTypes: ["30min"],
      membership: MembershipRole.OWNER,
    });
    expect(result.currentUserMembership).toMatchObject({ role: MembershipRole.OWNER });
    expect(mocks.getLocationGroupedOptions).toHaveBeenCalledWith({ teamId: 100 }, expect.any(Function));
  });

  it("hides unaccepted members for a non organization team event", async () => {
    mocks.findById.mockResolvedValue(
      buildRawEventType({
        teamId: 100,
        owner: null,
        team: {
          id: 100,
          parentId: null,
          members: [
            { role: MembershipRole.OWNER, accepted: true, user: buildUser({ id: 1 }) },
            { role: MembershipRole.MEMBER, accepted: false, user: buildUser({ id: 2 }) },
          ],
        },
      })
    );

    const result = await callGetEventTypeById();

    expect(result.teamMembers.map((member) => member.id)).toEqual([1]);
  });

  it("enriches children owners and drops children without an owner", async () => {
    mocks.findById.mockResolvedValue(
      buildRawEventType({
        teamId: 100,
        owner: null,
        team: {
          id: 100,
          parentId: null,
          members: [{ role: MembershipRole.ADMIN, accepted: true, user: buildUser({ id: 2 }) }],
        },
        children: [
          { id: 31, owner: buildUser({ id: 2, name: null, username: null }) },
          { id: 32, owner: null },
        ],
      })
    );

    const result = await callGetEventTypeById();

    expect(result.eventType.children).toHaveLength(1);
    expect(result.eventType.children[0]).toMatchObject({
      id: 31,
      created: true,
      owner: { name: "", username: "", membership: MembershipRole.ADMIN },
    });
  });

  it("falls back to the user's own default destination calendar", async () => {
    prismaDestinationCalendarFindFirst.mockResolvedValue({ id: 3, integration: "google_calendar" });

    const result = await callGetEventTypeById();

    expect(prismaDestinationCalendarFindFirst).toHaveBeenCalledWith({
      where: { userId: 1, eventTypeId: null },
    });
    expect(result.destinationCalendar).toMatchObject({ id: 3 });
  });

  it("keeps the event type's own destination calendar", async () => {
    mocks.findById.mockResolvedValue(
      buildRawEventType({ destinationCalendar: { id: 9, integration: "google_calendar" } })
    );

    const result = await callGetEventTypeById();

    expect(prismaDestinationCalendarFindFirst).not.toHaveBeenCalled();
    expect(result.destinationCalendar).toMatchObject({ id: 9 });
  });

  it("parses custom inputs and stringifies the period dates", async () => {
    const periodStartDate = new Date("2024-01-01T00:00:00.000Z");
    mocks.findById.mockResolvedValue(
      buildRawEventType({
        periodStartDate,
        periodEndDate: null,
        customInputs: [
          { id: 1, eventTypeId: 10, label: "Extra", type: "TEXT", required: true, placeholder: "" },
        ],
      })
    );

    const result = await callGetEventTypeById();

    expect(result.eventType.periodStartDate).toBe(periodStartDate.toString());
    expect(result.eventType.periodEndDate).toBeNull();
    expect(result.eventType.customInputs[0]).toMatchObject({ label: "Extra", type: "TEXT" });
  });

  it("marks org team events when building booking fields", async () => {
    mocks.findById.mockResolvedValue(
      buildRawEventType({
        teamId: 100,
        owner: null,
        team: {
          id: 100,
          parentId: 200,
          members: [{ role: MembershipRole.OWNER, accepted: true, user: buildUser({ id: 1 }) }],
        },
      })
    );

    await callGetEventTypeById();

    expect(mocks.getBookingFieldsWithSystemFields).toHaveBeenCalledWith(
      expect.objectContaining({ isOrgTeamEvent: true })
    );
  });
});
