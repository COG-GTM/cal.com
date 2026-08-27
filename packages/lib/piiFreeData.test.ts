import type { DestinationCalendar } from "@calcom/prisma/client";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPiiFreeBooking,
  getPiiFreeCalendarEvent,
  getPiiFreeCredential,
  getPiiFreeDestinationCalendar,
  getPiiFreeEventType,
  getPiiFreeSelectedCalendar,
  getPiiFreeUser,
} from "./piiFreeData";

describe("getPiiFreeCalendarEvent", () => {
  it("keeps non-PII fields and passes title through in non-production", () => {
    const calEvent = {
      eventTypeId: 1,
      type: "30min",
      startTime: "2024-01-01T10:00:00Z",
      endTime: "2024-01-01T10:30:00Z",
      uid: "abc",
      iCalUID: "ical-abc",
      title: "Secret meeting with John",
      attendees: [{ name: "John", email: "john@example.com" }],
      organizer: { name: "Jane", email: "jane@example.com" },
    } as unknown as CalendarEvent;

    const result = getPiiFreeCalendarEvent(calEvent);

    expect(result.eventTypeId).toBe(1);
    expect(result.uid).toBe("abc");
    expect(result.title).toBe("Secret meeting with John");
    expect(result).not.toHaveProperty("attendees");
    expect(result).not.toHaveProperty("organizer");
  });

  describe("in production", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("redacts title to a boolean status", () => {
      vi.stubEnv("NODE_ENV", "production");

      const withTitle = getPiiFreeCalendarEvent({ title: "Secret" } as CalendarEvent);
      const withoutTitle = getPiiFreeCalendarEvent({ title: "" } as CalendarEvent);

      expect(withTitle.title).toBe("PiiFree:true");
      expect(withoutTitle.title).toBe("PiiFree:false");
    });
  });
});

describe("getPiiFreeBooking", () => {
  it("keeps identifiers but not other booking fields", () => {
    const booking = {
      id: 7,
      uid: "uid-7",
      userId: 42,
      startTime: new Date("2024-01-01T10:00:00Z"),
      endTime: new Date("2024-01-01T11:00:00Z"),
      title: "Call with Alice",
    };

    const result = getPiiFreeBooking(booking);

    expect(result).toEqual({
      id: 7,
      uid: "uid-7",
      userId: 42,
      startTime: booking.startTime,
      endTime: booking.endTime,
      title: "Call with Alice",
    });
  });
});

describe("getPiiFreeCredential", () => {
  it("replaces delegatedTo with a boolean and keeps other props", () => {
    const result = getPiiFreeCredential({
      id: 1,
      type: "google_calendar",
      key: { access_token: "secret" },
      delegatedTo: { id: "delegation-1" },
    });

    expect(result.id).toBe(1);
    expect(result.type).toBe("google_calendar");
    expect(result.delegatedTo).toBe(true);
  });

  it("handles missing key and delegatedTo", () => {
    const result = getPiiFreeCredential({ id: 2 });

    expect(result.key).toBeUndefined();
    expect(result.delegatedTo).toBe(false);
  });
});

describe("getPiiFreeSelectedCalendar", () => {
  it("truncates externalId to 3 characters and booleanizes credentialId", () => {
    const result = getPiiFreeSelectedCalendar({
      integration: "google_calendar",
      userId: 5,
      externalId: "someone@example.com",
      credentialId: 99,
    });

    expect(result).toEqual({
      integration: "google_calendar",
      userId: 5,
      externalId: "som",
      credentialId: true,
    });
  });

  it("handles missing externalId and credentialId", () => {
    const result = getPiiFreeSelectedCalendar({});

    expect(result.externalId).toBeUndefined();
    expect(result.credentialId).toBe(false);
  });
});

describe("getPiiFreeDestinationCalendar", () => {
  it("keeps integration metadata", () => {
    const result = getPiiFreeDestinationCalendar({
      integration: "office365_calendar",
      userId: 3,
      credentialId: 12,
      externalId: "calendar@example.com",
    });

    expect(result.integration).toBe("office365_calendar");
    expect(result.userId).toBe(3);
    expect(result.credentialId).toBe(12);
    expect(result.externalId).toBe("calendar@example.com");
  });
});

describe("getPiiFreeEventType", () => {
  it("picks only id, schedulingType and seatsPerTimeSlot", () => {
    const result = getPiiFreeEventType({ id: 10, schedulingType: null, seatsPerTimeSlot: 4 });

    expect(result).toEqual({ id: 10, schedulingType: null, seatsPerTimeSlot: 4 });
  });
});

describe("getPiiFreeUser", () => {
  it("maps credentials and destinationCalendar through PII-free transforms", () => {
    const result = getPiiFreeUser({
      id: 1,
      username: "testuser",
      isFixed: true,
      timeZone: "Europe/London",
      allowDynamicBooking: false,
      defaultScheduleId: 2,
      organizationId: 3,
      credentials: [{ id: 5 }],
      destinationCalendar: {
        id: 9,
        integration: "google_calendar",
        externalId: "cal@example.com",
        userId: 1,
        credentialId: 5,
      } as DestinationCalendar,
    });

    expect(result.username).toBe("testuser");
    expect(result.credentials?.[0].delegatedTo).toBe(false);
    expect(result.destinationCalendar?.integration).toBe("google_calendar");
  });

  it("passes through a nullish destinationCalendar and credentials", () => {
    const result = getPiiFreeUser({ id: 1, destinationCalendar: null });

    expect(result.destinationCalendar).toBeNull();
    expect(result.credentials).toBeUndefined();
  });
});
