import type { AssignmentReasonRepository } from "@calcom/features/assignment-reason/repositories/AssignmentReasonRepository";
import type { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { AssignmentReasonEnum } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ManagedEventAssignmentReasonService,
  ManagedEventReassignmentType,
} from "./ManagedEventAssignmentReasonRecorder";

vi.mock("@calcom/lib/sentryWrapper", () => ({
  withReporting: <T>(fn: T) => fn,
}));

const findByIdWithUsername = vi.fn();
const createAssignmentReason = vi.fn();

const userRepository = { findByIdWithUsername } as unknown as UserRepository;
const assignmentReasonRepository = {
  createAssignmentReason,
} as unknown as AssignmentReasonRepository;

describe("ManagedEventAssignmentReasonService", () => {
  let service: ManagedEventAssignmentReasonService;

  beforeEach(() => {
    vi.clearAllMocks();
    createAssignmentReason.mockResolvedValue(undefined);
    service = new ManagedEventAssignmentReasonService({ userRepository, assignmentReasonRepository });
  });

  it("exposes the reassignment type enum values", () => {
    expect(ManagedEventReassignmentType.MANUAL).toBe("manual");
    expect(ManagedEventReassignmentType.AUTO).toBe("auto");
  });

  it("records a manual reassignment with the reassigner's username and a reason", async () => {
    findByIdWithUsername.mockResolvedValue({ id: 7, username: "alice" });

    const result = await service.recordReassignment({
      newBookingId: 42,
      reassignById: 7,
      reassignReason: "Host unavailable",
      reassignmentType: ManagedEventReassignmentType.MANUAL,
    });

    expect(findByIdWithUsername).toHaveBeenCalledWith(7);
    expect(createAssignmentReason).toHaveBeenCalledWith({
      bookingId: 42,
      reasonEnum: AssignmentReasonEnum.REASSIGNED,
      reasonString: "Manual-reassigned by: alice. Reason: Host unavailable",
    });
    expect(result).toEqual({
      reasonEnum: AssignmentReasonEnum.REASSIGNED,
      reasonString: "Manual-reassigned by: alice. Reason: Host unavailable",
    });
  });

  it("records an auto reassignment without a reason suffix when no reason is given", async () => {
    findByIdWithUsername.mockResolvedValue({ id: 7, username: "bob" });

    const result = await service.recordReassignment({
      newBookingId: 1,
      reassignById: 7,
      reassignmentType: ManagedEventReassignmentType.AUTO,
    });

    expect(result.reasonString).toBe("Auto-reassigned by: bob");
    expect(createAssignmentReason).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 1, reasonString: "Auto-reassigned by: bob" })
    );
  });

  it("falls back to 'team member' when the reassigner cannot be found", async () => {
    findByIdWithUsername.mockResolvedValue(null);

    const result = await service.recordReassignment({
      newBookingId: 3,
      reassignById: 99,
      reassignmentType: ManagedEventReassignmentType.MANUAL,
    });

    expect(result.reasonString).toBe("Manual-reassigned by: team member");
  });

  it("falls back to 'team member' when the reassigner has no username", async () => {
    findByIdWithUsername.mockResolvedValue({ id: 5, username: null });

    const result = await service.recordReassignment({
      newBookingId: 3,
      reassignById: 5,
      reassignReason: "",
      reassignmentType: ManagedEventReassignmentType.AUTO,
    });

    expect(result.reasonString).toBe("Auto-reassigned by: team member");
  });

  it("propagates repository errors", async () => {
    findByIdWithUsername.mockResolvedValue({ id: 5, username: "carol" });
    createAssignmentReason.mockRejectedValue(new Error("db down"));

    await expect(
      service.recordReassignment({
        newBookingId: 3,
        reassignById: 5,
        reassignmentType: ManagedEventReassignmentType.MANUAL,
      })
    ).rejects.toThrow("db down");
  });
});
