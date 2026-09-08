import { enrichUsersWithDelegationCredentials } from "@calcom/app-store/delegationCredential";
import type { LuckyUserService } from "@calcom/features/bookings/lib/getLuckyUser";
import { ensureAvailableUsers } from "@calcom/features/bookings/lib/handleNewBooking/ensureAvailableUsers";
import { getEventTypesFromDB } from "@calcom/features/bookings/lib/handleNewBooking/getEventTypesFromDB";
import type { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import type { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import type { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { SchedulingType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { managedEventManualReassignment } from "../managedEventManualReassignment";
import { validateManagedEventReassignment } from "../utils";
import { ManagedEventReassignmentService } from "./ManagedEventReassignmentService";

vi.mock("@calcom/app-store/delegationCredential", () => ({
  enrichUsersWithDelegationCredentials: vi.fn(),
}));
vi.mock("@calcom/features/bookings/lib/handleNewBooking/ensureAvailableUsers", () => ({
  ensureAvailableUsers: vi.fn(),
}));
vi.mock("@calcom/features/bookings/lib/handleNewBooking/getEventTypesFromDB", () => ({
  getEventTypesFromDB: vi.fn(),
}));
vi.mock("@calcom/features/bookings/repositories/BookingRepository", () => ({
  BookingRepository: class {},
}));
vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: class {},
}));
vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {},
}));
vi.mock("../managedEventManualReassignment", () => ({
  managedEventManualReassignment: vi.fn(),
}));
vi.mock("../utils", () => ({
  validateManagedEventReassignment: vi.fn(),
}));

const findByIdForReassignment = vi.fn();
const findByIdWithParent = vi.fn();
const findManyChildEventTypes = vi.fn();
const findManyByIdsWithCredentialsAndSelectedCalendars = vi.fn();
const getLuckyUser = vi.fn();

const bookingRepository = { findByIdForReassignment } as unknown as BookingRepository;
const eventTypeRepository = {
  findByIdWithParent,
  findManyChildEventTypes,
} as unknown as EventTypeRepository;
const userRepository = {
  findManyByIdsWithCredentialsAndSelectedCalendars,
} as unknown as UserRepository;
const luckyUserService = { getLuckyUser } as unknown as LuckyUserService;

const booking = {
  id: 10,
  eventTypeId: 200,
  startTime: new Date("2030-01-01T10:00:00.000Z"),
  endTime: new Date("2030-01-01T10:30:00.000Z"),
};
const currentChild = { id: 200, parentId: 100, userId: 1 };
const parentEventType = {
  id: 100,
  schedulingType: SchedulingType.MANAGED,
  timeZone: "Europe/London",
};
const userA = { id: 2, timeZone: "Asia/Kolkata", schedules: [{ id: 1 }] };
const userB = { id: 3, timeZone: "America/New_York", schedules: [] };

const baseParams = { bookingId: 10, orgId: 5, reassignedById: 1 };

