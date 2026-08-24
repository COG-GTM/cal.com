import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarsSyncTasker } from "./CalendarsSyncTasker";
import type { CalendarsTaskService } from "./CalendarsTaskService";

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "abcdefghij"),
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

describe("CalendarsSyncTasker", () => {
  const ensureDefaultCalendars = vi.fn();
  const calendarsTaskService = { ensureDefaultCalendars } as unknown as CalendarsTaskService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to the task service and returns a sync run id", async () => {
    const tasker = new CalendarsSyncTasker({ logger: createLogger(), calendarsTaskService });

    const result = await tasker.ensureDefaultCalendars({ userId: 42 });

    expect(ensureDefaultCalendars).toHaveBeenCalledWith({ userId: 42 });
    expect(result).toEqual({ runId: "sync_abcdefghij" });
  });

  it("propagates task service failures", async () => {
    ensureDefaultCalendars.mockRejectedValueOnce(new Error("boom"));
    const tasker = new CalendarsSyncTasker({ logger: createLogger(), calendarsTaskService });

    await expect(tasker.ensureDefaultCalendars({ userId: 1 })).rejects.toThrow("boom");
  });
});
