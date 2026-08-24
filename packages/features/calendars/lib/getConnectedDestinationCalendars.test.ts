import { prisma } from "@calcom/prisma/__mocks__/prisma";
import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserWithCalendars } from "./getConnectedDestinationCalendars";
import { getConnectedDestinationCalendarsAndEnsureDefaultsInDb } from "./getConnectedDestinationCalendars";

const getConnectedCalendars = vi.fn();
const getCalendarCredentials = vi.fn(() => []);
const cleanIntegrationKeys = vi.fn((integration: unknown) => integration);
const createIfNotExistsForUser = vi.fn();
const createIfNotExists = vi.fn();
const enrichUserWithDelegationCredentialsIncludeServiceAccountKey = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma,
  default: prisma,
}));

vi.mock("@calcom/features/calendars/lib/CalendarManager", () => ({
  getConnectedCalendars: (...args: unknown[]) => getConnectedCalendars(...args),
  getCalendarCredentials: (...args: unknown[]) => getCalendarCredentials(...args),
  cleanIntegrationKeys: (...args: unknown[]) => cleanIntegrationKeys(...args),
}));

vi.mock("@calcom/features/calendars/repositories/DestinationCalendarRepository", () => ({
  DestinationCalendarRepository: {
    createIfNotExistsForUser: (...args: unknown[]) => createIfNotExistsForUser(...args),
  },
}));

vi.mock("@calcom/features/selectedCalendar/repositories/SelectedCalendarRepository", () => ({
  SelectedCalendarRepository: {
    createIfNotExists: (...args: unknown[]) => createIfNotExists(...args),
  },
}));

vi.mock("@calcom/app-store/delegationCredential", () => ({
  enrichUserWithDelegationCredentialsIncludeServiceAccountKey: (...args: unknown[]) =>
    enrichUserWithDelegationCredentialsIncludeServiceAccountKey(...args),
}));

const buildSelectedCalendar = (overrides: { externalId: string; eventTypeId?: number | null }) => ({
  id: `sc-${overrides.externalId}`,
  externalId: overrides.externalId,
  integration: "google_calendar",
  eventTypeId: overrides.eventTypeId ?? null,
  updatedAt: new Date("2024-01-01T00:00:00Z"),
  googleChannelId: null,
});

const buildUser = (overrides: Partial<UserWithCalendars> = {}): UserWithCalendars => ({
  id: 1,
  email: "user@example.com",
  allSelectedCalendars: [],
  userLevelSelectedCalendars: [],
  destinationCalendar: null,
  ...overrides,
});

const buildConnectedCalendar = ({
  slug = "google-calendar",
  primaryExternalId = "primary@example.com",
  isSelected = false,
  delegationCredentialId = null,
  credentialId = 1,
}: {
  slug?: string;
  primaryExternalId?: string;
  isSelected?: boolean;
  delegationCredentialId?: string | null;
  credentialId?: number;
} = {}) => ({
  integration: { slug, type: "google_calendar" },
  credentialId,
  delegationCredentialId,
  primary: {
    externalId: primaryExternalId,
    integration: "google_calendar",
    email: primaryExternalId,
    credentialId,
    delegationCredentialId,
  },
  calendars: [
    {
      externalId: primaryExternalId,
      integration: "google_calendar",
      isSelected,
      readOnly: false,
      credentialId,
    },
  ],
});

