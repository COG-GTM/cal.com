import {
  sendReassignedEmailsAndSMS,
  sendReassignedScheduledEmailsAndSMS,
  sendReassignedUpdatedEmailsAndSMS,
} from "@calcom/emails/email-manager";
import EventManager from "@calcom/features/bookings/lib/EventManager";
import { getAllCredentialsIncludeServiceAccountKey } from "@calcom/features/bookings/lib/getAllCredentialsForUsersOnEvent/getAllCredentials";
import { getEventTypesFromDB } from "@calcom/features/bookings/lib/handleNewBooking/getEventTypesFromDB";
import type { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import { CalendarEventBuilder } from "@calcom/features/CalendarEventBuilder";
import type { ManagedEventAssignmentReasonService } from "@calcom/features/ee/managed-event-types/reassignment/services/ManagedEventAssignmentReasonRecorder";
import {
  buildNewBookingPlan,
  findTargetChildEventType,
  validateManagedEventReassignment,
} from "@calcom/features/ee/managed-event-types/reassignment/utils";
import { getBookerBaseUrl } from "@calcom/features/ee/organizations/lib/getBookerUrlServer";
import { BookingLocationService } from "@calcom/features/ee/round-robin/lib/bookingLocationService";
import { WorkflowService } from "@calcom/features/ee/workflows/lib/service/WorkflowService";
import { WorkflowRepository } from "@calcom/features/ee/workflows/repositories/WorkflowRepository";
import { getEventTypeService } from "@calcom/features/eventtypes/di/EventTypeService.container";
import type { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import type { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { getVideoCallUrlFromCalEvent } from "@calcom/lib/CalEventParser";
import type { PrismaClient } from "@calcom/prisma";
import { SchedulingType } from "@calcom/prisma/enums";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManagedEventReassignmentType } from "./ManagedEventAssignmentReasonRecorder";
import { ManagedEventManualReassignmentService } from "./ManagedEventManualReassignmentService";

vi.mock("@calcom/app-store/zod-utils", () => ({
  eventTypeAppMetadataOptionalSchema: { parse: vi.fn((apps: unknown) => apps) },
}));
vi.mock("@calcom/emails/email-manager", () => ({
  sendReassignedEmailsAndSMS: vi.fn(),
  sendReassignedScheduledEmailsAndSMS: vi.fn(),
  sendReassignedUpdatedEmailsAndSMS: vi.fn(),
}));
vi.mock("@calcom/features/bookings/lib/EventManager", () => ({
  default: vi.fn(),
}));
vi.mock("@calcom/features/bookings/lib/getAllCredentialsForUsersOnEvent/getAllCredentials", () => ({
  getAllCredentialsIncludeServiceAccountKey: vi.fn(),
}));
vi.mock("@calcom/features/bookings/lib/handleNewBooking/getEventTypesFromDB", () => ({
  getEventTypesFromDB: vi.fn(),
}));
vi.mock("@calcom/features/CalendarEventBuilder", () => ({
  CalendarEventBuilder: vi.fn(),
}));
vi.mock("@calcom/features/ee/billing/credit-service", () => ({
  CreditService: class {
    hasAvailableCredits = vi.fn(async () => true);
  },
}));
vi.mock("@calcom/features/ee/managed-event-types/reassignment/utils", () => ({
  buildNewBookingPlan: vi.fn(),
  findTargetChildEventType: vi.fn(),
  validateManagedEventReassignment: vi.fn(),
}));
vi.mock("@calcom/features/ee/organizations/lib/getBookerUrlServer", () => ({
  getBookerBaseUrl: vi.fn(),
}));
vi.mock("@calcom/features/ee/round-robin/lib/bookingLocationService", () => ({
  BookingLocationService: { getLocationForHost: vi.fn() },
}));
vi.mock("@calcom/features/ee/workflows/lib/service/WorkflowService", () => ({
  WorkflowService: { scheduleWorkflowsForNewBooking: vi.fn() },
}));
vi.mock("@calcom/features/ee/workflows/repositories/WorkflowRepository", () => ({
  WorkflowRepository: { deleteAllWorkflowReminders: vi.fn() },
}));
vi.mock("@calcom/features/eventtypes/di/EventTypeService.container", () => ({
  getEventTypeService: vi.fn(),
}));
vi.mock("@calcom/lib/CalEventParser", () => ({
  getVideoCallUrlFromCalEvent: vi.fn(),
}));
vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn(async (locale: string) => (key: string) => `${locale}:${key}`),
}));

