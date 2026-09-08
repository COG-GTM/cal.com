import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import type { Task as TaskModel } from "@calcom/prisma/client";
import { Prisma } from "@calcom/prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Task, TaskRepository } from "./repository";

const NOW = new Date("2026-03-01T12:00:00.000Z");

const maxAttemptsRef = {
  _ref: "maxAttempts",
  _container: "Task",
};

function makeTask(overrides: Partial<TaskModel> = {}): TaskModel {
  return {
    id: "task-1",
    type: "sendWebhook",
    payload: "{}",
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

describe("TaskRepository", () => {
  const repository = new TaskRepository({ prismaClient: prismaMock });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exports a singleton bound to the shared prisma client", () => {
    expect(Task).toBeInstanceOf(TaskRepository);
  });

  describe("create", () => {
    it("creates a task with all options and returns its id", async () => {
      prismaMock.task.create.mockResolvedValue(makeTask({ id: "created-id" }));
      const scheduledAt = new Date("2026-03-02T00:00:00Z");

      const id = await repository.create("sendWebhook", '{"a":1}', {
        scheduledAt,
        maxAttempts: 5,
        referenceUid: "ref-1",
      });

      expect(id).toBe("created-id");
      expect(prismaMock.task.create).toHaveBeenCalledWith({
        data: {
          payload: '{"a":1}',
          type: "sendWebhook",
          scheduledAt,
          maxAttempts: 5,
          referenceUid: "ref-1",
        },
      });
    });

    it("defaults options to undefined when omitted", async () => {
      prismaMock.task.create.mockResolvedValue(makeTask({ id: "created-id" }));

      await repository.create("sendSms", "payload");

      expect(prismaMock.task.create).toHaveBeenCalledWith({
        data: {
          payload: "payload",
          type: "sendSms",
          scheduledAt: undefined,
          maxAttempts: undefined,
          referenceUid: undefined,
        },
      });
    });
  });

  describe("getNextBatch", () => {
    it("queries upcoming unsucceeded tasks below maxAttempts, oldest first", async () => {
      const tasks = [makeTask()];
      prismaMock.task.findMany.mockResolvedValue(tasks);

      const result = await repository.getNextBatch();

      expect(result).toBe(tasks);
      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        where: {
          succeededAt: null,
          scheduledAt: { lt: NOW },
          attempts: { lt: maxAttemptsRef },
        },
        orderBy: { scheduledAt: "asc" },
        take: 1000,
      });
    });
  });

  describe("getFailed / getSucceeded", () => {
    it("getFailed filters on attempts equal to maxAttempts", async () => {
      prismaMock.task.findMany.mockResolvedValue([]);

      await repository.getFailed();

      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        where: { attempts: { equals: maxAttemptsRef } },
      });
    });

    it("getSucceeded filters on non-null succeededAt", async () => {
      prismaMock.task.findMany.mockResolvedValue([]);

      await repository.getSucceeded();

      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        where: { succeededAt: { not: null } },
      });
    });
  });

  describe("count helpers", () => {
    it("count returns the total number of tasks", async () => {
      prismaMock.task.count.mockResolvedValue(7);

      await expect(repository.count()).resolves.toBe(7);
      expect(prismaMock.task.count).toHaveBeenCalledWith();
    });

    it("countUpcoming uses the upcoming filter", async () => {
      prismaMock.task.count.mockResolvedValue(2);

      await expect(repository.countUpcoming()).resolves.toBe(2);
      expect(prismaMock.task.count).toHaveBeenCalledWith({
        where: {
          succeededAt: null,
          scheduledAt: { lt: NOW },
          attempts: { lt: maxAttemptsRef },
        },
      });
    });

    it("countFailed uses the max attempts filter", async () => {
      prismaMock.task.count.mockResolvedValue(1);

      await expect(repository.countFailed()).resolves.toBe(1);
      expect(prismaMock.task.count).toHaveBeenCalledWith({
        where: { attempts: { equals: maxAttemptsRef } },
      });
    });

    it("countSucceeded uses the succeeded filter", async () => {
      prismaMock.task.count.mockResolvedValue(3);

      await expect(repository.countSucceeded()).resolves.toBe(3);
      expect(prismaMock.task.count).toHaveBeenCalledWith({
        where: { succeededAt: { not: null } },
      });
    });
  });

  describe("retry", () => {
    it("increments attempts and records the failure without rescheduling by default", async () => {
      prismaMock.task.update.mockResolvedValue(makeTask({ attempts: 1 }));

      await repository.retry({ taskId: "task-1", lastError: "oops" });

      expect(prismaMock.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: {
          attempts: { increment: 1 },
          lastError: "oops",
          lastFailedAttemptAt: NOW,
        },
      });
    });

    it("pushes scheduledAt forward by minRetryIntervalMins", async () => {
      prismaMock.task.update.mockResolvedValue(makeTask({ attempts: 1 }));

      await repository.retry({ taskId: "task-1", lastError: "oops", minRetryIntervalMins: 10 });

      expect(prismaMock.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: {
          attempts: { increment: 1 },
          lastError: "oops",
          lastFailedAttemptAt: NOW,
          scheduledAt: new Date(NOW.getTime() + 10 * 60 * 1000),
        },
      });
    });

    it("treats null/zero minRetryIntervalMins as no reschedule", async () => {
      prismaMock.task.update.mockResolvedValue(makeTask({ attempts: 1 }));

      await repository.retry({ taskId: "task-1", minRetryIntervalMins: null });
      await repository.retry({ taskId: "task-1", minRetryIntervalMins: 0 });

      for (const call of prismaMock.task.update.mock.calls) {
        expect(call[0].data).not.toHaveProperty("scheduledAt");
        expect(call[0].data).toMatchObject({ lastError: undefined });
      }
    });
  });

  describe("succeed / updatePayload / cancel", () => {
    it("succeed increments attempts and stamps succeededAt", async () => {
      prismaMock.task.update.mockResolvedValue(makeTask({ succeededAt: NOW }));

      await repository.succeed("task-1");

      expect(prismaMock.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: { attempts: { increment: 1 }, succeededAt: NOW },
      });
    });

    it("updatePayload replaces the payload", async () => {
      prismaMock.task.update.mockResolvedValue(makeTask({ payload: "new" }));

      const result = await repository.updatePayload("task-1", "new");

      expect(result.payload).toBe("new");
      expect(prismaMock.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: { payload: "new" },
      });
    });

    it("cancel deletes the task by id", async () => {
      prismaMock.task.delete.mockResolvedValue(makeTask());

      await repository.cancel("task-1");

      expect(prismaMock.task.delete).toHaveBeenCalledWith({ where: { id: "task-1" } });
    });
  });

  describe("cancelWithReference", () => {
    it("deletes by the referenceUid_type compound key and selects only id", async () => {
      prismaMock.task.delete.mockResolvedValue(makeTask({ id: "deleted-id" }));

      const result = await repository.cancelWithReference("ref-1", "sendWebhook");

      expect(result).toEqual(expect.objectContaining({ id: "deleted-id" }));
      expect(prismaMock.task.delete).toHaveBeenCalledWith({
        where: { referenceUid_type: { referenceUid: "ref-1", type: "sendWebhook" } },
        select: { id: true },
      });
    });

    it("returns null and warns when the record does not exist (P2025)", async () => {
      prismaMock.task.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Record to delete does not exist.", {
          code: "P2025",
          clientVersion: "test",
        })
      );

      await expect(repository.cancelWithReference("missing", "sendWebhook")).resolves.toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        "Task with reference missing and type sendWebhook does not exist. No action taken."
      );
    });

    it("rethrows other known prisma errors", async () => {
      const error = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "test",
      });
      prismaMock.task.delete.mockRejectedValue(error);

      await expect(repository.cancelWithReference("ref", "sendWebhook")).rejects.toBe(error);
    });

    it("rethrows non-prisma errors", async () => {
      prismaMock.task.delete.mockRejectedValue(new Error("network"));

      await expect(repository.cancelWithReference("ref", "sendWebhook")).rejects.toThrow("network");
    });
  });

  describe("cleanup", () => {
    it("is currently a no-op", async () => {
      await expect(repository.cleanup()).resolves.toBeUndefined();
      expect(prismaMock.task.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("hasNewerScanTaskForStepId", () => {
    const basePayload = { userId: 1, workflowStepId: 5, workflowStepIds: [5] };

    it("returns true when a pending scan task has a newer createdAt", async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { payload: JSON.stringify({ ...basePayload, createdAt: "2026-03-01T13:00:00.000Z" }) },
      ]);

      await expect(repository.hasNewerScanTaskForStepId(5, "2026-03-01T12:00:00.000Z")).resolves.toBe(true);
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("returns false when all pending tasks are older or equal", async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { payload: JSON.stringify({ ...basePayload, createdAt: "2026-03-01T11:00:00.000Z" }) },
        { payload: JSON.stringify({ ...basePayload, createdAt: "2026-03-01T12:00:00.000Z" }) },
      ]);

      await expect(repository.hasNewerScanTaskForStepId(5, "2026-03-01T12:00:00.000Z")).resolves.toBe(false);
    });

    it("ignores tasks without createdAt", async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ payload: JSON.stringify(basePayload) }]);

      await expect(repository.hasNewerScanTaskForStepId(5, "2026-03-01T12:00:00.000Z")).resolves.toBe(false);
    });

    it("ignores tasks whose payload is invalid JSON or fails schema validation", async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { payload: "not-json" },
        { payload: JSON.stringify({ createdAt: "2026-03-01T13:00:00.000Z" }) },
      ]);

      await expect(repository.hasNewerScanTaskForStepId(5, "2026-03-01T12:00:00.000Z")).resolves.toBe(false);
    });

    it("returns false when there are no pending tasks", async () => {
      prismaMock.$queryRaw.mockResolvedValue([]);

      await expect(repository.hasNewerScanTaskForStepId(5, "2026-03-01T12:00:00.000Z")).resolves.toBe(false);
    });
  });
});
