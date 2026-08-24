import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarsTaskService } from "./CalendarsTaskService";

const findByIdWithSelectedCalendars = vi.fn();
const getConnectedDestinationCalendarsAndEnsureDefaultsInDb = vi.fn();

vi.mock("../../../users/repositories/UserRepository", () => ({
  UserRepository: class {
    findByIdWithSelectedCalendars = findByIdWithSelectedCalendars;
  },
}));

vi.mock("@calcom/features/calendars/lib/getConnectedDestinationCalendars", () => ({
  getConnectedDestinationCalendarsAndEnsureDefaultsInDb: (...args: unknown[]) =>
    getConnectedDestinationCalendarsAndEnsureDefaultsInDb(...args),
}));

const createLogger = () => ({
  log: vi.fn(),
  silly: vi.fn(),
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  getSubLogger: vi.fn(),
});

const prisma = {} as PrismaClient;

describe("CalendarsTaskService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ensures default calendars for a user and splits user level selected calendars", async () => {
    const selectedCalendars = [
      { id: "1", externalId: "user@example.com", eventTypeId: null },
      { id: "2", externalId: "team@example.com", eventTypeId: 99 },
    ];
    findByIdWithSelectedCalendars.mockResolvedValueOnce({ id: 5, selectedCalendars });
    const logger = createLogger();

    const service = new CalendarsTaskService({ logger, prisma });
    await service.ensureDefaultCalendars({ userId: 5 });

    expect(findByIdWithSelectedCalendars).toHaveBeenCalledWith({ userId: 5 });
    expect(getConnectedDestinationCalendarsAndEnsureDefaultsInDb).toHaveBeenCalledWith({
      user: {
        id: 5,
        selectedCalendars,
        allSelectedCalendars: selectedCalendars,
        userLevelSelectedCalendars: [selectedCalendars[0]],
      },
      onboarding: true,
      eventTypeId: null,
      prisma,
    });
    expect(logger.info).toHaveBeenCalledWith("Successfully ensured default calendars for user", {
      userId: 5,
    });
  });

  it("logs and returns early when the user does not exist", async () => {
    findByIdWithSelectedCalendars.mockResolvedValueOnce(null);
    const logger = createLogger();

    const service = new CalendarsTaskService({ logger, prisma });
    await service.ensureDefaultCalendars({ userId: 404 });

    expect(getConnectedDestinationCalendarsAndEnsureDefaultsInDb).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("User not found for ensureDefaultCalendars", {
      userId: 404,
    });
  });

  it("swallows errors and logs the error message", async () => {
    findByIdWithSelectedCalendars.mockRejectedValueOnce(new Error("db down"));
    const logger = createLogger();

    const service = new CalendarsTaskService({ logger, prisma });
    await expect(service.ensureDefaultCalendars({ userId: 1 })).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith("Failed to ensure default calendars for user", {
      userId: 1,
      error: "db down",
    });
  });

  it("reports unknown error for non-Error rejections", async () => {
    findByIdWithSelectedCalendars.mockRejectedValueOnce("nope");
    const logger = createLogger();

    const service = new CalendarsTaskService({ logger, prisma });
    await service.ensureDefaultCalendars({ userId: 2 });

    expect(logger.error).toHaveBeenCalledWith("Failed to ensure default calendars for user", {
      userId: 2,
      error: "Unknown error",
    });
  });
});
