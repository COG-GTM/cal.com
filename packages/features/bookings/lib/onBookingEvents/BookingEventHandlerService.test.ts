import type { AcceptedAuditData } from "@calcom/features/booking-audit/lib/actions/AcceptedAuditActionService";
import type { CancelledAuditData } from "@calcom/features/booking-audit/lib/actions/CancelledAuditActionService";
import type { CreatedAuditData } from "@calcom/features/booking-audit/lib/actions/CreatedAuditActionService";
import type { RejectedAuditData } from "@calcom/features/booking-audit/lib/actions/RejectedAuditActionService";
import type { RescheduledAuditData } from "@calcom/features/booking-audit/lib/actions/RescheduledAuditActionService";
import type { Actor, BookingAuditContext } from "@calcom/features/booking-audit/lib/dto/types";
import type { BookingAuditProducerService } from "@calcom/features/booking-audit/lib/service/BookingAuditProducerService.interface";
import type { ISimpleLogger } from "@calcom/features/di/shared/services/logger.service";
import type { HashedLinkService } from "@calcom/features/hashedLink/lib/service/HashedLinkService";
import { BookingStatus } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingEventHandlerService } from "./BookingEventHandlerService";
import type { BookingCreatedPayload, BookingRescheduledPayload } from "./types";

const actor: Actor = { identifiedBy: "user", userUuid: "user-uuid" };
const context: BookingAuditContext = { impersonatedBy: "admin-uuid" };

const baseParams = {
  actor,
  organizationId: 42,
  source: "WEBAPP" as const,
  operationId: "op-1",
  context,
  isBookingAuditEnabled: true,
};

const createdAuditData = { auditData: "created" } as unknown as CreatedAuditData;
const rescheduledAuditData = { auditData: "rescheduled" } as unknown as RescheduledAuditData;

function makeCreatedPayload(overrides: Partial<BookingCreatedPayload> = {}): BookingCreatedPayload {
  return {
    config: { isDryRun: false },
    bookingFormData: { hashedLink: "hashed-link" },
    booking: {
      uid: "booking-uid",
      startTime: new Date("2026-01-01T10:00:00Z"),
      endTime: new Date("2026-01-01T11:00:00Z"),
      status: BookingStatus.ACCEPTED,
      userId: 1,
    },
    organizationId: 42,
    ...overrides,
  };
}

function makeRescheduledPayload(
  overrides: Partial<BookingRescheduledPayload> = {}
): BookingRescheduledPayload {
  return {
    ...makeCreatedPayload(),
    oldBooking: {
      uid: "old-booking-uid",
      startTime: new Date("2025-12-31T10:00:00Z"),
      endTime: new Date("2025-12-31T11:00:00Z"),
    },
    ...overrides,
  };
}

function buildService() {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ISimpleLogger;
  const hashedLinkService = {
    validateAndIncrementUsage: vi.fn().mockResolvedValue(undefined),
  } as unknown as HashedLinkService;
  const bookingAuditProducerService = {
    queueCreatedAudit: vi.fn().mockResolvedValue(undefined),
    queueRescheduledAudit: vi.fn().mockResolvedValue(undefined),
    queueAcceptedAudit: vi.fn().mockResolvedValue(undefined),
    queueCancelledAudit: vi.fn().mockResolvedValue(undefined),
    queueRescheduleRequestedAudit: vi.fn().mockResolvedValue(undefined),
    queueAttendeeAddedAudit: vi.fn().mockResolvedValue(undefined),
    queueNoShowUpdatedAudit: vi.fn().mockResolvedValue(undefined),
    queueRejectedAudit: vi.fn().mockResolvedValue(undefined),
    queueAttendeeRemovedAudit: vi.fn().mockResolvedValue(undefined),
    queueReassignmentAudit: vi.fn().mockResolvedValue(undefined),
    queueLocationChangedAudit: vi.fn().mockResolvedValue(undefined),
    queueSeatBookedAudit: vi.fn().mockResolvedValue(undefined),
    queueSeatRescheduledAudit: vi.fn().mockResolvedValue(undefined),
    queueBulkAcceptedAudit: vi.fn().mockResolvedValue(undefined),
    queueBulkCancelledAudit: vi.fn().mockResolvedValue(undefined),
    queueBulkCreatedAudit: vi.fn().mockResolvedValue(undefined),
    queueBulkRescheduledAudit: vi.fn().mockResolvedValue(undefined),
    queueBulkRejectedAudit: vi.fn().mockResolvedValue(undefined),
  } as unknown as BookingAuditProducerService;

  const service = new BookingEventHandlerService({ log, hashedLinkService, bookingAuditProducerService });
  return {
    service,
    log: vi.mocked(log),
    hashedLinkService: vi.mocked(hashedLinkService),
    producer: vi.mocked(bookingAuditProducerService),
  };
}

