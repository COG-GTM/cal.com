import type { Task as TaskModel } from "@calcom/prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Task } from "./repository";
import { TaskProcessor } from "./task-processor";
import tasksMap, { tasksConfig } from "./tasks";

vi.mock("./repository", () => ({
  Task: {
    getNextBatch: vi.fn(),
    succeed: vi.fn(),
    retry: vi.fn(),
  },
}));

const handlers = {
  sendWebhook: vi.fn(),
  createCRMEvent: vi.fn(),
  webhookDelivery: vi.fn(),
  executeAIPhoneCall: vi.fn(),
};

vi.mock("./tasks", () => ({
  default: {
    sendWebhook: () => Promise.resolve(handlers.sendWebhook),
    createCRMEvent: () => Promise.resolve(handlers.createCRMEvent),
    webhookDelivery: () => Promise.resolve(handlers.webhookDelivery),
    executeAIPhoneCall: () => Promise.resolve(handlers.executeAIPhoneCall),
  },
  tasksConfig: {
    createCRMEvent: { minRetryIntervalMins: 10, maxAttempts: 10 },
    executeAIPhoneCall: { maxAttempts: 1 },
    webhookDelivery: { minRetryIntervalMins: 5, maxAttempts: 3 },
  },
}));

const NOW = new Date("2026-03-01T12:00:00.000Z");

function makeTask(overrides: Partial<TaskModel> = {}): TaskModel {
  return {
    id: "task-1",
    type: "sendWebhook",
    payload: '{"hello":"world"}',
    scheduledAt: NOW,
    succeededAt: null,
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    lastFailedAttemptAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    referenceUid: null,
    ...overrides,
  };
}

const mockedTask = vi.mocked(Task);

