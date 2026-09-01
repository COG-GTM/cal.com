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

import { aiVoiceAgentRouter } from "./_router";

describe("aiVoiceAgentRouter", () => {
  it("exposes the complete AI voice agent procedure set", () => {
    expect(Object.keys(aiVoiceAgentRouter._def.procedures).sort()).toEqual(
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
  });
});
