import type { TFunction } from "i18next";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { buildCalendarEvent } from "@calcom/lib/test/builder";
import type { DestinationCalendar } from "@calcom/prisma/client";

import generateIcsFile, { GenerateIcsRole } from "./generateIcsFile";
import generateIcsString from "./generateIcsString";

vi.mock("./generateIcsString", () => ({
  default: vi.fn((): string => "ICS_STRING"),
}));

const buildDestinationCalendar = (integration: string): DestinationCalendar[] => [
  {
    id: 1,
    integration,
    externalId: "external-id",
    primaryEmail: null,
    userId: null,
    eventTypeId: null,
    credentialId: null,
    delegationCredentialId: null,
    domainWideDelegationCredentialId: null,
    createdAt: null,
    updatedAt: null,
    customCalendarReminder: null,
  },
];

describe("generateIcsFile", () => {
  beforeEach(() => {
    vi.mocked(generateIcsString).mockClear();
  });

  test("returns the ics attachment with the generated string", () => {
    const calEvent = buildCalendarEvent();

    const icsFile = generateIcsFile({
      calEvent,
      role: GenerateIcsRole.ORGANIZER,
      status: "CONFIRMED",
    });

    expect(icsFile).toEqual({
      filename: "event.ics",
      content: "ICS_STRING",
      method: "REQUEST",
    });
    expect(generateIcsString).toHaveBeenCalledWith({
      event: calEvent,
      status: "CONFIRMED",
      t: undefined,
    });
  });

  test("forwards the translate function to generateIcsString", () => {
    const t = vi.fn() as unknown as TFunction;
    const calEvent = buildCalendarEvent();

    generateIcsFile({
      calEvent,
      role: GenerateIcsRole.ATTENDEE,
      status: "CANCELLED",
      t,
    });

    expect(generateIcsString).toHaveBeenCalledWith({ event: calEvent, status: "CANCELLED", t });
  });

  test("returns null for the organizer when the destination calendar is Office 365", () => {
    const icsFile = generateIcsFile({
      calEvent: buildCalendarEvent({
        destinationCalendar: buildDestinationCalendar("office365_calendar"),
      }),
      role: GenerateIcsRole.ORGANIZER,
      status: "CONFIRMED",
    });

    expect(icsFile).toBeNull();
    expect(generateIcsString).not.toHaveBeenCalled();
  });

  test("still returns an attachment for the attendee when the destination calendar is Office 365", () => {
    const icsFile = generateIcsFile({
      calEvent: buildCalendarEvent({
        destinationCalendar: buildDestinationCalendar("office365_calendar"),
      }),
      role: GenerateIcsRole.ATTENDEE,
      status: "CONFIRMED",
    });

    expect(icsFile?.content).toEqual("ICS_STRING");
  });

  test("returns an attachment for the organizer for other destination calendars", () => {
    const icsFile = generateIcsFile({
      calEvent: buildCalendarEvent({
        destinationCalendar: buildDestinationCalendar("google_calendar"),
      }),
      role: GenerateIcsRole.ORGANIZER,
      status: "CONFIRMED",
    });

    expect(icsFile?.content).toEqual("ICS_STRING");
  });
});