describe("TaskProcessor.processQueue", () => {
  const processor = new TaskProcessor();
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mockedTask.succeed.mockResolvedValue(makeTask({ succeededAt: NOW }));
    mockedTask.retry.mockResolvedValue(makeTask({ attempts: 1 }));
    for (const handler of Object.values(handlers)) {
      handler.mockResolvedValue(undefined);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the mocked task map and config", () => {
    expect(Object.keys(tasksMap)).toContain("sendWebhook");
    expect(tasksConfig.createCRMEvent.minRetryIntervalMins).toBe(10);
  });

  it("does nothing beyond logging when the batch is empty", async () => {
    mockedTask.getNextBatch.mockResolvedValue([]);

    await processor.processQueue();

    expect(infoSpy).toHaveBeenCalledWith("Processing 0 tasks", []);
    expect(mockedTask.succeed).not.toHaveBeenCalled();
    expect(mockedTask.retry).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenLastCalledWith({ failed: [], succeded: [] });
  });

  it("runs the handler with payload and id, then marks the task succeeded", async () => {
    const task = makeTask();
    mockedTask.getNextBatch.mockResolvedValue([task]);

    await processor.processQueue();

    expect(handlers.sendWebhook).toHaveBeenCalledWith('{"hello":"world"}', "task-1");
    expect(mockedTask.succeed).toHaveBeenCalledWith("task-1");
    expect(mockedTask.retry).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenLastCalledWith({
      failed: [],
      succeded: [{ status: "fulfilled", value: undefined }],
    });
  });

  it("retries a failed task with the error message and null interval when no config exists", async () => {
    mockedTask.getNextBatch.mockResolvedValue([makeTask()]);
    handlers.sendWebhook.mockRejectedValue(new Error("handler exploded"));

    await processor.processQueue();

    expect(mockedTask.succeed).not.toHaveBeenCalled();
    expect(mockedTask.retry).toHaveBeenCalledWith({
      taskId: "task-1",
      lastError: "handler exploded",
      minRetryIntervalMins: null,
    });
    expect(infoSpy).toHaveBeenCalledWith("Retrying task task-1: Error: handler exploded");
  });

  it("uses the configured minRetryIntervalMins when the task type defines one", async () => {
    mockedTask.getNextBatch.mockResolvedValue([makeTask({ id: "crm-1", type: "createCRMEvent" })]);
    handlers.createCRMEvent.mockRejectedValue(new Error("crm down"));

    await processor.processQueue();

    expect(mockedTask.retry).toHaveBeenCalledWith({
      taskId: "crm-1",
      lastError: "crm down",
      minRetryIntervalMins: 10,
    });
  });

  it("passes null interval when the config exists but has no minRetryIntervalMins", async () => {
    mockedTask.getNextBatch.mockResolvedValue([makeTask({ id: "ai-1", type: "executeAIPhoneCall" })]);
    handlers.executeAIPhoneCall.mockRejectedValue(new Error("no answer"));

    await processor.processQueue();

    expect(mockedTask.retry).toHaveBeenCalledWith({
      taskId: "ai-1",
      lastError: "no answer",
      minRetryIntervalMins: null,
    });
  });

  it("records 'Unknown error' when the handler rejects with a non-Error", async () => {
    mockedTask.getNextBatch.mockResolvedValue([makeTask()]);
    handlers.sendWebhook.mockRejectedValue("string failure");

    await processor.processQueue();

    expect(mockedTask.retry).toHaveBeenCalledWith({
      taskId: "task-1",
      lastError: "Unknown error",
      minRetryIntervalMins: null,
    });
  });

  it("reports a rejected result when no handler exists for the task type, without aborting others", async () => {
    mockedTask.getNextBatch.mockResolvedValue([
      makeTask({ id: "unknown-1", type: "doesNotExist" }),
      makeTask({ id: "ok-1", type: "sendWebhook" }),
    ]);

    await expect(processor.processQueue()).resolves.toBeUndefined();

    expect(mockedTask.succeed).toHaveBeenCalledWith("ok-1");
    expect(mockedTask.retry).not.toHaveBeenCalled();
    const lastCall = infoSpy.mock.calls.at(-1)?.[0] as {
      failed: PromiseRejectedResult[];
      succeded: PromiseFulfilledResult<void>[];
    };
    expect(lastCall.failed).toHaveLength(1);
    expect(lastCall.failed[0].reason).toBeInstanceOf(Error);
    expect((lastCall.failed[0].reason as Error).message).toBe("Task handler not found for type doesNotExist");
    expect(lastCall.succeded).toHaveLength(1);
  });

  it("processes a mixed batch, succeeding and retrying independently", async () => {
    mockedTask.getNextBatch.mockResolvedValue([
      makeTask({ id: "a", type: "sendWebhook" }),
      makeTask({ id: "b", type: "webhookDelivery", attempts: 1 }),
    ]);
    handlers.webhookDelivery.mockRejectedValue(new Error("delivery failed"));

    await processor.processQueue();

    expect(mockedTask.succeed).toHaveBeenCalledTimes(1);
    expect(mockedTask.succeed).toHaveBeenCalledWith("a");
    expect(mockedTask.retry).toHaveBeenCalledTimes(1);
    expect(mockedTask.retry).toHaveBeenCalledWith({
      taskId: "b",
      lastError: "delivery failed",
      minRetryIntervalMins: 5,
    });
  });

  it("falls through to retry when marking success itself fails", async () => {
    mockedTask.getNextBatch.mockResolvedValue([makeTask()]);
    mockedTask.succeed.mockRejectedValue(new Error("db write failed"));

    await expect(processor.processQueue()).resolves.toBeUndefined();

    expect(mockedTask.retry).toHaveBeenCalledWith({
      taskId: "task-1",
      lastError: "db write failed",
      minRetryIntervalMins: null,
    });
    const lastCall = infoSpy.mock.calls.at(-1)?.[0] as { failed: PromiseRejectedResult[] };
    expect(lastCall.failed).toHaveLength(0);
  });
});
