import { prisma } from "@calcom/prisma/__mocks__/prisma";
import { getCalendar } from "@calcom/app-store/_utils/getCalendar";
import getCalendarsEvents, {
  getCalendarsEventsWithTimezones,
} from "@calcom/features/calendars/lib/getCalendarsEvents";
import { CalendarAppDelegationCredentialError } from "@calcom/lib/CalendarAppError";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialForCalendarService } from "@calcom/types/Credential";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanIntegrationKeys,
  createEvent,
  getBusyCalendarTimes,
  getCalendarCredentialsWithoutDelegation,
  getConnectedCalendars,
  updateEvent,
} from "./CalendarManager";

vi.mock("@calcom/prisma", () => ({
  prisma,
}));

vi.mock("@calcom/app-store/_utils/getCalendar", () => ({
  getCalendar: vi.fn(),
}));

vi.mock("@calcom/features/calendars/lib/getCalendarsEvents", () => ({
  default: vi.fn(),
  getCalendarsEventsWithTimezones: vi.fn(),
}));

vi.mock("@calcom/lib/constants", () => ({
  ORGANIZER_EMAIL_EXEMPT_DOMAINS: "",
  IS_PRODUCTION: false,
}));

vi.mock("@calcom/app-store/locations", () => ({
  MeetLocationType: "integrations:google:meet",
}));

vi.mock("@calcom/lib/CalEventParser", () => ({
  getRichDescription: vi.fn(() => "Test description"),
  getUid: vi.fn(() => "generated-uid"),
}));

const buildCredential = (
  overrides: Partial<CredentialForCalendarService> = {}
): CredentialForCalendarService =>
  ({
    id: 1,
    type: "google_calendar",
    appId: "google-calendar",
    appName: "Google Calendar",
    userId: 10,
    teamId: null,
    invalid: false,
    key: { access_token: "DONT_MATTER" },
    delegatedToId: null,
    user: { email: "user@example.com" },
    ...overrides,
  }) as CredentialForCalendarService;

const buildCalendarEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    type: "test-event",
    title: "Test Event",
    uid: "event-uid",
    startTime: "2024-01-01T10:00:00Z",
    endTime: "2024-01-01T11:00:00Z",
    organizer: {
      name: "Organizer",
      email: "organizer@example.com",
      timeZone: "UTC",
      language: { translate: (x: string) => x, locale: "en" },
    },
    attendees: [],
    destinationCalendar: null,
    hideOrganizerEmail: false,
    location: null,
    ...overrides,
  }) as unknown as CalendarEvent;

beforeEach(() => {
  vi.mocked(getCalendar).mockReset();
  vi.mocked(getCalendarsEvents).mockReset();
  vi.mocked(getCalendarsEventsWithTimezones).mockReset();
});

describe("cleanIntegrationKeys", () => {
  it("strips credential fields so they never reach the client", () => {
    const cleaned = cleanIntegrationKeys({
      type: "google_calendar",
      title: "Google Calendar",
      credentials: [{ id: 1 }],
      credential: { id: 1 },
    } as Parameters<typeof cleanIntegrationKeys>[0]);

    expect(cleaned).toEqual({ type: "google_calendar", title: "Google Calendar" });
  });
});

describe("getCalendarCredentialsWithoutDelegation", () => {
  it("returns no calendar credentials for an empty credential list", () => {
    expect(getCalendarCredentialsWithoutDelegation([])).toEqual([]);
  });
});

