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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPiiFreeCalendarEvent", () => {
  it("keeps non-PII fields and masks title in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const calEvent = {
      eventTypeId: 1,
      type: "30min",
      startTime: "2024-01-01T10:00:00Z",
      endTime: "2024-01-01T10:30:00Z",
      uid: "abc",
      title: "John <> Jane",
      attendees: [{ email: "secret@example.com" }],
    } as unknown as CalendarEvent;

    const result = getPiiFreeCalendarEvent(calEvent);
    expect(result.title).toBe("PiiFree:true");
    expect(result.uid).toBe("abc");
    expect(result).not.toHaveProperty("attendees");
  });

  it("returns the raw title outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = getPiiFreeCalendarEvent({ title: "John <> Jane" } as unknown as CalendarEvent);
    expect(result.title).toBe("John <> Jane");
  });
});

describe("getPiiFreeBooking", () => {
  it("masks the title but keeps identifiers", () => {
    vi.stubEnv("NODE_ENV", "production");
    const booking = {
      id: 7,
      uid: "uid-7",
      userId: 3,
      startTime: new Date("2024-01-01T10:00:00Z"),
      endTime: new Date("2024-01-01T11:00:00Z"),
      title: "Sensitive title",
    };
    const result = getPiiFreeBooking(booking);
    expect(result).toEqual({ ...booking, title: "PiiFree:true" });
  });
});

describe("getPiiFreeCredential", () => {
  it("replaces key with boolean status and delegatedTo with a boolean", () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = getPiiFreeCredential({
      id: 1,
      type: "zoom_video",
      key: { access_token: "secret" },
      delegatedTo: { id: "delegation" },
    });
    expect(result.key).toBe("PiiFree:true");
    expect(result.delegatedTo).toBe(true);
    expect(result.id).toBe(1);
  });

  it("reports a missing key as false in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = getPiiFreeCredential({ id: 2 });
    expect(result.key).toBe("PiiFree:false");
    expect(result.delegatedTo).toBe(false);
  });
});

describe("getPiiFreeSelectedCalendar", () => {
  it("truncates externalId to 3 characters and booleanizes credentialId", () => {
    const result = getPiiFreeSelectedCalendar({
      integration: "google_calendar",
      userId: 5,
      externalId: "someone@example.com",
      credentialId: 42,
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
  it("masks externalId in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = getPiiFreeDestinationCalendar({
      integration: "office365_calendar",
      userId: 9,
      credentialId: 11,
      externalId: "calendar-id",
    });
    expect(result).toEqual({
      integration: "office365_calendar",
      userId: 9,
      credentialId: 11,
      externalId: "PiiFree:true",
    });
  });
});

describe("getPiiFreeEventType", () => {
  it("only exposes id, schedulingType and seatsPerTimeSlot", () => {
    const result = getPiiFreeEventType({ id: 1, schedulingType: null, seatsPerTimeSlot: 4 });
    expect(result).toEqual({ id: 1, schedulingType: null, seatsPerTimeSlot: 4 });
  });
});

describe("getPiiFreeUser", () => {
  it("sanitizes nested credentials and destinationCalendar", () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = getPiiFreeUser({
      id: 1,
      username: "john",
      timeZone: "Europe/London",
      credentials: [{ id: 2, key: { token: "secret" } }],
      destinationCalendar: {
        id: 3,
        integration: "google_calendar",
        externalId: "ext",
        primaryEmail: null,
        userId: 1,
        eventTypeId: null,
        credentialId: 2,
        delegationCredentialId: null,
        domainWideDelegationCredentialId: null,
        customCalendarReminder: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    expect(result.credentials?.[0].key).toBe("PiiFree:true");
    expect(result.destinationCalendar?.externalId).toBe("PiiFree:true");
    expect(result.username).toBe("john");
  });

  it("passes through a null destinationCalendar and undefined credentials", () => {
    const result = getPiiFreeUser({ id: 1, destinationCalendar: null });
    expect(result.destinationCalendar).toBeNull();
    expect(result.credentials).toBeUndefined();
  });
});