describe("getConnectedDestinationCalendarsAndEnsureDefaultsInDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.credential.findMany.mockResolvedValue([]);
    enrichUserWithDelegationCredentialsIncludeServiceAccountKey.mockImplementation(
      async ({ user }: { user: { credentials: unknown[] } }) => ({ credentials: user.credentials })
    );
    getConnectedCalendars.mockResolvedValue({ connectedCalendars: [], destinationCalendar: undefined });
  });

  const run = (args: {
    user: UserWithCalendars;
    onboarding?: boolean;
    skipSync?: boolean;
    eventTypeId?: number | null;
  }) =>
    getConnectedDestinationCalendarsAndEnsureDefaultsInDb({
      onboarding: false,
      eventTypeId: null,
      prisma: prisma as unknown as PrismaClient,
      ...args,
    });

  it("deletes the destination calendar when there are no connected calendars", async () => {
    const user = buildUser({
      destinationCalendar: { id: 1, userId: 1, integration: "google_calendar", externalId: "a" },
    });

    const result = await run({ user });

    expect(prisma.destinationCalendar.delete).toHaveBeenCalledWith({ where: { userId: 1 } });
    expect(result.connectedCalendars).toEqual([]);
  });

  it("does not delete anything when there is neither a connected nor a destination calendar", async () => {
    await run({ user: buildUser() });

    expect(prisma.destinationCalendar.delete).not.toHaveBeenCalled();
  });

  it("creates a default destination calendar and selects it during onboarding", async () => {
    const connectedCalendar = buildConnectedCalendar();
    getConnectedCalendars.mockResolvedValue({
      connectedCalendars: [connectedCalendar],
      destinationCalendar: undefined,
    });
    createIfNotExistsForUser.mockResolvedValue({
      id: 5,
      userId: 1,
      integration: "google_calendar",
      externalId: "primary@example.com",
    });

    const result = await run({ user: buildUser(), onboarding: true });

    expect(createIfNotExistsForUser).toHaveBeenCalledWith({
      userId: 1,
      integration: "google_calendar",
      externalId: "primary@example.com",
      primaryEmail: "primary@example.com",
      credentialId: 1,
    });
    expect(result.connectedCalendars[0].calendars?.[0].isSelected).toBe(true);
    expect(createIfNotExists).toHaveBeenCalledWith({
      userId: 1,
      integration: "google_calendar",
      externalId: "primary@example.com",
      eventTypeId: null,
    });
  });

  it("stores the delegation credential id instead of the credential id for delegation credentials", async () => {
    getConnectedCalendars.mockResolvedValue({
      connectedCalendars: [buildConnectedCalendar({ credentialId: -1, delegationCredentialId: "dc-1" })],
      destinationCalendar: undefined,
    });
    createIfNotExistsForUser.mockResolvedValue({ id: 6 });

    await run({ user: buildUser() });

    expect(createIfNotExistsForUser).toHaveBeenCalledWith(
      expect.objectContaining({ delegationCredentialId: "dc-1" })
    );
    expect(createIfNotExistsForUser).toHaveBeenCalledWith(expect.not.objectContaining({ credentialId: -1 }));
    expect(createIfNotExists).not.toHaveBeenCalled();
  });

  it("updates the destination calendar when it is not among the connected calendars", async () => {
    getConnectedCalendars.mockResolvedValue({
      connectedCalendars: [buildConnectedCalendar()],
      destinationCalendar: undefined,
    });
    prisma.destinationCalendar.update.mockResolvedValue({
      id: 3,
      userId: 1,
      integration: "google_calendar",
      externalId: "primary@example.com",
    });

    const user = buildUser({
      destinationCalendar: {
        id: 3,
        userId: 1,
        integration: "google_calendar",
        externalId: "stale@example.com",
      },
    });

    await run({ user, onboarding: true });

    expect(prisma.destinationCalendar.update).toHaveBeenCalledWith({
      where: { userId: 1 },
      data: {
        integration: "google_calendar",
        externalId: "primary@example.com",
        primaryEmail: "primary@example.com",
      },
    });
    expect(createIfNotExists).toHaveBeenCalled();
  });

  it("marks an existing destination calendar as selected during onboarding", async () => {
    const connectedCalendar = buildConnectedCalendar();
    getConnectedCalendars.mockResolvedValue({
      connectedCalendars: [connectedCalendar],
      destinationCalendar: undefined,
    });

    const user = buildUser({
      destinationCalendar: {
        id: 3,
        userId: 1,
        integration: "google_calendar",
        externalId: "primary@example.com",
      },
    });

    const result = await run({ user, onboarding: true });

    expect(prisma.destinationCalendar.update).not.toHaveBeenCalled();
    expect(result.connectedCalendars[0].calendars?.[0].isSelected).toBe(true);
    expect(createIfNotExists).toHaveBeenCalledWith({
      userId: 1,
      integration: "google_calendar",
      externalId: "primary@example.com",
      eventTypeId: null,
    });
  });

  it("leaves an already selected destination calendar untouched", async () => {
    getConnectedCalendars.mockResolvedValue({
      connectedCalendars: [buildConnectedCalendar({ isSelected: true })],
      destinationCalendar: undefined,
    });

    await run({
      user: buildUser({
        destinationCalendar: {
          id: 3,
          userId: 1,
          integration: "google_calendar",
          externalId: "primary@example.com",
        },
      }),
      onboarding: true,
    });

    expect(createIfNotExists).not.toHaveBeenCalled();
  });

  it("filters the event type scoped selected calendars when an eventTypeId is given", async () => {
    const userLevel = buildSelectedCalendar({ externalId: "user@example.com" });
    const eventTypeLevel = buildSelectedCalendar({ externalId: "event@example.com", eventTypeId: 7 });

    await run({
      user: buildUser({
        allSelectedCalendars: [userLevel, eventTypeLevel],
        userLevelSelectedCalendars: [userLevel],
      }),
      eventTypeId: 7,
    });

    expect(getConnectedCalendars).toHaveBeenCalledWith(expect.anything(), [eventTypeLevel], undefined);
  });

  it("builds connected calendars from credentials without syncing when skipSync is set", async () => {
    const userLevel = buildSelectedCalendar({ externalId: "user@example.com" });
    getCalendarCredentials.mockReturnValue([
      {
        integration: { slug: "google-calendar", type: "google_calendar" },
        credential: {
          id: 11,
          delegationCredentialId: null,
          selectedCalendars: [{ id: userLevel.id }],
        },
      },
    ]);

    const result = await run({
      user: buildUser({
        allSelectedCalendars: [userLevel],
        userLevelSelectedCalendars: [userLevel],
        destinationCalendar: {
          id: 3,
          userId: 1,
          integration: "google_calendar",
          externalId: "user@example.com",
        },
      }),
      skipSync: true,
    });

    expect(getConnectedCalendars).not.toHaveBeenCalled();
    expect(cleanIntegrationKeys).toHaveBeenCalled();
    expect(result.connectedCalendars).toHaveLength(1);
    expect(result.connectedCalendars[0].calendars?.[0]).toMatchObject({
      externalId: "user@example.com",
      isSelected: true,
      readOnly: false,
      credentialId: 11,
    });
  });

  it("hides the non delegated connection when a delegated one exists for the same app and user", async () => {
    getCalendarCredentials.mockReturnValue([]);
    getConnectedCalendars.mockResolvedValue({
      connectedCalendars: [
        buildConnectedCalendar({ primaryExternalId: "user@example.com", credentialId: 1 }),
        buildConnectedCalendar({
          primaryExternalId: "user@example.com",
          credentialId: 2,
          delegationCredentialId: "dc-1",
        }),
      ],
      destinationCalendar: undefined,
    });

    const result = await run({
      user: buildUser({
        destinationCalendar: {
          id: 3,
          userId: 1,
          integration: "google_calendar",
          externalId: "user@example.com",
        },
      }),
    });

    expect(result.connectedCalendars).toHaveLength(1);
    expect(result.connectedCalendars[0].delegationCredentialId).toBe("dc-1");
  });

  it("keeps non delegated connections belonging to other emails or other apps", async () => {
    getCalendarCredentials.mockReturnValue([]);
    getConnectedCalendars.mockResolvedValue({
      connectedCalendars: [
        buildConnectedCalendar({ primaryExternalId: "other@example.com", credentialId: 1 }),
        buildConnectedCalendar({
          primaryExternalId: "user@example.com",
          credentialId: 2,
          delegationCredentialId: "dc-1",
        }),
        buildConnectedCalendar({ slug: "office365-calendar", credentialId: 3 }),
      ],
      destinationCalendar: undefined,
    });

    const result = await run({
      user: buildUser({
        destinationCalendar: {
          id: 3,
          userId: 1,
          integration: "google_calendar",
          externalId: "user@example.com",
        },
      }),
    });

    expect(result.connectedCalendars).toHaveLength(3);
  });

  it("merges the synced destination calendar details without its id and userId", async () => {
    getConnectedCalendars.mockResolvedValue({
      connectedCalendars: [buildConnectedCalendar({ isSelected: true })],
      destinationCalendar: {
        id: 99,
        userId: 99,
        externalId: "primary@example.com",
        integration: "google_calendar",
        name: "Primary",
        primary: true,
        readOnly: false,
      },
    });

    const result = await run({
      user: buildUser({
        destinationCalendar: {
          id: 3,
          userId: 1,
          integration: "google_calendar",
          externalId: "primary@example.com",
        },
      }),
    });

    expect(result.destinationCalendar).toMatchObject({
      id: 3,
      userId: 1,
      name: "Primary",
      primary: true,
      readOnly: false,
    });
  });
});
