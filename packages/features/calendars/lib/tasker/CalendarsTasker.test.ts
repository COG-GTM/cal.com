import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarsSyncTasker } from "./CalendarsSyncTasker";
import { CalendarsTasker } from "./CalendarsTasker";
import type { CalendarsTriggerTasker } from "./CalendarsTriggerTasker";

vi.mock("@trigger.dev/sdk", () => ({
  configure: vi.fn(),
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

describe("CalendarsTasker", () => {
  const syncEnsureDefaultCalendars = vi.fn();
  const asyncEnsureDefaultCalendars = vi.fn();

  const buildTasker = () => {
    const logger = createLogger();
    const tasker = new CalendarsTasker({
      logger,
      syncTasker: { ensureDefaultCalendars: syncEnsureDefaultCalendars } as unknown as CalendarsSyncTasker,
      asyncTasker: {
        ensureDefaultCalendars: asyncEnsureDefaultCalendars,
      } as unknown as CalendarsTriggerTasker,
    });
    return { tasker, logger };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the dispatched run id and logs success", async () => {
    syncEnsureDefaultCalendars.mockResolvedValueOnce({ runId: "sync_1" });
    const { tasker, logger } = buildTasker();

    const result = await tasker.ensureDefaultCalendars({ payload: { userId: 3 } });

    expect(syncEnsureDefaultCalendars).toHaveBeenCalledWith({ userId: 3 }, undefined);
    expect(result).toEqual({ runId: "sync_1" });
    expect(logger.info).toHaveBeenCalledWith(
      "CalendarsTasker ensureDefaultCalendars success:",
      { runId: "sync_1" },
      { userId: 3 }
    );
  });

  it("forwards trigger options to the underlying tasker", async () => {
    syncEnsureDefaultCalendars.mockResolvedValueOnce({ runId: "sync_2" });
    const { tasker } = buildTasker();

    await tasker.ensureDefaultCalendars({ payload: { userId: 4 }, options: { idempotencyKey: "key" } });

    expect(syncEnsureDefaultCalendars).toHaveBeenCalledWith({ userId: 4 }, { idempotencyKey: "key" });
  });

  it("returns task-failed and logs when dispatch throws", async () => {
    syncEnsureDefaultCalendars.mockRejectedValueOnce(new Error("dispatch failed"));
    const { tasker, logger } = buildTasker();

    const result = await tasker.ensureDefaultCalendars({ payload: { userId: 9 } });

    expect(result).toEqual({ runId: "task-failed" });
    expect(logger.error).toHaveBeenCalledWith(
      "CalendarsTasker ensureDefaultCalendars failed",
      { runId: "task-failed" },
      { userId: 9 }
    );
  });
});
