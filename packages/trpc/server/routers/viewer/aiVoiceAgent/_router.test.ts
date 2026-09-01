import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/prisma", () => ({ default: {}, prisma: {} }));

vi.mock("../../../procedures/authedProcedure", async () => {
  const { middleware, procedure } = await vi.importActual<typeof import("../../../trpc")>("../../../trpc");
  const passthrough = procedure.use(
    middleware(({ next }) =>
      next({
        ctx: {
          user: { id: 1 },
          session: { user: { id: 1 }, upId: "usr-1" },
        },
      })
    )
  );
  return {
    default: passthrough,
    authedAdminProcedure: passthrough,
    authedOrgAdminProcedure: passthrough,
  };
});

vi.mock("../eventTypes/util", async () => {
  const { middleware, procedure } = await vi.importActual<typeof import("../../../trpc")>("../../../trpc");
  const passthrough = procedure.use(
    middleware(({ next }) =>
      next({
        ctx: {
          user: { id: 1 },
          session: { user: { id: 1 }, upId: "usr-1" },
        },
      })
    )
  );
  return { eventOwnerProcedure: passthrough };
});

vi.mock("./create.handler", () => ({ createHandler: vi.fn() }));
vi.mock("./createWebCall.handler", () => ({ createWebCallHandler: vi.fn() }));
vi.mock("./delete.handler", () => ({ deleteHandler: vi.fn() }));
vi.mock("./get.handler", () => ({ getHandler: vi.fn() }));
vi.mock("./list.handler", () => ({ listHandler: vi.fn() }));
vi.mock("./listCalls.handler", () => ({ listCallsHandler: vi.fn() }));
vi.mock("./listVoices.handler", () => ({ listVoicesHandler: vi.fn() }));
vi.mock("./setupInboundAgent.handler", () => ({ setupInboundAgentHandler: vi.fn() }));
vi.mock("./testCall.handler", () => ({ testCallHandler: vi.fn() }));
vi.mock("./update.handler", () => ({ updateHandler: vi.fn() }));
vi.mock("./updateInboundAgentEventType.handler", () => ({
  updateInboundAgentEventTypeHandler: vi.fn(),
}));

import { aiVoiceAgentRouter } from "./_router";

describe("aiVoiceAgentRouter", () => {
  it("exposes and dispatches the complete AI voice agent procedure set", async () => {
    const procedures = aiVoiceAgentRouter._def.procedures;
    expect(Object.keys(procedures).sort()).toEqual(
      [
        "list",
        "get",
        "create",
        "update",
        "delete",
        "testCall",
        "listCalls",
        "createWebCall",
        "listVoices",
        "setupInboundAgent",
        "updateInboundAgentEventType",
      ].sort()
    );

    const ctx = {
      user: { id: 1 },
      session: { user: { id: 1 }, upId: "usr-1" },
    };
    const invoke = async (procedure: (typeof procedures)[keyof typeof procedures], input: unknown) => {
      const request = { ctx, input } as Parameters<typeof procedure._def.resolver>[0];
      return procedure._def.resolver(request);
    };

    await invoke(procedures.list, undefined);
    await invoke(procedures.get, { id: "agent-1" });
    await invoke(procedures.create, {});
    await invoke(procedures.update, { id: "agent-1" });
    await invoke(procedures.delete, { id: "agent-1" });
    await invoke(procedures.testCall, { agentId: "agent-1", eventTypeId: 1 });
    await invoke(procedures.listCalls, {});
    await invoke(procedures.createWebCall, { agentId: "agent-1", eventTypeId: 1 });
    await invoke(procedures.listVoices, undefined);
    await invoke(procedures.setupInboundAgent, { phoneNumber: "+15550001", workflowStepId: 1 });
    await invoke(procedures.updateInboundAgentEventType, { agentId: "agent-1", eventTypeId: 1 });
  });
});
