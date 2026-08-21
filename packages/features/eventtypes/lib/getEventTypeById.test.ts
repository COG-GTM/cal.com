import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole, SchedulingType } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import { getEventTypeById, getRawEventType } from "./getEventTypeById";

type EventTypeMocks = {
  findById: ReturnType<typeof vi.fn>;
  findByIdForOrgAdmin: ReturnType<typeof vi.fn>;
  findOrganizationById: ReturnType<typeof vi.fn>;
  enrichUserWithItsProfile: ReturnType<typeof vi.fn>;
  getBookerBaseUrl: ReturnType<typeof vi.fn>;
  getLocationGroupedOptions: ReturnType<typeof vi.fn>;
  getTranslation: ReturnType<typeof vi.fn>;
  getEventTypeAppData: ReturnType<typeof vi.fn>;
  getBookingFieldsWithSystemFields: ReturnType<typeof vi.fn>;
};

const mocks: EventTypeMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findByIdForOrgAdmin: vi.fn(),
  findOrganizationById: vi.fn(),
  enrichUserWithItsProfile: vi.fn(),
  getBookerBaseUrl: vi.fn(),
  getLocationGroupedOptions: vi.fn(),
  getTranslation: vi.fn(),
  getEventTypeAppData: vi.fn(),
  getBookingFieldsWithSystemFields: vi.fn(),
}));

vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: class {
    findById = mocks.findById;
    findByIdForOrgAdmin = mocks.findByIdForOrgAdmin;
  },
}));

vi.mock("@calcom/features/ee/organizations/di/OrganizationRepository.container", () => ({
  getOrganizationRepository: () => ({
    findById: mocks.findOrganizationById,
  }),
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    enrichUserWithItsProfile = mocks.enrichUserWithItsProfile;
  },
}));

vi.mock("@calcom/features/ee/organizations/lib/getBookerUrlServer", () => ({
  getBookerBaseUrl: mocks.getBookerBaseUrl,
}));

vi.mock("@calcom/app-store/server", () => ({
  getLocationGroupedOptions: mocks.getLocationGroupedOptions,
}));

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: mocks.getTranslation,
}));

vi.mock("@calcom/app-store/utils", () => ({
  getEventTypeAppData: mocks.getEventTypeAppData,
}));

vi.mock("@calcom/features/bookings/lib/getBookingFields", () => ({
  getBookingFieldsWithSystemFields: mocks.getBookingFieldsWithSystemFields,
}));

const prisma: ReturnType<typeof mockDeep<PrismaClient>> = mockDeep<PrismaClient>();

const buildUser = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1,
  name: "Ada Lovelace",
  avatarUrl: null,
  username: "ada",
  email: "ada@example.com",
  locale: "fr",
  defaultScheduleId: 12,
  isPlatformManaged: false,
  timeZone: "Europe/London",
  profile: {
    id: 101,
    organizationId: null,
    username: "ada",
    upId: "prof-ada",
  },
  eventTypes: [{ slug: "meeting" }],
  ...overrides,
});

const buildEvent = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
  const user = buildUser();
  return {
    id: 10,
    title: "Meeting",
    slug: "meeting",
    length: 30,
    userId: user.id,
    teamId: null,
    parentId: null,
    schedulingType: null,
    isInstantEvent: false,
    useBookerTimezone: false,
    restrictionScheduleId: null,
    periodStartDate: null,
    periodEndDate: null,
    recurringEvent: null,
    bookingLimits: null,
    durationLimits: null,
    eventTypeColor: null,
    metadata: {},
    customInputs: [],
    bookingFields: [],
    locations: [],
    owner: user,
    users: [user],
    hosts: [],
    children: [],
    team: null,
    schedule: null,
    restrictionSchedule: null,
    instantMeetingSchedule: null,
    destinationCalendar: null,
    ...overrides,
  };
};

