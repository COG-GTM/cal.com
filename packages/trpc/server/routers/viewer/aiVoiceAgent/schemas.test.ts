import { describe, expect, it } from "vitest";
import { ZCreateInputSchema } from "./create.schema";
import { ZCreateWebCallInputSchema } from "./createWebCall.schema";
import { ZDeleteInputSchema } from "./delete.schema";
import { ZGetInputSchema } from "./get.schema";
import { ZListInputSchema } from "./list.schema";
import { ZListCallsInputSchema } from "./listCalls.schema";
import { ZSetupInboundAgentInputSchema } from "./setupInboundAgent.schema";
import { ZTestCallInputSchema } from "./testCall.schema";
import { ZUpdateInputSchema } from "./update.schema";
import { ZUpdateInboundAgentEventTypeInputSchema } from "./updateInboundAgentEventType.schema";

describe("AI voice agent schemas", () => {
  it("parses create input and applies the default voice", () => {
    expect(ZCreateInputSchema.parse({ name: "Agent" })).toMatchObject({
      name: "Agent",
      voiceId: "11labs-Adrian",
    });
    expect(ZCreateInputSchema.safeParse({ name: 1 }).success).toBe(false);
  });

  it("validates create web calls", () => {
    expect(ZCreateWebCallInputSchema.parse({ agentId: "agent-1", eventTypeId: 1 })).toEqual({
      agentId: "agent-1",
      eventTypeId: 1,
    });
    expect(ZCreateWebCallInputSchema.safeParse({ agentId: "", eventTypeId: 1 }).success).toBe(false);
    expect(ZCreateWebCallInputSchema.safeParse({ agentId: "agent-1", eventTypeId: 0 }).success).toBe(false);
  });

  it("parses and rejects key identifier schemas", () => {
    expect(ZDeleteInputSchema.parse({ id: "agent-1" })).toEqual({ id: "agent-1" });
    expect(ZGetInputSchema.parse({ id: "agent-1" })).toEqual({ id: "agent-1" });
    expect(ZDeleteInputSchema.safeParse({ id: 1 }).success).toBe(false);
    expect(ZGetInputSchema.safeParse({}).success).toBe(false);
  });

  it("allows undefined list input and defaults scope to all", () => {
    expect(ZListInputSchema.parse(undefined)).toBeUndefined();
    expect(ZListInputSchema.parse({})).toEqual({ scope: "all" });
    expect(ZListInputSchema.safeParse({ scope: "invalid" }).success).toBe(false);
  });

  it("validates list calls pagination and applies defaults", () => {
    expect(ZListCallsInputSchema.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(ZListCallsInputSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(ZListCallsInputSchema.safeParse({ limit: 1001 }).success).toBe(false);
    expect(ZListCallsInputSchema.safeParse({ offset: -1 }).success).toBe(false);
    expect(ZListCallsInputSchema.parse({ limit: 10, offset: 2 }).limit).toBe(10);
  });

  it("requires setup inbound workflow steps", () => {
    expect(ZSetupInboundAgentInputSchema.parse({ phoneNumber: "+15550001", workflowStepId: 1 })).toEqual({
      phoneNumber: "+15550001",
      workflowStepId: 1,
    });
    expect(ZSetupInboundAgentInputSchema.safeParse({ phoneNumber: "+15550001" }).success).toBe(false);
  });

  it("validates test call and inbound event type inputs", () => {
    expect(ZTestCallInputSchema.parse({ agentId: "agent-1", eventTypeId: 1 })).toEqual({
      agentId: "agent-1",
      eventTypeId: 1,
    });
    expect(ZUpdateInboundAgentEventTypeInputSchema.parse({ agentId: "agent-1", eventTypeId: 1 })).toEqual({
      agentId: "agent-1",
      eventTypeId: 1,
    });
    expect(ZTestCallInputSchema.safeParse({ agentId: "agent-1" }).success).toBe(false);
    expect(ZUpdateInboundAgentEventTypeInputSchema.safeParse({ eventTypeId: 1 }).success).toBe(false);
  });

  it("defaults nullish update fields to null and rejects unknown languages", () => {
    expect(ZUpdateInputSchema.parse({ id: "agent-1" })).toMatchObject({
      id: "agent-1",
      generalPrompt: null,
      beginMessage: null,
    });
    expect(ZUpdateInputSchema.safeParse({ id: "agent-1", language: "xx-XX" }).success).toBe(false);
    expect(
      ZUpdateInputSchema.parse({
        id: "agent-1",
        generalTools: [{ type: "custom", name: "tool" }],
      }).generalTools
    ).toEqual([
      {
        type: "custom",
        name: "tool",
        description: null,
        cal_api_key: null,
        event_type_id: null,
        timezone: null,
      },
    ]);
  });
});