type BuiltEvent = Partial<CalendarEvent> & { additionalInformation?: unknown };

const builderState: {
  built: BuiltEvent | null;
  calls: Record<string, unknown[]>;
} = { built: {}, calls: {} };

function makeBuilder() {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    "withEventType",
    "withLocation",
    "withIdentifiers",
    "withUid",
    "withDestinationCalendar",
    "withTeam",
    "withVideoCallData",
  ]) {
    builder[method] = vi.fn((arg: unknown) => {
      builderState.calls[method] = [...(builderState.calls[method] ?? []), arg];
      return builder;
    });
  }
  builder.build = vi.fn(() => (builderState.built ? { ...builderState.built } : null));
  return builder;
}

const createEvent = vi.fn();
const deleteEventsAndMeetings = vi.fn();
const shouldHideBrandingForEventType = vi.fn(async () => false);

const managedEventReassignmentTransaction = vi.fn();
const findByIdWithAttendeesPaymentAndReferences = vi.fn();
const updateLocationById = vi.fn();
const findByIdWithCredentialsAndCalendar = vi.fn();
const recordReassignment = vi.fn();

const bookingRepository = {
  managedEventReassignmentTransaction,
  findByIdWithAttendeesPaymentAndReferences,
  updateLocationById,
} as unknown as BookingRepository;
const userRepository = { findByIdWithCredentialsAndCalendar } as unknown as UserRepository;
const eventTypeRepository = {} as unknown as EventTypeRepository;
const assignmentReasonService = { recordReassignment } as unknown as ManagedEventAssignmentReasonService;
const prisma = {} as unknown as PrismaClient;

const attendee = { name: "Att", email: "att@example.com", timeZone: "UTC", locale: null };

const originalUser = {
  id: 1,
  name: "Orig",
  username: "orig",
  email: "orig@example.com",
  timeZone: "UTC",
  locale: "de",
  timeFormat: 12,
  metadata: {},
  credentials: [],
  destinationCalendar: null,
};
const newUser = {
  id: 2,
  name: "New",
  username: "new",
  email: "new@example.com",
  timeZone: "Europe/Berlin",
  locale: null,
  timeFormat: 24,
  metadata: {},
  credentials: [],
  destinationCalendar: { id: 1, integration: "google_calendar", externalId: "cal" },
};

const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
const futureEnd = new Date(futureStart.getTime() + 30 * 60 * 1000);

const originalBookingFull = {
  id: 10,
  uid: "orig-uid",
  title: "Original",
  startTime: futureStart,
  endTime: futureEnd,
  location: "integrations:daily",
  iCalUID: "ical-orig",
  metadata: { foo: "bar" },
  references: [{ type: "google_calendar", uid: "ref" }],
  workflowReminders: [{ id: 1 }, { id: 2 }],
  userId: 1,
};

const newBooking = {
  id: 11,
  uid: "new-uid",
  title: "Original",
  description: "desc",
  startTime: futureStart,
  endTime: futureEnd,
  location: null,
  iCalUID: "ical-new",
  iCalSequence: 2,
  smsReminderNumber: "+123",
  metadata: { existing: true },
  responses: { name: "Att" },
  attendees: [attendee],
};

const targetEventType = {
  id: 201,
  slug: "managed-child",
  parentId: 100,
  team: null,
  owner: null,
  workflows: [],
  metadata: { apps: { giphy: {} } },
  locations: [{ type: "integrations:google:meet" }],
  hideOrganizerEmail: false,
  schedulingType: null,
  requiresConfirmation: false,
  seatsPerTimeSlot: null,
  seatsShowAttendees: false,
};
const currentEventType = { ...targetEventType, id: 200, slug: "managed-child-current" };
const parentEventType = { id: 100, schedulingType: SchedulingType.MANAGED };

const baseParams = { bookingId: 10, newUserId: 2, orgId: 5, reassignedById: 1 };

function eventTypeFromDb(value: unknown) {
  return value as Awaited<ReturnType<typeof getEventTypesFromDB>>;
}

