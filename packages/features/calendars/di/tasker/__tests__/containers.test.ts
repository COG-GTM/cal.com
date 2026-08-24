import { describe, expect, it } from "vitest";
import { CalendarsSyncTasker } from "../../../lib/tasker/CalendarsSyncTasker";
import { CalendarsTasker } from "../../../lib/tasker/CalendarsTasker";
import { CalendarsTaskService } from "../../../lib/tasker/CalendarsTaskService";
import { CalendarsTriggerTasker } from "../../../lib/tasker/CalendarsTriggerTasker";
import { getCalendarsTasker } from "../CalendarsTasker.container";
import { getCalendarsTaskService } from "../CalendarsTaskService.container";
import { CALENDARS_TASKER_DI_TOKENS } from "../tokens";

describe("calendars tasker DI containers", () => {
  it("resolves a CalendarsTaskService with its prisma and logger dependencies", () => {
    const service = getCalendarsTaskService();

    expect(service).toBeInstanceOf(CalendarsTaskService);
    expect(service.dependencies.prisma).toBeDefined();
    expect(service.dependencies.logger).toBeDefined();
  });

  it("returns the same instance on repeated resolution", () => {
    expect(getCalendarsTaskService()).toBe(getCalendarsTaskService());
    expect(getCalendarsTasker()).toBe(getCalendarsTasker());
  });

  it("resolves a CalendarsTasker wired to both sync and trigger taskers", () => {
    const tasker = getCalendarsTasker();

    expect(tasker).toBeInstanceOf(CalendarsTasker);
    expect(tasker.dependencies.syncTasker).toBeInstanceOf(CalendarsSyncTasker);
    expect(tasker.dependencies.asyncTasker).toBeInstanceOf(CalendarsTriggerTasker);
    expect(tasker.dependencies.syncTasker.dependencies.calendarsTaskService).toBeInstanceOf(
      CalendarsTaskService
    );
  });

  it("exposes unique DI tokens", () => {
    const tokens = Object.values(CALENDARS_TASKER_DI_TOKENS);

    expect(new Set(tokens).size).toBe(tokens.length);
    expect(tokens.every((token) => typeof token === "symbol")).toBe(true);
  });
});
