import { beforeEach, describe, expect, it, vi } from "vitest";

const schemaTask = vi.fn((options: unknown) => options);
const queue = vi.fn((options: unknown) => options);
const ensureDefaultCalendars = vi.fn();

vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: (options: unknown) => schemaTask(options),
  queue: (options: unknown) => queue(options),
}));

vi.mock("@calcom/features/calendars/di/tasker/CalendarsTaskService.container", () => ({
  getCalendarsTaskService: () => ({ ensureDefaultCalendars }),
}));

describe("ensure-default-calendars trigger task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("registers the task with the calendars queue configuration", async () => {
    const { ENSURE_DEFAULT_CALENDARS_JOB_ID } = await import("./ensure-default-calendars");
    const { calendarsQueue } = await import("./config");

    expect(ENSURE_DEFAULT_CALENDARS_JOB_ID).toBe("calendars.ensure-default-calendars");
    expect(calendarsQueue).toEqual({ name: "calendars", concurrencyLimit: 10 });
    expect(schemaTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "calendars.ensure-default-calendars",
        machine: "small-2x",
        retry: expect.objectContaining({ maxAttempts: 3 }),
      })
    );
  });

  it("validates the payload against the schema", async () => {
    const { calendarsTaskSchema } = await import("./schema");

    expect(calendarsTaskSchema.parse({ userId: 1 })).toEqual({ userId: 1 });
    expect(calendarsTaskSchema.safeParse({ userId: "1" }).success).toBe(false);
  });

  it("runs the task through the calendars task service", async () => {
    await import("./ensure-default-calendars");
    const taskOptions = schemaTask.mock.calls[0][0] as {
      run: (payload: { userId: number }) => Promise<void>;
    };

    await taskOptions.run({ userId: 11 });

    expect(ensureDefaultCalendars).toHaveBeenCalledWith({ userId: 11 });
  });
});