describe("ManagedEventManualReassignmentService.execute", () => {
  let service: ManagedEventManualReassignmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    builderState.built = { startTime: futureStart.toISOString(), videoCallData: undefined };
    builderState.calls = {};

    service = new ManagedEventManualReassignmentService({
      prisma,
      bookingRepository,
      userRepository,
      eventTypeRepository,
      assignmentReasonService,
    });

    vi.mocked(validateManagedEventReassignment).mockResolvedValue(undefined);
    vi.mocked(findTargetChildEventType).mockResolvedValue({
      currentChildEventType: { id: 200 },
      targetChildEventType: { id: 201 },
      parentEventType,
      originalBooking: { userId: 1 },
    } as unknown as Awaited<ReturnType<typeof findTargetChildEventType>>);
    vi.mocked(getEventTypesFromDB).mockImplementation(async (id: number) =>
      eventTypeFromDb(id === 200 ? currentEventType : targetEventType)
    );
    const usersById: Record<number, typeof newUser | typeof originalUser> = { 1: originalUser, 2: newUser };
    findByIdWithCredentialsAndCalendar.mockImplementation(
      async ({ userId }: { userId: number }) => usersById[userId] ?? null
    );
    findByIdWithAttendeesPaymentAndReferences.mockResolvedValue(originalBookingFull);
    vi.mocked(buildNewBookingPlan).mockReturnValue({ plan: true } as unknown as ReturnType<
      typeof buildNewBookingPlan
    >);
    managedEventReassignmentTransaction.mockResolvedValue({
      newBooking,
      cancelledBooking: { id: 10 },
    });
    vi.mocked(getAllCredentialsIncludeServiceAccountKey).mockResolvedValue([]);
    vi.mocked(EventManager).mockImplementation(function () {
      return { create: createEvent, deleteEventsAndMeetings } as unknown as EventManager;
    });
    deleteEventsAndMeetings.mockResolvedValue(undefined);
    createEvent.mockResolvedValue({ results: [], referencesToCreate: [] });
    vi.mocked(CalendarEventBuilder).mockImplementation(function () {
      return makeBuilder() as unknown as CalendarEventBuilder;
    });
    vi.mocked(BookingLocationService.getLocationForHost).mockReturnValue({
      bookingLocation: "integrations:google:meet",
      requiresActualLink: false,
      conferenceCredentialId: null,
    });
    vi.mocked(getBookerBaseUrl).mockResolvedValue("https://cal.com");
    vi.mocked(getVideoCallUrlFromCalEvent).mockReturnValue("");
    vi.mocked(WorkflowRepository.deleteAllWorkflowReminders).mockResolvedValue(undefined);
    vi.mocked(WorkflowService.scheduleWorkflowsForNewBooking).mockResolvedValue(undefined);
    vi.mocked(getEventTypeService).mockReturnValue({
      shouldHideBrandingForEventType,
    } as unknown as ReturnType<typeof getEventTypeService>);
    updateLocationById.mockResolvedValue(undefined);
    recordReassignment.mockResolvedValue({ reasonEnum: "REASSIGNED", reasonString: "x" });
  });

  it("performs the full happy path and returns new and cancelled bookings", async () => {
    const result = await service.execute({ ...baseParams, reassignReason: "Out sick" });

    expect(result).toEqual({ newBooking, cancelledBooking: { id: 10 } });
    expect(validateManagedEventReassignment).toHaveBeenCalledWith({ bookingId: 10, bookingRepository });
    expect(findTargetChildEventType).toHaveBeenCalledWith({
      bookingId: 10,
      newUserId: 2,
      bookingRepository,
      eventTypeRepository,
    });
    expect(buildNewBookingPlan).toHaveBeenCalledWith(
      expect.objectContaining({ originalBookingFull, newUser, reassignedById: 1 })
    );
    expect(managedEventReassignmentTransaction).toHaveBeenCalledWith({
      bookingId: 10,
      cancellationReason: "Reassigned to New",
      metadata: { foo: "bar" },
      newBookingPlan: { plan: true },
    });

    expect(deleteEventsAndMeetings).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ uid: "orig-uid", type: "managed-child-current", attendees: [] }),
        bookingReferences: originalBookingFull.references,
      })
    );
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(builderState.calls.withDestinationCalendar).toEqual([[newUser.destinationCalendar]]);
    expect(builderState.calls.withTeam).toBeUndefined();

    expect(updateLocationById).toHaveBeenCalledWith({
      where: { id: 11 },
      data: {
        location: "integrations:google:meet",
        metadata: { existing: true },
        referencesToCreate: [],
        responses: { name: "Att", location: { value: "integrations:google:meet", optionValue: "" } },
        iCalSequence: 3,
      },
    });

    expect(WorkflowRepository.deleteAllWorkflowReminders).toHaveBeenCalledWith(
      originalBookingFull.workflowReminders
    );
    expect(WorkflowService.scheduleWorkflowsForNewBooking).not.toHaveBeenCalled();

    expect(sendReassignedScheduledEmailsAndSMS).toHaveBeenCalledWith(
      expect.objectContaining({
        reassigned: { name: "New", email: "new@example.com", reason: "Out sick", byUser: "Orig" },
      })
    );
    expect(sendReassignedEmailsAndSMS).toHaveBeenCalledWith(
      expect.objectContaining({ reassignedTo: { name: "New", email: "new@example.com" } })
    );
    expect(sendReassignedUpdatedEmailsAndSMS).toHaveBeenCalledWith(
      expect.objectContaining({ showAttendees: false })
    );

    expect(recordReassignment).toHaveBeenCalledWith({
      newBookingId: 11,
      reassignById: 1,
      reassignReason: "Out sick",
      reassignmentType: ManagedEventReassignmentType.MANUAL,
    });
  });

  it("skips emails when disabled and records AUTO reassignment type", async () => {
    await service.execute({ ...baseParams, emailsEnabled: false, isAutoReassignment: true });

    expect(sendReassignedScheduledEmailsAndSMS).not.toHaveBeenCalled();
    expect(sendReassignedEmailsAndSMS).not.toHaveBeenCalled();
    expect(sendReassignedUpdatedEmailsAndSMS).not.toHaveBeenCalled();
    expect(recordReassignment).toHaveBeenCalledWith(
      expect.objectContaining({ reassignmentType: ManagedEventReassignmentType.AUTO })
    );
  });

  it("does not send attendee update emails for past bookings", async () => {
    builderState.built = { startTime: new Date(Date.now() - 60_000).toISOString() };

    await service.execute(baseParams);

    expect(sendReassignedScheduledEmailsAndSMS).toHaveBeenCalled();
    expect(sendReassignedUpdatedEmailsAndSMS).not.toHaveBeenCalled();
  });

  it("uses the email fallback when the new user has no name and passes non-object metadata as undefined", async () => {
    findByIdWithCredentialsAndCalendar.mockImplementation(async ({ userId }: { userId: number }) =>
      userId === 2 ? { ...newUser, name: null, destinationCalendar: null } : originalUser
    );
    findByIdWithAttendeesPaymentAndReferences.mockResolvedValue({ ...originalBookingFull, metadata: null });

    await service.execute(baseParams);

    expect(managedEventReassignmentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ cancellationReason: "Reassigned to new@example.com", metadata: undefined })
    );
    expect(builderState.calls.withDestinationCalendar).toBeUndefined();
  });

  it("schedules workflows for the target event type with team branding data", async () => {
    const teamTarget = {
      ...targetEventType,
      requiresConfirmation: true,
      team: { id: 9, name: "Team", parentId: 5, hideBranding: true, parent: null },
      owner: { id: 2, hideBranding: false, profiles: undefined },
      workflows: [{ workflow: { id: 1 } }, { workflow: { id: 2 } }],
    };
    vi.mocked(getEventTypesFromDB).mockImplementation(async (id: number) =>
      eventTypeFromDb(id === 200 ? currentEventType : teamTarget)
    );
    builderState.built = {
      startTime: futureStart.toISOString(),
      videoCallData: { type: "daily_video", id: "abc", password: "", url: "https://video.example" },
    };

    await service.execute(baseParams);

    expect(builderState.calls.withTeam).toEqual([
      expect.objectContaining({ id: 9, name: "Team", members: [expect.objectContaining({ id: 2 })] }),
    ]);
    expect(getBookerBaseUrl).toHaveBeenCalledWith(5);
    expect(shouldHideBrandingForEventType).toHaveBeenCalledWith(201, {
      team: { hideBranding: true, parent: null },
      owner: { id: 2, hideBranding: false, profiles: [] },
    });
    expect(WorkflowService.scheduleWorkflowsForNewBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        workflows: [{ id: 1 }, { id: 2 }],
        smsReminderNumber: "+123",
        isConfirmedByDefault: false,
        calendarEvent: expect.objectContaining({
          uid: "new-uid",
          bookerUrl: "https://cal.com/new/managed-child",
          metadata: { videoCallUrl: "https://video.example" },
          attendees: [expect.objectContaining({ email: "att@example.com" })],
        }),
      })
    );
    expect(builderState.calls.withVideoCallData).toHaveLength(1);
  });

  it("applies empty-string and locale fallbacks for users and teams with missing fields", async () => {
    findByIdWithCredentialsAndCalendar.mockImplementation(async ({ userId }: { userId: number }) =>
      userId === 2
        ? { ...newUser, name: null, username: null, locale: null }
        : { ...originalUser, name: null, username: null, locale: null }
    );
    vi.mocked(getEventTypesFromDB).mockImplementation(async (id: number) =>
      eventTypeFromDb(
        id === 200
          ? currentEventType
          : {
              ...targetEventType,
              locations: undefined,
              team: { id: null, name: null, parentId: null, hideBranding: false, parent: null },
            }
      )
    );
    managedEventReassignmentTransaction.mockResolvedValue({
      newBooking: {
        ...newBooking,
        description: null,
        iCalUID: null,
        attendees: [{ ...attendee, locale: "fr" }],
      },
      cancelledBooking: { id: 10 },
    });

    await service.execute(baseParams);

    expect(BookingLocationService.getLocationForHost).toHaveBeenCalledWith(
      expect.objectContaining({ eventTypeLocations: [], isManagedEventType: true, isTeamEventType: true })
    );
    expect(builderState.calls.withTeam).toEqual([
      expect.objectContaining({ id: 0, name: "", members: [expect.objectContaining({ name: "" })] }),
    ]);
    expect(builderState.calls.withIdentifiers).toEqual([{ iCalUID: undefined }]);
    expect(deleteEventsAndMeetings).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          organizer: expect.objectContaining({
            name: "",
            language: expect.objectContaining({ locale: "en" }),
          }),
        }),
      })
    );
    expect(sendReassignedScheduledEmailsAndSMS).toHaveBeenCalledWith(
      expect.objectContaining({
        members: [expect.objectContaining({ name: "", username: "" })],
        reassigned: expect.objectContaining({ byUser: undefined }),
      })
    );
    expect(sendReassignedEmailsAndSMS).toHaveBeenCalledWith(
      expect.objectContaining({
        members: [
          expect.objectContaining({
            name: "",
            username: "",
            language: { translate: expect.any(Function), locale: "en" },
          }),
        ],
      })
    );
  });

  it("uses a conference credential id when the host location requires an actual link", async () => {
    vi.mocked(BookingLocationService.getLocationForHost).mockReturnValue({
      bookingLocation: "integrations:zoom",
      requiresActualLink: true,
      conferenceCredentialId: 77,
    });

    await service.execute(baseParams);

    expect(builderState.calls.withLocation?.[0]).toEqual({
      location: "integrations:zoom",
      conferenceCredentialId: 77,
    });
  });

  it("derives video call url and references from calendar results and strips non-positive credentialIds", async () => {
    createEvent.mockResolvedValue({
      results: [
        {
          type: "google_calendar",
          success: true,
          createdEvent: {
            hangoutLink: "https://meet.google.com/x",
            conferenceData: { id: "c" },
            entryPoints: [],
          },
        },
        { type: "zoom_video", success: false, error: "boom" },
      ],
      referencesToCreate: [
        { type: "google_calendar", uid: "a", credentialId: 5 },
        { type: "daily_video", uid: "b", credentialId: -1 },
        { type: "other", uid: "c", credentialId: 0 },
      ],
    });
    vi.mocked(getVideoCallUrlFromCalEvent).mockReturnValue("https://meet.google.com/x");

    await service.execute(baseParams);

    expect(updateLocationById).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { existing: true, videoCallUrl: "https://meet.google.com/x" },
          referencesToCreate: [
            { type: "google_calendar", uid: "a", credentialId: 5 },
            { type: "daily_video", uid: "b" },
            { type: "other", uid: "c" },
          ],
        }),
      })
    );
    expect(sendReassignedScheduledEmailsAndSMS).toHaveBeenCalledWith(
      expect.objectContaining({
        calEvent: expect.objectContaining({
          additionalInformation: expect.objectContaining({ hangoutLink: "https://meet.google.com/x" }),
        }),
      })
    );
  });

  it("falls back to createdEvent.url and the event video url when all integrations failed", async () => {
    createEvent.mockResolvedValue({
      results: [{ type: "google_calendar", success: false, createdEvent: { url: "https://created.url" } }],
    });
    builderState.built = {
      startTime: futureStart.toISOString(),
      videoCallData: { type: "daily_video", id: "abc", password: "", url: "https://evt.url" },
    };
    findByIdWithAttendeesPaymentAndReferences.mockResolvedValue({
      ...originalBookingFull,
      metadata: undefined,
    });
    managedEventReassignmentTransaction.mockResolvedValue({
      newBooking: { ...newBooking, metadata: null, responses: null, iCalSequence: null },
      cancelledBooking: { id: 10 },
    });

    await service.execute(baseParams);

    expect(updateLocationById).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { videoCallUrl: "https://created.url" },
          iCalSequence: 1,
          responses: { location: { value: "integrations:google:meet", optionValue: "" } },
        }),
      })
    );
  });

  it("continues when calendar creation, deletion, workflows, emails and reason recording fail", async () => {
    deleteEventsAndMeetings.mockRejectedValue(new Error("delete failed"));
    createEvent.mockRejectedValue(new Error("create failed"));
    vi.mocked(WorkflowRepository.deleteAllWorkflowReminders).mockRejectedValue(new Error("wf failed"));
    vi.mocked(WorkflowService.scheduleWorkflowsForNewBooking).mockRejectedValue(new Error("schedule failed"));
    vi.mocked(sendReassignedScheduledEmailsAndSMS).mockRejectedValue(new Error("email failed"));
    recordReassignment.mockRejectedValue(new Error("reason failed"));
    vi.mocked(getEventTypesFromDB).mockImplementation(async (id: number) =>
      eventTypeFromDb(id === 200 ? currentEventType : { ...targetEventType, workflows: [{ workflow: {} }] })
    );

    const result = await service.execute(baseParams);

    expect(result.newBooking).toEqual(newBooking);
    expect(updateLocationById).not.toHaveBeenCalled();
    expect(sendReassignedEmailsAndSMS).not.toHaveBeenCalled();
  });

  it("logs and continues when the booking location update fails", async () => {
    updateLocationById.mockRejectedValue(new Error("update failed"));

    await expect(service.execute(baseParams)).resolves.toBeDefined();
    expect(sendReassignedScheduledEmailsAndSMS).toHaveBeenCalled();
  });

  it("handles a builder that fails to produce an event for calendar and email flows", async () => {
    builderState.built = null;

    await expect(service.execute(baseParams)).resolves.toBeDefined();
    expect(createEvent).not.toHaveBeenCalled();
    expect(sendReassignedScheduledEmailsAndSMS).not.toHaveBeenCalled();
  });

  it("rethrows validation failures before resolving entities", async () => {
    vi.mocked(validateManagedEventReassignment).mockRejectedValue(new Error("invalid"));

    await expect(service.execute(baseParams)).rejects.toThrow("invalid");
    expect(findTargetChildEventType).not.toHaveBeenCalled();
  });

  it("throws when event type details fail to load", async () => {
    vi.mocked(getEventTypesFromDB).mockImplementation(async (id: number) =>
      eventTypeFromDb(id === 200 ? currentEventType : null)
    );
    await expect(service.execute(baseParams)).rejects.toThrow("Failed to load event type details");
  });

  it("throws when the new user does not exist", async () => {
    findByIdWithCredentialsAndCalendar.mockResolvedValue(null);
    await expect(service.execute(baseParams)).rejects.toThrow("User 2 not found");
  });

  it("throws when the original user does not exist, defaulting a null userId to 0", async () => {
    vi.mocked(findTargetChildEventType).mockResolvedValue({
      currentChildEventType: { id: 200 },
      targetChildEventType: { id: 201 },
      parentEventType,
      originalBooking: { userId: null },
    } as unknown as Awaited<ReturnType<typeof findTargetChildEventType>>);

    await expect(service.execute(baseParams)).rejects.toThrow("Original booking user not found");
    expect(findByIdWithCredentialsAndCalendar).toHaveBeenCalledWith({ userId: 0 });
  });

  it("throws when the full original booking cannot be found", async () => {
    findByIdWithAttendeesPaymentAndReferences.mockResolvedValue(null);
    await expect(service.execute(baseParams)).rejects.toThrow("Original booking not found");
    expect(managedEventReassignmentTransaction).not.toHaveBeenCalled();
  });

  it("propagates transaction failures", async () => {
    managedEventReassignmentTransaction.mockRejectedValue(new Error("tx failed"));
    await expect(service.execute(baseParams)).rejects.toThrow("tx failed");
    expect(deleteEventsAndMeetings).not.toHaveBeenCalled();
  });
});
