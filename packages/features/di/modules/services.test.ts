import { UserAvailabilityService } from "@calcom/features/availability/lib/getUserAvailability";
import { CheckBookingLimitsService } from "@calcom/features/bookings/lib/checkBookingLimits";
import { LuckyUserService } from "@calcom/features/bookings/lib/getLuckyUser";
import { CheckBookingAndDurationLimitsService } from "@calcom/features/bookings/lib/handleNewBooking/checkBookingAndDurationLimits";
import { FilterHostsService } from "@calcom/features/bookings/lib/host-filtering/filterHostsBySameRoundRobinHost";
import { QualifiedHostsService } from "@calcom/features/bookings/lib/host-filtering/findQualifiedHostsWithDelegationCredentials";
import { BookingAccessService } from "@calcom/features/bookings/services/BookingAccessService";
import { BusyTimesService } from "@calcom/features/busyTimes/services/getBusyTimes";
import { ManagedEventReassignmentService } from "@calcom/features/ee/managed-event-types/reassignment/services/ManagedEventReassignmentService";
import { InsightsBookingService } from "@calcom/features/insights/services/InsightsBookingDIService";
import { InsightsRoutingService } from "@calcom/features/insights/services/InsightsRoutingDIService";
import { NoSlotsNotificationService } from "@calcom/features/slots/handleNotificationWhenNoSlots";
import { AvailableSlotsService } from "@calcom/trpc/server/routers/viewer/slots/util";
import { describe, expect, it, vi } from "vitest";
import type { Container, Module, ModuleLoader } from "../di";
import { createContainer, createModule } from "../di";
import { DI_TOKENS } from "../tokens";
import { availableSlotsModule } from "./AvailableSlots";
import { moduleLoader as bookingAccessServiceModuleLoader } from "./BookingAccessService";
import { busyTimesModule } from "./BusyTimes";
import { moduleLoader as checkBookingAndDurationLimitsModuleLoader } from "./CheckBookingAndDurationLimits";
import { checkBookingLimitsModule } from "./CheckBookingLimits";
import { filterHostsModule } from "./FilterHosts";
import { getUserAvailabilityModule } from "./GetUserAvailability";
import { insightsBookingModule } from "./InsightsBooking";
import { insightsRoutingModule } from "./InsightsRouting";
import { moduleLoader as luckyUserModuleLoader } from "./LuckyUser";
import { moduleLoader as managedEventReassignmentModuleLoader } from "./ManagedEventReassignment";
import { noSlotsNotificationModule } from "./NoSlotsNotification";
import { moduleLoader as prismaModuleLoader } from "./Prisma";
import { qualifiedHostsModule } from "./QualifiedHosts";

vi.mock("@calcom/prisma", () => {
  const client = { $connect: vi.fn() };
  return { default: client, prisma: client, readonlyPrisma: client };
});

type ServiceClass = new (...args: never[]) => unknown;

/**
 * Binds an inert value on every token so a module can be resolved in isolation
 * from the rest of the graph.
 */
function bindStubs(container: Container, tokens: symbol[]): void {
  const stubModule: Module = createModule();
  for (const token of tokens) {
    stubModule.bind(token).toValue({});
  }
  container.load(Symbol("stubs"), stubModule);
}