const expectedSingleAudit = <T>(data: T) => ({
  bookingUid: "booking-uid",
  actor,
  organizationId: 42,
  source: "WEBAPP",
  operationId: "op-1",
  data,
  context,
  isBookingAuditEnabled: true,
});

describe("BookingEventHandlerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("onBookingCreated", () => {
    it("increments hashed link usage and queues created audit", async () => {
      const { service, hashedLinkService, producer, log } = buildService();
      const payload = makeCreatedPayload();

      await service.onBookingCreated({ ...baseParams, payload, auditData: createdAuditData });

      expect(log.debug).toHaveBeenCalledWith("onBookingCreated", expect.any(String));
      expect(hashedLinkService.validateAndIncrementUsage).toHaveBeenCalledWith("hashed-link");
      expect(producer.queueCreatedAudit).toHaveBeenCalledTimes(1);
      expect(producer.queueCreatedAudit).toHaveBeenCalledWith(expectedSingleAudit(createdAuditData));
    });

    it("does nothing when the booking flow is a dry run", async () => {
      const { service, hashedLinkService, producer } = buildService();
      const payload = makeCreatedPayload({ config: { isDryRun: true } });

      await service.onBookingCreated({ ...baseParams, payload, auditData: createdAuditData });

      expect(hashedLinkService.validateAndIncrementUsage).not.toHaveBeenCalled();
      expect(producer.queueCreatedAudit).not.toHaveBeenCalled();
    });

    it("skips hashed link update when no hashed link was used", async () => {
      const { service, hashedLinkService, producer } = buildService();
      const payload = makeCreatedPayload({ bookingFormData: { hashedLink: null } });

      await service.onBookingCreated({ ...baseParams, payload, auditData: createdAuditData });

      expect(hashedLinkService.validateAndIncrementUsage).not.toHaveBeenCalled();
      expect(producer.queueCreatedAudit).toHaveBeenCalledTimes(1);
    });

    it("logs and swallows hashed link errors, still queueing the audit", async () => {
      const { service, hashedLinkService, producer, log } = buildService();
      hashedLinkService.validateAndIncrementUsage.mockRejectedValueOnce(new Error("link exhausted"));
      const payload = makeCreatedPayload();

      await expect(
        service.onBookingCreated({ ...baseParams, payload, auditData: createdAuditData })
      ).resolves.toBeUndefined();

      expect(log.error).toHaveBeenCalledWith(
        "Error while updating hashed link",
        expect.stringContaining("link exhausted")
      );
      expect(producer.queueCreatedAudit).toHaveBeenCalledTimes(1);
    });

    it("propagates errors thrown by the audit producer", async () => {
      const { service, producer } = buildService();
      producer.queueCreatedAudit.mockRejectedValueOnce(new Error("queue down"));

      await expect(
        service.onBookingCreated({
          ...baseParams,
          payload: makeCreatedPayload(),
          auditData: createdAuditData,
        })
      ).rejects.toThrow("queue down");
    });

    it("passes through undefined optional operationId and context", async () => {
      const { service, producer } = buildService();

      await service.onBookingCreated({
        payload: makeCreatedPayload({ organizationId: null }),
        actor,
        auditData: createdAuditData,
        source: "API_V2",
        isBookingAuditEnabled: false,
      });

      expect(producer.queueCreatedAudit).toHaveBeenCalledWith({
        bookingUid: "booking-uid",
        actor,
        organizationId: null,
        source: "API_V2",
        operationId: undefined,
        data: createdAuditData,
        context: undefined,
        isBookingAuditEnabled: false,
      });
    });
  });

  describe("onBookingRescheduled", () => {
    it("queues rescheduled audit against the old booking uid", async () => {
      const { service, hashedLinkService, producer, log } = buildService();
      const payload = makeRescheduledPayload();

      await service.onBookingRescheduled({ ...baseParams, payload, auditData: rescheduledAuditData });

      expect(log.debug).toHaveBeenCalledWith("onBookingRescheduled", expect.any(String));
      expect(hashedLinkService.validateAndIncrementUsage).toHaveBeenCalledWith("hashed-link");
      expect(producer.queueRescheduledAudit).toHaveBeenCalledWith({
        ...expectedSingleAudit(rescheduledAuditData),
        bookingUid: "old-booking-uid",
      });
    });

    it("does nothing when the booking flow is a dry run", async () => {
      const { service, hashedLinkService, producer } = buildService();
      const payload = makeRescheduledPayload({ config: { isDryRun: true } });

      await service.onBookingRescheduled({ ...baseParams, payload, auditData: rescheduledAuditData });

      expect(hashedLinkService.validateAndIncrementUsage).not.toHaveBeenCalled();
      expect(producer.queueRescheduledAudit).not.toHaveBeenCalled();
    });

    it("logs hashed link errors without failing the reschedule", async () => {
      const { service, hashedLinkService, producer, log } = buildService();
      hashedLinkService.validateAndIncrementUsage.mockRejectedValueOnce(new Error("boom"));

      await service.onBookingRescheduled({
        ...baseParams,
        payload: makeRescheduledPayload(),
        auditData: rescheduledAuditData,
      });

      expect(log.error).toHaveBeenCalledWith(
        "Error while updating hashed link",
        expect.stringContaining("boom")
      );
      expect(producer.queueRescheduledAudit).toHaveBeenCalledTimes(1);
    });
  });

  describe("single booking audit events", () => {
    const cases = [
      ["onBookingAccepted", "queueAcceptedAudit"],
      ["onBookingCancelled", "queueCancelledAudit"],
      ["onRescheduleRequested", "queueRescheduleRequestedAudit"],
      ["onAttendeeAdded", "queueAttendeeAddedAudit"],
      ["onNoShowUpdated", "queueNoShowUpdatedAudit"],
      ["onBookingRejected", "queueRejectedAudit"],
      ["onAttendeeRemoved", "queueAttendeeRemovedAudit"],
      ["onReassignment", "queueReassignmentAudit"],
      ["onLocationChanged", "queueLocationChangedAudit"],
      ["onSeatBooked", "queueSeatBookedAudit"],
      ["onSeatRescheduled", "queueSeatRescheduledAudit"],
    ] as const;

    it.each(cases)("%s forwards params to %s", async (method, producerMethod) => {
      const { service, producer } = buildService();
      const auditData = { auditData: method } as unknown as never;

      await service[method]({ ...baseParams, bookingUid: "booking-uid", auditData });

      expect(producer[producerMethod]).toHaveBeenCalledTimes(1);
      expect(producer[producerMethod]).toHaveBeenCalledWith(expectedSingleAudit(auditData));
    });

    const rethrowing = cases.filter(([method]) => method !== "onLocationChanged");

    it.each(rethrowing)("%s propagates producer errors", async (method, producerMethod) => {
      const { service, producer } = buildService();
      producer[producerMethod].mockRejectedValueOnce(new Error(`${producerMethod} failed`));

      await expect(
        service[method]({ ...baseParams, bookingUid: "booking-uid", auditData: {} as unknown as never })
      ).rejects.toThrow(`${producerMethod} failed`);
    });

    it("onLocationChanged logs and swallows producer errors", async () => {
      const { service, producer, log } = buildService();
      producer.queueLocationChangedAudit.mockRejectedValueOnce(new Error("location failed"));

      await expect(
        service.onLocationChanged({
          ...baseParams,
          bookingUid: "booking-uid",
          auditData: {} as unknown as never,
        })
      ).resolves.toBeUndefined();

      expect(log.error).toHaveBeenCalledWith(
        "Error while onLocationChanged",
        expect.stringContaining("location failed")
      );
    });
  });

  describe("bulk booking audit events", () => {
    const bookings = [
      { bookingUid: "uid-1", auditData: { n: 1 } },
      { bookingUid: "uid-2", auditData: { n: 2 } },
    ];
    const expectedBulk = {
      bookings: [
        { bookingUid: "uid-1", data: { n: 1 } },
        { bookingUid: "uid-2", data: { n: 2 } },
      ],
      actor,
      organizationId: 42,
      source: "WEBAPP",
      operationId: "op-1",
      context,
      isBookingAuditEnabled: true,
    };

    it("onBulkBookingsAccepted maps auditData to data", async () => {
      const { service, producer } = buildService();
      await service.onBulkBookingsAccepted({
        ...baseParams,
        bookings: bookings as unknown as Array<{ bookingUid: string; auditData: AcceptedAuditData }>,
      });
      expect(producer.queueBulkAcceptedAudit).toHaveBeenCalledWith(expectedBulk);
    });

    it("onBulkBookingsCancelled maps auditData to data", async () => {
      const { service, producer } = buildService();
      await service.onBulkBookingsCancelled({
        ...baseParams,
        bookings: bookings as unknown as Array<{ bookingUid: string; auditData: CancelledAuditData }>,
      });
      expect(producer.queueBulkCancelledAudit).toHaveBeenCalledWith(expectedBulk);
    });

    it("onBulkBookingsCreated maps auditData to data", async () => {
      const { service, producer } = buildService();
      await service.onBulkBookingsCreated({
        ...baseParams,
        bookings: bookings as unknown as Array<{ bookingUid: string; auditData: CreatedAuditData }>,
      });
      expect(producer.queueBulkCreatedAudit).toHaveBeenCalledWith(expectedBulk);
    });

    it("onBulkBookingsRescheduled maps auditData to data", async () => {
      const { service, producer } = buildService();
      await service.onBulkBookingsRescheduled({
        ...baseParams,
        bookings: bookings as unknown as Array<{ bookingUid: string; auditData: RescheduledAuditData }>,
      });
      expect(producer.queueBulkRescheduledAudit).toHaveBeenCalledWith(expectedBulk);
    });

    it("onBulkBookingsRejected maps auditData to data", async () => {
      const { service, producer } = buildService();
      await service.onBulkBookingsRejected({
        ...baseParams,
        bookings: bookings as unknown as Array<{ bookingUid: string; auditData: RejectedAuditData }>,
      });
      expect(producer.queueBulkRejectedAudit).toHaveBeenCalledWith(expectedBulk);
    });

    it("handles an empty bookings list and propagates producer errors", async () => {
      const { service, producer } = buildService();
      producer.queueBulkRejectedAudit.mockRejectedValueOnce(new Error("bulk failed"));

      await expect(service.onBulkBookingsRejected({ ...baseParams, bookings: [] })).rejects.toThrow(
        "bulk failed"
      );
      expect(producer.queueBulkRejectedAudit).toHaveBeenCalledWith({ ...expectedBulk, bookings: [] });
    });
  });
});