const configureEvent = (event: Record<string, unknown> = buildEvent()): void => {
  mocks.findById.mockResolvedValue(event);
  mocks.findByIdForOrgAdmin.mockResolvedValue(event);
  mocks.findOrganizationById.mockResolvedValue(null);
  mocks.enrichUserWithItsProfile.mockImplementation(({ user }) => ({
    ...user,
    profile: user.profile ?? {
      id: user.id + 100,
      organizationId: null,
      username: user.username,
      upId: `prof-${user.id}`,
    },
    eventTypes: user.eventTypes ?? [],
  }));
  mocks.getBookerBaseUrl.mockResolvedValue("https://book.example.com");
  mocks.getLocationGroupedOptions.mockResolvedValue([]);
  mocks.getTranslation.mockResolvedValue((key: string) => key);
  mocks.getEventTypeAppData.mockReturnValue(null);
  mocks.getBookingFieldsWithSystemFields.mockImplementation(({ bookingFields }) => bookingFields);
  prisma.user.findUnique.mockResolvedValue(null);
  prisma.destinationCalendar.findFirst.mockResolvedValue(null);
};

describe("getRawEventType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReset(prisma);
    configureEvent();
  });

  it("routes platform organization admins to the organization-admin repository method", async () => {
    mocks.findOrganizationById.mockResolvedValue({ isPlatform: true });

    await getRawEventType({
      userId: 7,
      eventTypeId: 10,
      isUserOrganizationAdmin: true,
      currentOrganizationId: 99,
      prisma,
    });

    expect(mocks.findByIdForOrgAdmin).toHaveBeenCalledWith({ id: 10, organizationId: 99 });
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it.each([
    ["non-platform admin", true, 99, { isPlatform: false }],
    ["admin without organization", true, null, null],
    ["plain user", false, null, null],
  ])("uses regular repository access for %s", async (_label, isAdmin, organizationId, organization) => {
    mocks.findOrganizationById.mockResolvedValue(organization);

    await getRawEventType({
      userId: 7,
      eventTypeId: 10,
      isUserOrganizationAdmin: isAdmin,
      currentOrganizationId: organizationId,
      prisma,
    });

    expect(mocks.findById).toHaveBeenCalledWith({ id: 10, userId: 7 });
    expect(mocks.findByIdForOrgAdmin).not.toHaveBeenCalled();
  });
});