describe("ManagedEventReassignmentService.executeAutoReassignment", () => {
  let service: ManagedEventReassignmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ManagedEventReassignmentService({
      bookingRepository,
      eventTypeRepository,
      userRepository,
      luckyUserService,
    });

    vi.mocked(validateManagedEventReassignment).mockResolvedValue(undefined);
    findByIdForReassignment.mockResolvedValue(booking);
    findByIdWithParent.mockResolvedValue(currentChild);
    vi.mocked(getEventTypesFromDB).mockResolvedValue(
      parentEventType as unknown as Awaited<ReturnType<typeof getEventTypesFromDB>>
    );
    findManyChildEventTypes.mockResolvedValue([{ userId: 2 }, { userId: 3 }, { userId: null }]);
    findManyByIdsWithCredentialsAndSelectedCalendars.mockResolvedValue([userA, userB]);
    vi.mocked(enrichUsersWithDelegationCredentials).mockImplementation(async ({ users }) => users);
    vi.mocked(ensureAvailableUsers).mockImplementation(async (eventType) => eventType.users);
    getLuckyUser.mockImplementation(async ({ availableUsers }) => availableUsers[0]);
    vi.mocked(managedEventManualReassignment).mockResolvedValue({
      newBooking: { id: 11 },
      cancelledBooking: { id: 10 },
    } as unknown as Awaited<ReturnType<typeof managedEventManualReassignment>>);
  });

  it("selects an eligible, available user and delegates to manual reassignment", async () => {
    const result = await service.executeAutoReassignment(baseParams);

    expect(validateManagedEventReassignment).toHaveBeenCalledWith({ bookingId: 10, bookingRepository });
    expect(findByIdForReassignment).toHaveBeenCalledWith(10);
    expect(findByIdWithParent).toHaveBeenCalledWith(200);
    expect(getEventTypesFromDB).toHaveBeenCalledWith(100);
    expect(findManyChildEventTypes).toHaveBeenCalledWith(100, 1);
    expect(findManyByIdsWithCredentialsAndSelectedCalendars).toHaveBeenCalledWith({ userIds: [2, 3] });
    expect(enrichUsersWithDelegationCredentials).toHaveBeenCalledWith({ orgId: 5, users: [userA, userB] });

    expect(ensureAvailableUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 100,
        users: [expect.objectContaining({ id: 2, isFixed: false })],
      }),
      expect.objectContaining({ timeZone: "Europe/London" }),
      expect.anything()
    );
    expect(getLuckyUser).toHaveBeenCalledWith({
      availableUsers: [expect.objectContaining({ id: 2 })],
      eventType: parentEventType,
      allRRHosts: [],
      routingFormResponse: null,
    });
    expect(managedEventManualReassignment).toHaveBeenCalledWith({
      bookingId: 10,
      newUserId: 2,
      orgId: 5,
      reassignReason: "Auto-reassigned to another team member",
      reassignedById: 1,
      emailsEnabled: true,
      isAutoReassignment: true,
    });
    expect(result).toEqual({ newBooking: { id: 11 }, cancelledBooking: { id: 10 } });
  });

  it("forwards a custom reason and emailsEnabled=false", async () => {
    await service.executeAutoReassignment({ ...baseParams, reassignReason: "Sick", emailsEnabled: false });

    expect(managedEventManualReassignment).toHaveBeenCalledWith(
      expect.objectContaining({ reassignReason: "Sick", emailsEnabled: false })
    );
  });

  it("falls back to the first eligible user's timezone, then UTC, when the parent has none", async () => {
    vi.mocked(getEventTypesFromDB).mockResolvedValue({
      ...parentEventType,
      timeZone: null,
    } as unknown as Awaited<ReturnType<typeof getEventTypesFromDB>>);

    await service.executeAutoReassignment(baseParams);
    expect(ensureAvailableUsers).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ timeZone: "Asia/Kolkata" }),
      expect.anything()
    );

    findManyByIdsWithCredentialsAndSelectedCalendars.mockResolvedValue([{ ...userA, timeZone: null }]);
    await service.executeAutoReassignment(baseParams);
    expect(ensureAvailableUsers).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ timeZone: "UTC" }),
      expect.anything()
    );
  });

  it("rethrows validation errors before touching the booking", async () => {
    vi.mocked(validateManagedEventReassignment).mockRejectedValue(new Error("not managed"));

    await expect(service.executeAutoReassignment(baseParams)).rejects.toThrow("not managed");
    expect(findByIdForReassignment).not.toHaveBeenCalled();
  });

  it("throws when the booking is missing", async () => {
    findByIdForReassignment.mockResolvedValue(null);
    await expect(service.executeAutoReassignment(baseParams)).rejects.toThrow(
      "Booking or event type not found"
    );
  });

  it("throws when the booking has no event type", async () => {
    findByIdForReassignment.mockResolvedValue({ ...booking, eventTypeId: null });
    await expect(service.executeAutoReassignment(baseParams)).rejects.toThrow(
      "Booking or event type not found"
    );
  });

  it("throws when the event type is not found or has no parent", async () => {
    findByIdWithParent.mockResolvedValue(null);
    await expect(service.executeAutoReassignment(baseParams)).rejects.toThrow(
      "Booking is not on a managed event type"
    );

    findByIdWithParent.mockResolvedValue({ ...currentChild, parentId: null });
    await expect(service.executeAutoReassignment(baseParams)).rejects.toThrow(
      "Booking is not on a managed event type"
    );
  });

  it("throws when the parent event type cannot be loaded", async () => {
    vi.mocked(getEventTypesFromDB).mockResolvedValue(null);
    await expect(service.executeAutoReassignment(baseParams)).rejects.toThrow("Parent event type not found");
  });

  it("throws when the parent is not a MANAGED event type", async () => {
    vi.mocked(getEventTypesFromDB).mockResolvedValue({
      ...parentEventType,
      schedulingType: SchedulingType.ROUND_ROBIN,
    } as unknown as Awaited<ReturnType<typeof getEventTypesFromDB>>);
    await expect(service.executeAutoReassignment(baseParams)).rejects.toThrow(
      "Parent event type must be a MANAGED type"
    );
  });

  it("throws when no other child event types have users", async () => {
    findManyChildEventTypes.mockResolvedValue([{ userId: null }]);
    await expect(service.executeAutoReassignment(baseParams)).rejects.toThrow(
      "No other users available for reassignment in this managed event"
    );
    expect(findManyByIdsWithCredentialsAndSelectedCalendars).not.toHaveBeenCalled();
  });

  it("throws when none of the candidates have schedules", async () => {
    findManyByIdsWithCredentialsAndSelectedCalendars.mockResolvedValue([
      userB,
      { id: 4, timeZone: "UTC", schedules: undefined },
    ]);
    await expect(service.executeAutoReassignment(baseParams)).rejects.toThrow(
      "No eligible users found for reassignment. All team members must have availability schedules configured."
    );
    expect(ensureAvailableUsers).not.toHaveBeenCalled();
  });

  it("throws when the lucky user service returns nothing", async () => {
    getLuckyUser.mockResolvedValue(null);
    await expect(service.executeAutoReassignment(baseParams)).rejects.toThrow(
      "Failed to select a user for reassignment"
    );
    expect(managedEventManualReassignment).not.toHaveBeenCalled();
  });

  it("propagates availability errors from ensureAvailableUsers", async () => {
    vi.mocked(ensureAvailableUsers).mockRejectedValue(new Error("no_available_users_found_error"));
    await expect(service.executeAutoReassignment(baseParams)).rejects.toThrow(
      "no_available_users_found_error"
    );
    expect(getLuckyUser).not.toHaveBeenCalled();
  });
});