/** Modules that bind a service and rely on the container for their dependencies. */
const boundServiceModules: [
  name: string,
  module: Module,
  token: symbol,
  deps: symbol[],
  expected: ServiceClass,
][] = [
  [
    "AvailableSlots",
    availableSlotsModule,
    DI_TOKENS.AVAILABLE_SLOTS_SERVICE,
    [
      DI_TOKENS.OOO_REPOSITORY,
      DI_TOKENS.SCHEDULE_REPOSITORY,
      DI_TOKENS.SELECTED_SLOT_REPOSITORY,
      DI_TOKENS.TEAM_REPOSITORY,
      DI_TOKENS.USER_REPOSITORY,
      DI_TOKENS.BOOKING_REPOSITORY,
      DI_TOKENS.EVENT_TYPE_REPOSITORY,
      DI_TOKENS.ROUTING_FORM_RESPONSE_REPOSITORY,
      DI_TOKENS.REDIS_CLIENT,
      DI_TOKENS.CHECK_BOOKING_LIMITS_SERVICE,
      DI_TOKENS.GET_USER_AVAILABILITY_SERVICE,
      DI_TOKENS.BUSY_TIMES_SERVICE,
      DI_TOKENS.FEATURES_REPOSITORY,
      DI_TOKENS.QUALIFIED_HOSTS_SERVICE,
      DI_TOKENS.NO_SLOTS_NOTIFICATION_SERVICE,
      DI_TOKENS.ORG_MEMBERSHIP_LOOKUP,
    ],
    AvailableSlotsService,
  ],
  [
    "BusyTimes",
    busyTimesModule,
    DI_TOKENS.BUSY_TIMES_SERVICE,
    [DI_TOKENS.BOOKING_REPOSITORY],
    BusyTimesService,
  ],
  [
    "CheckBookingLimits",
    checkBookingLimitsModule,
    DI_TOKENS.CHECK_BOOKING_LIMITS_SERVICE,
    [DI_TOKENS.BOOKING_REPOSITORY],
    CheckBookingLimitsService,
  ],
  [
    "FilterHosts",
    filterHostsModule,
    DI_TOKENS.FILTER_HOSTS_SERVICE,
    [DI_TOKENS.BOOKING_REPOSITORY],
    FilterHostsService,
  ],
  [
    "GetUserAvailability",
    getUserAvailabilityModule,
    DI_TOKENS.GET_USER_AVAILABILITY_SERVICE,
    [
      DI_TOKENS.OOO_REPOSITORY,
      DI_TOKENS.BOOKING_REPOSITORY,
      DI_TOKENS.EVENT_TYPE_REPOSITORY,
      DI_TOKENS.REDIS_CLIENT,
      DI_TOKENS.HOLIDAY_REPOSITORY,
    ],
    UserAvailabilityService,
  ],
  [
    "InsightsBooking",
    insightsBookingModule,
    DI_TOKENS.INSIGHTS_BOOKING_SERVICE,
    [DI_TOKENS.READ_ONLY_PRISMA_CLIENT],
    InsightsBookingService,
  ],
  [
    "InsightsRouting",
    insightsRoutingModule,
    DI_TOKENS.INSIGHTS_ROUTING_SERVICE,
    [DI_TOKENS.READ_ONLY_PRISMA_CLIENT],
    InsightsRoutingService,
  ],
  [
    "NoSlotsNotification",
    noSlotsNotificationModule,
    DI_TOKENS.NO_SLOTS_NOTIFICATION_SERVICE,
    [DI_TOKENS.TEAM_REPOSITORY, DI_TOKENS.MEMBERSHIP_REPOSITORY, DI_TOKENS.REDIS_CLIENT],
    NoSlotsNotificationService,
  ],
  [
    "QualifiedHosts",
    qualifiedHostsModule,
    DI_TOKENS.QUALIFIED_HOSTS_SERVICE,
    [DI_TOKENS.BOOKING_REPOSITORY, DI_TOKENS.FILTER_HOSTS_SERVICE],
    QualifiedHostsService,
  ],
];

/** Module loaders that pull in their own dependency graph. */
const serviceLoaders: [name: string, loader: ModuleLoader, extraDeps: symbol[], expected: ServiceClass][] = [
  ["BookingAccessService", bookingAccessServiceModuleLoader, [], BookingAccessService],
  [
    "CheckBookingAndDurationLimits",
    checkBookingAndDurationLimitsModuleLoader,
    [DI_TOKENS.BOOKING_REPOSITORY],
    CheckBookingAndDurationLimitsService,
  ],
  ["LuckyUser", luckyUserModuleLoader, [], LuckyUserService],
  ["ManagedEventReassignment", managedEventReassignmentModuleLoader, [], ManagedEventReassignmentService],
];

describe("service modules", () => {
  describe.each(boundServiceModules)("%s", (_name, module, token, deps, expected) => {
    it("resolves the service when its dependencies are bound", () => {
      const container = createContainer();
      bindStubs(container, deps);
      container.load(Symbol("serviceModule"), module);

      expect(container.get(token)).toBeInstanceOf(expected);
    });

    it("fails to resolve when its dependencies are missing", () => {
      const container = createContainer();
      container.load(Symbol("serviceModule"), module);

      expect(() => container.get(token)).toThrow();
    });
  });

  describe.each(serviceLoaders)("%s", (_name, loader, extraDeps, expected) => {
    it("loads its dependency graph and resolves the service", () => {
      const container = createContainer();
      prismaModuleLoader.loadModule(container);
      bindStubs(container, extraDeps);
      loader.loadModule(container);

      expect(container.get(loader.token)).toBeInstanceOf(expected);
    });
  });
});
