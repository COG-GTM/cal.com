import { describe, expect, it } from "vitest";
import {
  getUrlSearchParamsToForward,
  getUrlSearchParamsToForwardForReroute,
  getUrlSearchParamsToForwardForTestPreview,
} from "./getUrlSearchParamsToForward";

const fields = [{ id: "field-1", identifier: "email", type: "text", label: "Email" }];
const formResponse = { "field-1": { value: "john@example.com" } };

describe("getUrlSearchParamsToForwardForReroute", () => {
  it("adds the reschedule uid and the rerouting flag to the forwarded params", () => {
    const result = getUrlSearchParamsToForwardForReroute({
      formResponse,
      formResponseId: 1,
      fields,
      searchParams: new URLSearchParams("?existing=value"),
      teamMembersMatchingAttributeLogic: [1, 2],
      attributeRoutingConfig: null,
      rescheduleUid: "booking-uid",
      reroutingFormResponses: { "field-1": { value: "old@example.com" } },
    });

    expect(result.get("rescheduleUid")).toBe("booking-uid");
    expect(result.get("cal.rerouting")).toBe("true");
    expect(result.get("existing")).toBe("value");
    expect(result.get("email")).toBe("john@example.com");
    expect(result.get("cal.routedTeamMemberIds")).toBe("1,2");
    expect(result.get("cal.routingFormResponseId")).toBe("1");
    expect(result.get("cal.reroutingFormResponses")).toBe(
      JSON.stringify({ "field-1": { value: "old@example.com" } })
    );
  });

  it("never forwards a queued form response id", () => {
    const result = getUrlSearchParamsToForwardForReroute({
      formResponse,
      formResponseId: null,
      fields,
      searchParams: new URLSearchParams(),
      teamMembersMatchingAttributeLogic: null,
      attributeRoutingConfig: null,
      rescheduleUid: "booking-uid",
      reroutingFormResponses: {},
    });

    expect(result.get("cal.queuedFormResponseId")).toBeNull();
    expect(result.get("cal.routingFormResponseId")).toBeNull();
  });
});

describe("getUrlSearchParamsToForwardForTestPreview", () => {
  it("marks the params as coming from a test preview and forwards no response ids", () => {
    const result = getUrlSearchParamsToForwardForTestPreview({
      formResponse,
      fields,
      attributeRoutingConfig: null,
      teamMembersMatchingAttributeLogic: [3],
    });

    expect(result.get("cal.isTestPreviewLink")).toBe("true");
    expect(result.get("email")).toBe("john@example.com");
    expect(result.get("cal.routedTeamMemberIds")).toBe("3");
    expect(result.get("cal.routingFormResponseId")).toBeNull();
    expect(result.get("cal.queuedFormResponseId")).toBeNull();
  });
});

describe("getUrlSearchParamsToForward", () => {
  it("skips response entries whose field no longer exists", () => {
    const result = getUrlSearchParamsToForward({
      formResponse: { ...formResponse, "deleted-field": { value: "gone" } },
      fields,
      searchParams: new URLSearchParams(),
      teamMembersMatchingAttributeLogic: null,
      formResponseId: null,
      queuedFormResponseId: null,
      attributeRoutingConfig: null,
    });

    expect(result.get("email")).toBe("john@example.com");
    expect(Array.from(result.keys())).toEqual(["email"]);
  });

  it("keeps all the values of a repeated query param", () => {
    const result = getUrlSearchParamsToForward({
      formResponse: {},
      fields,
      searchParams: new URLSearchParams("?utm=a&utm=b"),
      teamMembersMatchingAttributeLogic: null,
      formResponseId: null,
      queuedFormResponseId: null,
      attributeRoutingConfig: null,
    });

    expect(result.getAll("utm")).toEqual(["a", "b"]);
  });
});

describe("getUrlSearchParamsToForward attributeRoutingConfig", () => {
  const call = (
    attributeRoutingConfig: Parameters<typeof getUrlSearchParamsToForward>[0]["attributeRoutingConfig"]
  ) =>
    getUrlSearchParamsToForward({
      formResponse,
      fields,
      searchParams: new URLSearchParams(),
      teamMembersMatchingAttributeLogic: null,
      formResponseId: null,
      queuedFormResponseId: null,
      attributeRoutingConfig,
    });

  it("forwards the salesforce account lookup field when both the flag and the field name are set", () => {
    const result = call({
      salesforce: { rrSkipToAccountLookupField: true, rrSKipToAccountLookupFieldName: "Owner" },
    });

    expect(result.get("cal.salesforce.rrSkipToAccountLookupField")).toBe("true");
  });

  it("doesn't forward the salesforce account lookup field when the field name is missing", () => {
    const result = call({ salesforce: { rrSkipToAccountLookupField: true } });

    expect(result.get("cal.salesforce.rrSkipToAccountLookupField")).toBeNull();
  });

  it("doesn't forward the salesforce account lookup field when the flag is off", () => {
    const result = call({
      salesforce: { rrSkipToAccountLookupField: false, rrSKipToAccountLookupFieldName: "Owner" },
    });

    expect(result.get("cal.salesforce.rrSkipToAccountLookupField")).toBeNull();
  });
});