describe("getConnectedCalendars", () => {
  const buildItem = (
    calendarFactory: () => unknown,
    credentialOverrides: Partial<CredentialForCalendarService> = {}
  ) => ({
    integration: { type: "google_calendar", title: "Google Calendar", credential: { id: 1 } },
    credential: buildCredential(credentialOverrides),
    calendar: calendarFactory,
  });

  it("returns the sorted calendars, the primary one and the destination calendar", async () => {
    const listCalendars = vi.fn().mockResolvedValue([
      { externalId: "secondary@example.com", name: "Secondary", readOnly: true },
      { externalId: "primary@example.com", name: "Primary", primary: true, email: "primary@example.com" },
    ]);

    const result = await getConnectedCalendars(
      [buildItem(() => ({ listCalendars }))] as Parameters<typeof getConnectedCalendars>[0],
      [{ externalId: "primary@example.com" }],
      "primary@example.com"
    );

    const [connected] = result.connectedCalendars;
    expect(connected.integration).toEqual({ type: "google_calendar", title: "Google Calendar" });
    expect(connected.calendars).toHaveLength(2);
    expect(connected.primary?.externalId).toBe("primary@example.com");
    expect(connected.calendars?.find((cal) => cal.externalId === "primary@example.com")?.isSelected).toBe(
      true
    );
    expect(connected.calendars?.find((cal) => cal.externalId === "secondary@example.com")?.readOnly).toBe(
      true
    );
    expect(result.destinationCalendar).toMatchObject({
      externalId: "primary@example.com",
      primaryEmail: "primary@example.com",
      integrationTitle: "Google Calendar",
    });
  });

  it("returns only the integration when the app has no calendar factory", async () => {
    const item = { ...buildItem(() => undefined), calendar: undefined };

    const { connectedCalendars, destinationCalendar } = await getConnectedCalendars(
      [item] as unknown as Parameters<typeof getConnectedCalendars>[0],
      []
    );

    expect(connectedCalendars[0]).toEqual({
      integration: { type: "google_calendar", title: "Google Calendar" },
      credentialId: 1,
      delegationCredentialId: null,
    });
    expect(destinationCalendar).toBeUndefined();
  });

  it("reports an error when the calendar instance cannot be built", async () => {
    const { connectedCalendars } = await getConnectedCalendars(
      [buildItem(() => undefined)] as Parameters<typeof getConnectedCalendars>[0],
      []
    );

    expect(connectedCalendars[0].error).toEqual({ message: "Could not get calendar instance" });
  });

  it("reports an error when the app exposes no calendars at all", async () => {
    const { connectedCalendars } = await getConnectedCalendars(
      [buildItem(() => ({ listCalendars: vi.fn().mockResolvedValue([]) }))] as Parameters<
        typeof getConnectedCalendars
      >[0],
      []
    );

    expect(connectedCalendars[0].error).toEqual({ message: "No primary calendar found" });
  });

  it("maps an expired token to a readable error", async () => {
    const { connectedCalendars } = await getConnectedCalendars(
      [
        buildItem(() => ({
          listCalendars: vi.fn().mockRejectedValue(new Error("invalid_grant")),
        })),
      ] as Parameters<typeof getConnectedCalendars>[0],
      []
    );

    expect(connectedCalendars[0].error).toEqual({ message: "Access token expired or revoked" });
  });

  it("surfaces delegation credential errors as-is", async () => {
    const { connectedCalendars } = await getConnectedCalendars(
      [
        buildItem(() => ({
          listCalendars: vi
            .fn()
            .mockRejectedValue(new CalendarAppDelegationCredentialError("delegation is broken")),
        })),
      ] as Parameters<typeof getConnectedCalendars>[0],
      []
    );

    expect(connectedCalendars[0].error?.message).toContain("delegation is broken");
  });

  it("falls back to a generic error for unknown failures", async () => {
    const { connectedCalendars } = await getConnectedCalendars(
      [
        buildItem(() => ({
          listCalendars: vi.fn().mockRejectedValue("boom"),
        })),
      ] as Parameters<typeof getConnectedCalendars>[0],
      []
    );

    expect(connectedCalendars[0].error).toEqual({ message: "Could not get connected calendars" });
  });

  it("ignores connections without calendars when resolving the destination calendar", async () => {
    const { destinationCalendar } = await getConnectedCalendars(
      [buildItem(() => undefined)] as Parameters<typeof getConnectedCalendars>[0],
      [],
      "primary@example.com"
    );

    expect(destinationCalendar).toBeUndefined();
  });
});

