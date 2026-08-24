import { AssignmentReasonRepository } from "@calcom/features/assignment-reason/repositories/AssignmentReasonRepository";
import { PrismaAttributeRepository } from "@calcom/features/attributes/repositories/PrismaAttributeRepository";
import { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import { DestinationCalendarRepository } from "@calcom/features/calendars/repositories/DestinationCalendarRepository";
import { CredentialRepository } from "@calcom/features/credentials/repositories/CredentialRepository";
import { TeamRepository } from "@calcom/features/ee/teams/repositories/TeamRepository";
import { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import { FeaturesRepository } from "@calcom/features/flags/features.repository";
import { PrismaHolidayRepository } from "@calcom/features/holidays/repositories/PrismaHolidayRepository";
import { HostRepository } from "@calcom/features/host/repositories/HostRepository";
import { PrismaOOORepository } from "@calcom/features/ooo/repositories/PrismaOOORepository";
import { RoutingFormResponseRepository } from "@calcom/features/routing-forms/repositories/RoutingFormResponseRepository";
import { ScheduleRepository } from "@calcom/features/schedules/repositories/ScheduleRepository";
import { PrismaSelectedSlotRepository } from "@calcom/features/selectedSlots/repositories/PrismaSelectedSlotRepository";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { describe, expect, it, vi } from "vitest";
import type { Container, Module, ModuleLoader } from "../di";
import { createContainer } from "../di";
import { DI_TOKENS } from "../tokens";
import { moduleLoader as assignmentReasonModuleLoader } from "./AssignmentReason";
import { moduleLoader as attributeModuleLoader } from "./Attribute";
import { moduleLoader as bookingModuleLoader } from "./Booking";
import { moduleLoader as credentialModuleLoader } from "./Credential";
import { moduleLoader as destinationCalendarModuleLoader } from "./DestinationCalendar";
import { moduleLoader as eventTypeModuleLoader } from "./EventType";
import { moduleLoader as featuresModuleLoader } from "./FeaturesRepository";
import { moduleLoader as holidayModuleLoader } from "./Holiday";
import { moduleLoader as hostModuleLoader } from "./Host";
import { moduleLoader as oooModuleLoader } from "./Ooo";
import { moduleLoader as prismaModuleLoader } from "./Prisma";
import { routingFormResponseRepositoryModule } from "./RoutingFormResponse";
import { scheduleRepositoryModule } from "./Schedule";
import { selectedSlotsRepositoryModule } from "./SelectedSlots";
import { teamRepositoryModule } from "./Team";
import { moduleLoader as userModuleLoader } from "./User";

vi.mock("@calcom/prisma", () => ({
  prisma: { $connect: vi.fn() },
  readonlyPrisma: { $connect: vi.fn() },
}));

type RepositoryClass = new (...args: never[]) => unknown;

function loadInto(module: Module): (container: Container) => void {
  return (container: Container) => container.load(Symbol("repositoryModule"), module);
}

/** Modules whose loader also pulls in the prisma client they depend on. */
const selfContainedModules: [name: string, loader: ModuleLoader, expected: RepositoryClass][] = [
  ["AssignmentReason", assignmentReasonModuleLoader, AssignmentReasonRepository],
  ["Attribute", attributeModuleLoader, PrismaAttributeRepository],
  ["Credential", credentialModuleLoader, CredentialRepository],
  ["DestinationCalendar", destinationCalendarModuleLoader, DestinationCalendarRepository],
  ["FeaturesRepository", featuresModuleLoader, FeaturesRepository],
  ["Host", hostModuleLoader, HostRepository],
  ["Ooo", oooModuleLoader, PrismaOOORepository],
  ["User", userModuleLoader, UserRepository],
];

/** Modules that only declare their binding and expect the container to provide prisma. */
const prismaDependentModules: [
  name: string,
  load: (container: Container) => void,
  token: symbol,
  expected: RepositoryClass,
][] = [
  ["Booking", bookingModuleLoader.loadModule, DI_TOKENS.BOOKING_REPOSITORY, BookingRepository],
  ["EventType", eventTypeModuleLoader.loadModule, DI_TOKENS.EVENT_TYPE_REPOSITORY, EventTypeRepository],
  ["Holiday", holidayModuleLoader.loadModule, DI_TOKENS.HOLIDAY_REPOSITORY, PrismaHolidayRepository],
  [
    "RoutingFormResponse",
    loadInto(routingFormResponseRepositoryModule),
    DI_TOKENS.ROUTING_FORM_RESPONSE_REPOSITORY,
    RoutingFormResponseRepository,
  ],
  ["Schedule", loadInto(scheduleRepositoryModule), DI_TOKENS.SCHEDULE_REPOSITORY, ScheduleRepository],
  [
    "SelectedSlots",
    loadInto(selectedSlotsRepositoryModule),
    DI_TOKENS.SELECTED_SLOT_REPOSITORY,
    PrismaSelectedSlotRepository,
  ],
  ["Team", loadInto(teamRepositoryModule), DI_TOKENS.TEAM_REPOSITORY, TeamRepository],
];

describe("repository modules", () => {
  describe.each(selfContainedModules)("%s", (_name, loader, expected) => {
    it("loads its own dependencies and resolves the repository", () => {
      const container = createContainer();
      loader.loadModule(container);

      expect(container.get(loader.token)).toBeInstanceOf(expected);
    });

    it("stays resolvable when loaded more than once", () => {
      const container = createContainer();
      loader.loadModule(container);
      loader.loadModule(container);

      expect(container.get(loader.token)).toBeInstanceOf(expected);
    });
  });

  describe.each(prismaDependentModules)("%s", (_name, load, token, expected) => {
    it("resolves the repository once a prisma client is bound", () => {
      const container = createContainer();
      prismaModuleLoader.loadModule(container);
      load(container);

      expect(container.get(token)).toBeInstanceOf(expected);
    });

    it("cannot be resolved without a prisma client", () => {
      const container = createContainer();
      load(container);

      expect(() => container.get(token)).toThrow();
    });
  });

  it("binds every repository on a distinct token", () => {
    const tokens = [
      ...selfContainedModules.map(([, loader]) => loader.token),
      ...prismaDependentModules.map(([, , token]) => token),
    ];
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});
