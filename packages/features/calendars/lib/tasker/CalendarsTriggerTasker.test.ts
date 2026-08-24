import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarsTriggerTasker } from "./CalendarsTriggerTasker";

const trigger = vi.fn();

vi.mock("./trigger/ensure-default-calendars", () => ({
  ensureDefaultCalendars: {
    trigger: (...args: unknown[]) => trigger(...args),
  },
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

describe("CalendarsTriggerTasker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("triggers the task and returns the trigger handle id", async () => {
    trigger.mockResolvedValueOnce({ id: "run_123" });
    const tasker = new CalendarsTriggerTasker({ logger: createLogger() });

    const result = await tasker.ensureDefaultCalendars({ userId: 7 });

    expect(trigger).toHaveBeenCalledWith({ userId: 7 }, undefined);
    expect(result).toEqual({ runId: "run_123" });
  });

  it("forwards trigger options", async () => {
    trigger.mockResolvedValueOnce({ id: "run_456" });
    const tasker = new CalendarsTriggerTasker({ logger: createLogger() });

    await tasker.ensureDefaultCalendars({ userId: 7 }, { idempotencyKey: "key-1" });

    expect(trigger).toHaveBeenCalledWith({ userId: 7 }, { idempotencyKey: "key-1" });
  });
});
