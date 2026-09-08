import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Tasker, TaskerCreate, TaskerTypes, TaskHandler, TaskTypes } from "./tasker";

describe("tasker contract", () => {
  it("TaskTypes covers every payload key used by the tasks map", () => {
    expectTypeOf<"sendWebhook">().toMatchTypeOf<TaskTypes>();
    expectTypeOf<"bookingAudit">().toMatchTypeOf<TaskTypes>();
    expectTypeOf<"webhookDelivery">().toMatchTypeOf<TaskTypes>();
    expectTypeOf<"internal" | "redis">().toEqualTypeOf<TaskerTypes>();
  });

  it("TaskHandler receives the serialized payload and optional task id", async () => {
    const handler: TaskHandler = vi.fn().mockResolvedValue(undefined);
    expectTypeOf(handler).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(handler).parameter(1).toEqualTypeOf<string | undefined>();

    await handler("payload", "task-id");
    expect(handler).toHaveBeenCalledWith("payload", "task-id");
  });

  it("a Tasker implementation satisfies the interface and TaskerCreate is payload-typed", async () => {
    const create: TaskerCreate = vi.fn().mockResolvedValue("task-id");
    const tasker: Tasker = {
      create,
      cleanup: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue("task-id"),
      cancelWithReference: vi.fn().mockResolvedValue(null),
    };

    expectTypeOf(tasker.create).parameter(0).toEqualTypeOf<TaskTypes>();
    await expect(tasker.create("sendWebhook", "payload", { maxAttempts: 3 })).resolves.toBe("task-id");
    await expect(
      tasker.create("executeAIPhoneCall", {
        workflowReminderId: 1,
        agentId: "agent",
        fromNumber: "+1",
        toNumber: "+2",
        bookingUid: null,
        userId: null,
        teamId: null,
        providerAgentId: "provider",
      })
    ).resolves.toBe("task-id");
    await expect(tasker.cancel("task-id")).resolves.toBe("task-id");
    await expect(tasker.cancelWithReference("ref", "sendWebhook")).resolves.toBeNull();
    await expect(tasker.cleanup()).resolves.toBeUndefined();
  });
});
