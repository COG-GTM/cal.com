import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { getRescheduleLink } from "@calcom/lib/CalEventParser";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarEventBuilder } from "./builder";
import { CalendarEventClass } from "./class";

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@calcom/lib/CalEventParser", () => ({
  getRescheduleLink: vi.fn().mockReturnValue("https://cal.local/reschedule/uid"),
}));

const buildUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  email: "organizer@example.com",
  name: "Organizer",
  username: "organizer",
  timeZone: "UTC",
  credentials: [],
  bufferTime: 0,
  destinationCalendar: null,
  locale: "en",
  ...overrides,
});

const buildEventType = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 10,
  users: [buildUser()],
  team: null,
  description: "A test event",
  slug: "test-event",
  teamId: null,
  title: "Test Event",
  length: 30,
  eventName: null,
  schedulingType: null,
  periodType: "UNLIMITED",
  periodStartDate: null,
  periodEndDate: null,
  periodDays: null,
  periodCountCalendarDays: null,
  requiresConfirmation: false,
  userId: 1,
  price: 0,
  currency: "usd",
  metadata: {},
  destinationCalendar: null,
  hideCalendarNotes: false,
  hideCalendarEventDetails: false,
  disableCancelling: false,
  disableRescheduling: false,
  ...overrides,
});

describe("CalendarEventBuilder", () => {
  let builder: CalendarEventBuilder;

  beforeEach(() => {
    builder = new CalendarEventBuilder();
  });

  it("initializes the calendar event via init", () => {
    const props = new CalendarEventClass({
      type: "test",
      title: "Title",
      startTime: "2024-06-12T10:00:00.000Z",
      endTime: "2024-06-12T10:30:00.000Z",
      organizer: { email: "a@b.c", name: "A", timeZone: "UTC", language: {} },
      attendees: [],
    } as unknown as CalendarEvent);
    builder.init(props);
    expect(builder.calendarEvent.title).toBe("Title");
  });

  it("sets the event type", () => {
    const eventType = buildEventType();
    builder.setEventType(eventType as never);
    expect(builder.eventType).toBe(eventType);
  });

  describe("buildEventObjectFromInnerClass", () => {
    it("loads the event type from prisma", async () => {
      prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(buildEventType() as never);
      await builder.buildEventObjectFromInnerClass(10);
      expect(builder.eventType.slug).toBe("test-event");
    });

    it("throws a descriptive error when prisma fails", async () => {
      prismaMock.eventType.findUniqueOrThrow.mockRejectedValue(new Error("not found"));
      await expect(builder.buildEventObjectFromInnerClass(10)).rejects.toThrow(
        "Error while getting eventType"
      );
    });
  });

  describe("buildUsersFromInnerClass", () => {
    it("throws when the event type was not loaded", async () => {
      await expect(builder.buildUsersFromInnerClass()).rejects.toThrow(
        "exec BuildEventObjectFromInnerClass before calling this function"
      );
    });

    it("uses the users from the event type", async () => {
      builder.setEventType(buildEventType() as never);
      await builder.buildUsersFromInnerClass();
      expect(builder.users).toHaveLength(1);
      expect(builder.users[0].username).toBe("organizer");
    });

    it("falls back to the event type owner for pre-relationship-migration events", async () => {
      builder.setEventType(buildEventType({ users: [], userId: 2 }) as never);
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(buildUser({ id: 2 }) as never);
      await builder.buildUsersFromInnerClass();
      expect(builder.users[0].id).toBe(2);
    });

    it("throws when the fallback user does not exist", async () => {
      builder.setEventType(buildEventType({ users: [], userId: 2 }) as never);
      prismaMock.user.findUniqueOrThrow.mockRejectedValue(new Error("not found"));
      await expect(builder.buildUsersFromInnerClass()).rejects.toThrow("getUsersById.users.notFound");
    });
  });

  describe("buildAttendeesList", () => {
    it("combines attendees and team members", async () => {
      builder.init(new CalendarEventClass({ attendees: [{ email: "guest@example.com" }] } as never));
      builder.setUsers([buildUser(), buildUser({ id: 2, username: "member", locale: null })] as never);
      await builder.buildTeamMembers();
      builder.buildAttendeesList();
      expect(builder.attendeesList).toHaveLength(2);
      expect(builder.teamMembers[0]).toMatchObject({ id: 2, locale: "en" });
    });
  });

  describe("buildTeamMembers", () => {
    it("returns an empty list when there are no users", async () => {
      builder.setUsers([]);
      await builder.buildTeamMembers();
      expect(builder.teamMembers).toEqual([]);
    });
  });

  describe("buildUIDCalendarEvent", () => {
    it("throws when users were not built", () => {
      expect(() => builder.buildUIDCalendarEvent()).toThrow("call buildUsers before calling this function");
    });

    it("throws when the organizer has no username", () => {
      builder.setUsers([buildUser({ username: null })] as never);
      expect(() => builder.buildUIDCalendarEvent()).toThrow("Organizer username is required");
    });

    it("generates a uid from the organizer and start time", () => {
      builder.init(new CalendarEventClass({ startTime: "2024-06-12T10:00:00.000Z" } as never));
      builder.setUsers([buildUser()] as never);
      builder.buildUIDCalendarEvent();
      expect(builder.calendarEvent.uid).toEqual(expect.any(String));
    });
  });

  describe("setters", () => {
    it("sets simple calendar event fields", () => {
      builder.setLocation("Berlin");
      builder.setUId("uid-1");
      builder.setDestinationCalendar([]);
      builder.setHideCalendarNotes(true);
      builder.setHideCalendarEventDetails(true);
      builder.setDescription("desc");
      builder.setNotes("notes");
      builder.setCancellationReason("reason");
      expect(builder.calendarEvent).toMatchObject({
        location: "Berlin",
        uid: "uid-1",
        destinationCalendar: [],
        hideCalendarNotes: true,
        hideCalendarEventDetails: true,
        description: "desc",
        additionalNotes: "notes",
        cancellationReason: "reason",
      });
    });
  });

  describe("setUsersFromId", () => {
    it("loads the user by id", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(buildUser({ id: 5 }) as never);
      await builder.setUsersFromId(5);
      expect(builder.users[0].id).toBe(5);
    });

    it("throws when the user does not exist", async () => {
      prismaMock.user.findUniqueOrThrow.mockRejectedValue(new Error("not found"));
      await expect(builder.setUsersFromId(5)).rejects.toThrow("getUsersById.users.notFound");
    });
  });

  describe("buildRescheduleLink", () => {
    it("builds the link from the calendar event", () => {
      builder.buildRescheduleLink();
      expect(builder.rescheduleLink).toBe("https://cal.local/reschedule/uid");
      expect(getRescheduleLink).toHaveBeenCalledWith({
        calEvent: builder.calendarEvent,
        allowRescheduleForCancelledBooking: false,
      });
    });

    it("wraps errors with a descriptive message", () => {
      vi.mocked(getRescheduleLink).mockImplementationOnce(() => {
        throw new Error("no uid");
      });
      expect(() => builder.buildRescheduleLink({ allowRescheduleForCancelledBooking: true })).toThrow(
        "buildRescheduleLink.error: no uid"
      );
    });
  });
});