describe("getBusyCalendarTimes", () => {
  const credentials = [buildCredential()];

  it("widens the range and flattens the results of every calendar", async () => {
    vi.mocked(getCalendarsEvents).mockResolvedValue([
      [{ start: "2024-01-01T10:00:00Z", end: "2024-01-01T11:00:00Z" }],
      [{ start: "2024-01-02T10:00:00Z", end: "2024-01-02T11:00:00Z" }],
    ]);

    const result = await getBusyCalendarTimes(
      credentials,
      "2024-01-01T00:00:00Z",
      "2024-01-03T00:00:00Z",
      []
    );

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);

    const [, startDate, endDate, , mode] = vi.mocked(getCalendarsEvents).mock.calls[0];
    expect(new Date(startDate).toISOString()).toBe("2023-12-31T13:00:00.000Z");
    expect(new Date(endDate).toISOString()).toBe("2024-01-03T14:00:00.000Z");
    expect(mode).toBe("slots");
  });

  it("uses the timezone aware fetcher when timezones are requested", async () => {
    vi.mocked(getCalendarsEventsWithTimezones).mockResolvedValue([]);

    await getBusyCalendarTimes(
      credentials,
      "2024-01-01T00:00:00Z",
      "2024-01-03T00:00:00Z",
      [],
      "slots",
      true
    );

    expect(getCalendarsEventsWithTimezones).toHaveBeenCalled();
    expect(getCalendarsEvents).not.toHaveBeenCalled();
  });

  it("forwards an explicit fetch mode", async () => {
    vi.mocked(getCalendarsEvents).mockResolvedValue([]);

    await getBusyCalendarTimes(credentials, "2024-01-01T00:00:00Z", "2024-01-03T00:00:00Z", [], "bookings");

    expect(vi.mocked(getCalendarsEvents).mock.calls[0][4]).toBe("bookings");
  });

  it("returns an error placeholder covering the whole range when fetching fails", async () => {
    vi.mocked(getCalendarsEvents).mockRejectedValue(new Error("nope"));

    const result = await getBusyCalendarTimes(
      credentials,
      "2024-01-01T00:00:00Z",
      "2024-01-03T00:00:00Z",
      []
    );

    expect(result.success).toBe(false);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ source: "error-placeholder" });
  });
});