describe("getEventTypeById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReset(prisma);
    configureEvent();
  });

  it.each([
    [true, TRPCError],
    [false, Error],
  ])("throws the appropriate not-found error", async (isTrpcCall, ErrorType) => {
    mocks.findById.mockResolvedValue(null);

    const result = getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isTrpcCall,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });

    await expect(result).rejects.toBeInstanceOf(ErrorType);
    if (isTrpcCall) {
      await expect(result).rejects.toMatchObject({ code: "NOT_FOUND" });
    } else {
      await expect(result).rejects.toThrow("Event type not found");
    }
  });

  it("parses metadata, limits, custom inputs, dates, and the giphy app data", async () => {
    const event = buildEvent({
      metadata: { apps: {} },
      recurringEvent: {
        dtstart: new Date("2024-01-01T00:00:00Z"),
        interval: 1,
        count: 2,
        freq: 2,
      },
      bookingLimits: { PER_MONTH: 5 },
      durationLimits: { PER_MONTH: 60 },
      eventTypeColor: { lightEventTypeColor: "#fff", darkEventTypeColor: "#000" },
      customInputs: [
        {
          id: 1,
          eventTypeId: 10,
          label: "Company",
          type: "TEXT",
          required: true,
          placeholder: "Acme",
        },
      ],
      periodStartDate: new Date("2024-01-01T00:00:00Z"),
      periodEndDate: new Date("2024-02-01T00:00:00Z"),
      useBookerTimezone: true,
    });
    configureEvent(event);
    mocks.getEventTypeAppData.mockReturnValue({ enabled: true, thankYouPage: "thanks" });

    const result = await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });

    expect(result.eventType.metadata.apps).toMatchObject({ giphy: { enabled: true } });
    expect(result.eventType.recurringEvent).toEqual(event.recurringEvent);
    expect(result.eventType.bookingLimits).toEqual(event.bookingLimits);
    expect(result.eventType.durationLimits).toEqual(event.durationLimits);
    expect(result.eventType.eventTypeColor).toEqual(event.eventTypeColor);
    expect(result.eventType.customInputs).toEqual(event.customInputs);
    expect(result.eventType.periodStartDate).toBe(new Date("2024-01-01T00:00:00Z").toString());
    expect(result.eventType.periodEndDate).toBe(new Date("2024-02-01T00:00:00Z").toString());
    expect(result.eventType.useBookerTimezone).toBe(true);
    expect(mocks.getBookingFieldsWithSystemFields).toHaveBeenCalledWith(
      expect.objectContaining({ isOrgTeamEvent: false })
    );
  });

  it("uses the event schedule before a personal user's default schedule", async () => {
    const user = buildUser({ defaultScheduleId: 12 });
    const event = buildEvent({
      users: [user],
      owner: user,
      schedule: { id: 22, name: "Event schedule" },
      restrictionSchedule: { name: "Restriction" },
      instantMeetingSchedule: { id: 33 },
      restrictionScheduleId: 44,
    });
    configureEvent(event);

    const result = await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });

    expect(result.eventType.schedule).toBe(22);
    expect(result.eventType.scheduleName).toBe("Event schedule");
    expect(result.eventType.restrictionScheduleName).toBe("Restriction");
    expect(result.eventType.instantMeetingSchedule).toBe(33);
    expect(result.eventType.restrictionScheduleId).toBe(44);
    expect(result.eventType.bookerUrl).toBe("https://book.example.com");
  });

  it("uses a personal user's default schedule but not a team member's default", async () => {
    const user = buildUser({ defaultScheduleId: 12 });
    const personal = buildEvent({ users: [user], owner: user });
    configureEvent(personal);

    const personalResult = await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: 55,
    });
    expect(personalResult.eventType.schedule).toBe(12);
    expect(mocks.getBookerBaseUrl).toHaveBeenCalledWith(55);

    vi.clearAllMocks();
    configureEvent(
      buildEvent({
        teamId: 20,
        userId: null,
        owner: null,
        users: [],
        team: { id: 20, parentId: null, members: [] },
      })
    );
    const teamResult = await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });
    expect(teamResult.eventType.schedule).toBeNull();
  });

  it("maps children, accepted team memberships, current membership, and team booker URL", async () => {
    const owner = buildUser({ id: 1 });
    const member = buildUser({ id: 2, username: null, name: null });
    const child = { id: 30, owner, title: "Child" };
    const team = {
      id: 20,
      parentId: null,
      members: [
        { accepted: true, role: MembershipRole.ADMIN, user: owner },
        { accepted: false, role: MembershipRole.MEMBER, user: member },
      ],
    };
    const event = buildEvent({
      userId: null,
      owner: null,
      users: [owner],
      teamId: 20,
      team,
      children: [child, { id: 31, owner: null }],
    });
    configureEvent(event);
    mocks.getBookerBaseUrl.mockResolvedValue("https://org.example.com");

    const result = await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });

    expect(result.eventType.bookerUrl).toBe("https://org.example.com");
    expect(result.eventType.children).toHaveLength(1);
    expect(result.eventType.children[0]).toMatchObject({
      created: true,
      owner: { name: "Ada Lovelace", username: "ada", membership: MembershipRole.ADMIN },
    });
    expect(result.teamMembers).toHaveLength(1);
    expect(result.teamMembers[0]).toMatchObject({ profileId: 101, eventTypes: ["meeting"] });
    expect(result.currentUserMembership).toBe(team.members[0]);
    expect(mocks.getBookingFieldsWithSystemFields).toHaveBeenCalledWith(
      expect.objectContaining({ isOrgTeamEvent: false })
    );
  });

  it("includes all members for organization teams and returns no members for personal events", async () => {
    const first = buildUser({ id: 1 });
    const second = buildUser({ id: 2 });
    const team = {
      id: 20,
      parentId: 99,
      members: [
        { accepted: true, role: MembershipRole.ADMIN, user: first },
        { accepted: false, role: MembershipRole.MEMBER, user: second },
      ],
    };
    configureEvent(buildEvent({ userId: null, owner: null, users: [first], teamId: 20, team }));

    const teamResult = await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });
    expect(teamResult.teamMembers).toHaveLength(2);
    expect(mocks.getBookingFieldsWithSystemFields).toHaveBeenCalledWith(
      expect.objectContaining({ isOrgTeamEvent: true })
    );

    vi.clearAllMocks();
    configureEvent(buildEvent());
    const personalResult = await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });
    expect(personalResult.teamMembers).toEqual([]);
    expect(personalResult.currentUserMembership).toBeNull();
  });

  it("uses a destination calendar fallback and location options for managed events", async () => {
    const destinationCalendar = { id: 77, userId: 1, eventTypeId: null };
    const event = buildEvent({ schedulingType: SchedulingType.MANAGED, destinationCalendar: null });
    configureEvent(event);
    prisma.destinationCalendar.findFirst.mockResolvedValue(destinationCalendar as never);
    mocks.getLocationGroupedOptions.mockResolvedValue([{ label: "Video", options: [] }]);

    const result = await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
      userLocale: "de",
    });

    expect(prisma.destinationCalendar.findFirst).toHaveBeenCalledWith({
      where: { userId: 1, eventTypeId: null },
    });
    expect(result.destinationCalendar).toBe(destinationCalendar);
    expect(result.locationOptions[0]).toEqual({
      label: "default",
      options: [{ label: "members_default_location", value: "", icon: "/user-check.svg" }],
    });
    expect(mocks.getLocationGroupedOptions).toHaveBeenCalledWith({ userId: 1 }, expect.any(Function));
    expect(mocks.getTranslation).toHaveBeenCalledWith("de", "common");
  });

  it("falls back to the current user's locale and then English", async () => {
    const userWithLocale = buildUser({ locale: "es" });
    configureEvent(buildEvent({ users: [userWithLocale], owner: userWithLocale }));

    await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });
    expect(mocks.getTranslation).toHaveBeenCalledWith("es", "common");

    vi.clearAllMocks();
    const userWithoutLocale = buildUser({ locale: null });
    configureEvent(buildEvent({ users: [userWithoutLocale], owner: userWithoutLocale }));
    await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });
    expect(mocks.getTranslation).toHaveBeenCalledWith("en", "common");
  });

  it("uses team location options and an existing destination calendar", async () => {
    const destinationCalendar = { id: 77 };
    const team = { id: 20, parentId: 99, members: [] };
    const event = buildEvent({
      userId: null,
      owner: null,
      users: [buildUser()],
      teamId: 20,
      team,
      destinationCalendar,
    });
    configureEvent(event);

    const result = await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });

    expect(mocks.getLocationGroupedOptions).toHaveBeenCalledWith({ teamId: 20 }, expect.any(Function));
    expect(prisma.destinationCalendar.findFirst).not.toHaveBeenCalled();
    expect(result.destinationCalendar).toBe(destinationCalendar);
  });

  it("uses the fallback user for legacy userless events and reports missing fallback users", async () => {
    const event = buildEvent({ users: [], owner: null, team: null, teamId: null });
    configureEvent(event);
    const fallbackUser = buildUser({ id: 1 });
    prisma.user.findUnique.mockResolvedValue(fallbackUser as never);

    await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
      })
    );

    vi.clearAllMocks();
    configureEvent(buildEvent({ users: [], owner: null, team: null, teamId: null }));
    prisma.user.findUnique.mockResolvedValue(null);
    const missing = getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });
    await expect(missing).rejects.toThrow("The event type doesn't have user and no fallback user was found");
  });

  it("uses the tRPC not-found error for a missing fallback user", async () => {
    configureEvent(buildEvent({ users: [], owner: null, team: null, teamId: null }));
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      getEventTypeById({
        eventTypeId: 10,
        userId: 1,
        prisma,
        isTrpcCall: true,
        isUserOrganizationAdmin: false,
        currentOrganizationId: null,
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "The event type doesn't have user and no fallback user was found",
    });
  });

  it("throws when a personal event has no current user", async () => {
    const event = buildEvent({ users: [buildUser({ id: 2 })], owner: buildUser({ id: 2 }) });
    configureEvent(event);

    await expect(
      getEventTypeById({
        eventTypeId: 10,
        userId: 1,
        prisma,
        isUserOrganizationAdmin: false,
        currentOrganizationId: null,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
