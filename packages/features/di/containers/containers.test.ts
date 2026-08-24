import { UserAvailabilityService } from "@calcom/features/availability/lib/getUserAvailability";
import { BookingAuditViewerService } from "@calcom/features/booking-audit/lib/service/BookingAuditViewerService";
import { CheckBookingLimitsService } from "@calcom/features/bookings/lib/checkBookingLimits";
import { LuckyUserService } from "@calcom/features/bookings/lib/getLuckyUser";
import { CheckBookingAndDurationLimitsService } from "@calcom/features/bookings/lib/handleNewBooking/checkBookingAndDurationLimits";
import { FilterHostsService } from "@calcom/features/bookings/lib/host-filtering/filterHostsBySameRoundRobinHost";
import { QualifiedHostsService } from "@calcom/features/bookings/lib/host-filtering/findQualifiedHostsWithDelegationCredentials";
import { BookingAccessService } from "@calcom/features/bookings/services/BookingAccessService";
import { BusyTimesService } from "@calcom/features/busyTimes/services/getBusyTimes";
import { DestinationCalendarRepository } from "@calcom/features/calendars/repositories/DestinationCalendarRepository";
import { ManagedEventReassignmentService } from "@calcom/features/ee/managed-event-types/reassignment/services/ManagedEventReassignmentService";
import { FeatureOptInService } from "@calcom/features/feature-opt-in/services/FeatureOptInService";
import { FeaturesRepository } from "@calcom/features/flags/features.repository";
import { NoSlotsNotificationService } from "@calcom/features/slots/handleNotificationWhenNoSlots";
import { TranslationService } from "@calcom/features/translation/services/TranslationService";
import { AvailableSlotsService } from "@calcom/trpc/server/routers/viewer/slots/util";
import { describe, expect, it, vi } from "vitest";
import { getAvailableSlotsService } from "./AvailableSlots";
import { getBookingAccessService } from "./BookingAccessService";
import { getBookingAuditViewerService } from "./BookingAuditViewerService.container";
import { getCheckBookingAndDurationLimitsService, getCheckBookingLimitsService } from "./BookingLimits";
import { getBusyTimesService } from "./BusyTimes";
import { getDestinationCalendarRepository } from "./DestinationCalendar";
import { getFeatureOptInService } from "./FeatureOptInService";
import { getFeatureRepository } from "./FeatureRepository";
import { getFeaturesRepository } from "./FeaturesRepository";
import { getFilterHostsService } from "./FilterHosts";
import { getUserAvailabilityService } from "./GetUserAvailability";
import { getInsightsBookingService } from "./InsightsBooking";
import { getInsightsRoutingService } from "./InsightsRouting";
import { getLuckyUserService } from "./LuckyUser";
import { getManagedEventReassignmentService } from "./ManagedEventReassignment";
import { getNoSlotsNotificationService } from "./NoSlotsNotification";
import { getQualifiedHostsService } from "./QualifiedHosts";
import { getRedisService } from "./Redis";
import { getTeamFeatureRepository } from "./TeamFeatureRepository";
import { getTranslationService } from "./TranslationService";
import { getUserFeatureRepository } from "./UserFeatureRepository";

vi.mock("@calcom/prisma", () => {
  const client = { $connect: vi.fn() };
  return { default: client, prisma: client, readonlyPrisma: client };
});

vi.mock("@calcom/lib/server/service/lingoDotDev", () => ({
  LingoDotDevService: { localizeText: vi.fn().mockResolvedValue("hola") },
}));

type ServiceClass = new (...args: never[]) => unknown;

const containerFactories: [name: string, get: () => unknown, expected: ServiceClass][] = [
  ["AvailableSlots", getAvailableSlotsService, AvailableSlotsService],
  ["BookingAccessService", getBookingAccessService, BookingAccessService],
  ["BookingAuditViewerService", getBookingAuditViewerService, BookingAuditViewerService],
  ["BookingLimits (limits)", getCheckBookingLimitsService, CheckBookingLimitsService],
  [
    "BookingLimits (limits + duration)",
    getCheckBookingAndDurationLimitsService,
    CheckBookingAndDurationLimitsService,
  ],
  ["BusyTimes", getBusyTimesService, BusyTimesService],
  ["DestinationCalendar", getDestinationCalendarRepository, DestinationCalendarRepository],
  ["FeatureOptInService", getFeatureOptInService, FeatureOptInService],
  ["FeaturesRepository", getFeaturesRepository, FeaturesRepository],
  ["FilterHosts", getFilterHostsService, FilterHostsService],
  ["GetUserAvailability", getUserAvailabilityService, UserAvailabilityService],
  ["LuckyUser", getLuckyUserService, LuckyUserService],
  ["ManagedEventReassignment", getManagedEventReassignmentService, ManagedEventReassignmentService],
  ["NoSlotsNotification", getNoSlotsNotificationService, NoSlotsNotificationService],
  ["QualifiedHosts", getQualifiedHostsService, QualifiedHostsService],
];

describe("di containers", () => {
  describe.each(containerFactories)("%s", (_name, get, expected) => {
    it("resolves the service from its pre-wired container", () => {
      expect(get()).toBeInstanceOf(expected);
    });

    it("reuses the container across calls", () => {
      expect(get()).toBe(get());
    });
  });

  it("resolves the insights booking service for the given options", () => {
    const service = getInsightsBookingService({ options: { scope: "user", userId: 1, orgId: null } });

    expect(service).toBeDefined();
  });

  it("resolves the insights routing service for the given options", () => {
    const service = getInsightsRoutingService({
      options: { scope: "user", userId: 1, orgId: null },
      filters: {},
    });

    expect(service).toBeDefined();
  });

  it("resolves the translation service asynchronously", async () => {
    await expect(getTranslationService()).resolves.toBeInstanceOf(TranslationService);
  });

  it("resolves the redis service", () => {
    expect(getRedisService()).toBeDefined();
  });

  it("resolves the cached feature repositories", () => {
    expect(getFeatureRepository()).toBeDefined();
    expect(getTeamFeatureRepository()).toBeDefined();
    expect(getUserFeatureRepository()).toBeDefined();
  });
});