describe("createEvent", () => {
  it("returns the created event and its warnings", async () => {
    const createEventMock = vi.fn().mockResolvedValue({
      uid: "remote-uid",
      iCalUID: "ical-uid",
      additionalInfo: { calWarnings: ["warning"] },
    });
    vi.mocked(getCalendar).mockResolvedValue({ createEvent: createEventMock });

    const result = await createEvent(buildCredential(), buildCalendarEvent(), "external-id");

    expect(result).toMatchObject({
      appName: "Google Calendar",
      type: "google_calendar",
      success: true,
      uid: "generated-uid",
      iCalUID: "ical-uid",
      calWarnings: ["warning"],
      externalId: "external-id",
      credentialId: 1,
    });
  });

  it("passes the external id only for delegation credentials", async () => {
    const createEventMock = vi.fn().mockResolvedValue({ uid: "remote-uid" });
    vi.mocked(getCalendar).mockResolvedValue({ createEvent: createEventMock });

    await createEvent(buildCredential({ delegatedToId: "dc-1" }), buildCalendarEvent(), "external-id");
    expect(createEventMock).toHaveBeenLastCalledWith(expect.anything(), 1, "external-id");

    await createEvent(buildCredential(), buildCalendarEvent(), "external-id");
    expect(createEventMock).toHaveBeenLastCalledWith(expect.anything(), 1, undefined);
  });

  it("hides the notes when the organizer asked for it", async () => {
    const createEventMock = vi.fn().mockResolvedValue({ uid: "remote-uid" });
    vi.mocked(getCalendar).mockResolvedValue({ createEvent: createEventMock });

    await createEvent(buildCredential(), buildCalendarEvent({ hideCalendarNotes: true }));

    expect(createEventMock.mock.calls[0][0].additionalNotes).toBe("Notes have been hidden by the organizer");
  });

  it("marks the result as failed and keeps the app error message", async () => {
    vi.mocked(getCalendar).mockResolvedValue({
      createEvent: vi.fn().mockRejectedValue({ code: 500, calError: "quota exceeded" }),
    });

    const result = await createEvent(buildCredential(), buildCalendarEvent());

    expect(result.success).toBe(false);
    expect(result.calError).toBe("quota exceeded");
    expect(result.createdEvent).toBeUndefined();
  });

  it("swallows a 404 from the calendar app without an error message", async () => {
    vi.mocked(getCalendar).mockResolvedValue({
      createEvent: vi.fn().mockRejectedValue({ code: 404 }),
    });

    const result = await createEvent(buildCredential(), buildCalendarEvent());

    expect(result.success).toBe(false);
    expect(result.calError).toBeUndefined();
  });

  it("falls back to the app id when the credential has no app name", async () => {
    vi.mocked(getCalendar).mockResolvedValue(null);

    const result = await createEvent(
      buildCredential({ appName: null, appId: "google-calendar" }),
      buildCalendarEvent()
    );

    expect(result.appName).toBe("google-calendar");
    expect(result.createdEvent).toBeUndefined();
  });
});

describe("updateEvent", () => {
  it("returns the updated event on success", async () => {
    const updateEventMock = vi
      .fn()
      .mockResolvedValue({ uid: "remote-uid", additionalInfo: { calWarnings: ["late"] } });
    vi.mocked(getCalendar).mockResolvedValue({ updateEvent: updateEventMock });

    const result = await updateEvent(buildCredential(), buildCalendarEvent(), "ref-uid", "external-id");

    expect(updateEventMock).toHaveBeenCalledWith("ref-uid", expect.anything(), "external-id");
    expect(result).toMatchObject({ success: true, uid: "generated-uid", calWarnings: ["late"] });
  });

  it("collects the warnings of every event when the app returns a list", async () => {
    vi.mocked(getCalendar).mockResolvedValue({
      updateEvent: vi.fn().mockResolvedValue([
        { uid: "a", additionalInfo: { calWarnings: ["one"] } },
        { uid: "b", additionalInfo: { calWarnings: ["two"] } },
      ]),
    });

    const result = await updateEvent(buildCredential(), buildCalendarEvent(), "ref-uid", null);

    expect(result.calWarnings).toEqual(["one", "two"]);
  });

  it("reports a failure when the calendar app rejects", async () => {
    vi.mocked(getCalendar).mockResolvedValue({
      updateEvent: vi.fn().mockRejectedValue({ calError: "not found" }),
    });

    const result = await updateEvent(buildCredential(), buildCalendarEvent(), "ref-uid", null);

    expect(result).toMatchObject({ success: false, calError: "not found", calWarnings: [] });
  });

  it("does not call the calendar app without a booking reference", async () => {
    const updateEventMock = vi.fn();
    vi.mocked(getCalendar).mockResolvedValue({ updateEvent: updateEventMock });

    const result = await updateEvent(buildCredential(), buildCalendarEvent(), "", null);

    expect(updateEventMock).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it("hides the notes when the organizer asked for it", async () => {
    const updateEventMock = vi.fn().mockResolvedValue({ uid: "remote-uid" });
    vi.mocked(getCalendar).mockResolvedValue({ updateEvent: updateEventMock });

    await updateEvent(buildCredential(), buildCalendarEvent({ hideCalendarNotes: true }), "ref-uid", null);

    expect(updateEventMock.mock.calls[0][1].additionalNotes).toBe("Notes have been hidden by the organizer");
  });
});
