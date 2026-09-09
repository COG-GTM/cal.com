import type { Attribute, AttributeOptionValueWithType } from "@calcom/app-store/routing-forms/types/types";
import { RaqbLogicResult } from "@calcom/lib/raqb/evaluateRaqbLogic";
import type { AttributesQueryValue } from "@calcom/lib/raqb/types";
import { AttributeType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findTeamMembersMatchingAttributeLogic,
  getAttributesForLogic,
  TroubleshooterCase,
} from "./findTeamMembersMatchingAttributeLogic";

const { mockGetAttributesAssignmentData } = vi.hoisted(() => ({
  mockGetAttributesAssignmentData: vi.fn(),
}));

vi.mock("@calcom/features/attributes/lib/getAttributes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@calcom/features/attributes/lib/getAttributes")>();
  return {
    ...actual,
    getAttributesAssignmentData: mockGetAttributesAssignmentData,
  };
});

type TeamMember = {
  userId: number;
  attributes: Record<string, AttributeOptionValueWithType>;
};

function buildAttribute({
  id,
  name,
  type = AttributeType.SINGLE_SELECT,
  options,
}: {
  id: string;
  name: string;
  type?: AttributeType;
  options: { id: string; value: string }[];
}): Attribute {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s/g, "-"),
    type,
    options: options.map((option) => ({
      id: option.id,
      value: option.value,
      slug: option.value.toLowerCase().replace(/\s/g, "-"),
    })),
  };
}

function buildMemberAttributeValue({
  type,
  values,
}: {
  type: AttributeType;
  values: string[];
}): AttributeOptionValueWithType {
  const options = values.map((value) => ({ isGroup: false, value, contains: [] }));
  return {
    type,
    attributeOption: type === AttributeType.MULTI_SELECT ? options : options[0],
  };
}

function buildQueryValue({
  rules,
}: {
  rules: {
    raqbFieldId: string;
    value: (string | string[])[];
    operator: string;
    valueType?: string[];
  }[];
}): AttributesQueryValue {
  return {
    id: "query-id-1",
    type: "group",
    children1: rules.reduce<Record<string, unknown>>((acc, rule, index) => {
      acc[`rule-${index + 1}`] = {
        type: "rule",
        properties: {
          field: rule.raqbFieldId,
          value: rule.value,
          operator: rule.operator,
          valueSrc: ["value"],
          valueType: rule.valueType ?? ["select"],
        },
      };
      return acc;
    }, {}),
  } as unknown as AttributesQueryValue;
}

function mockAttributesAssignmentData({
  attributesOfTheOrg,
  teamMembers,
}: {
  attributesOfTheOrg: Attribute[];
  teamMembers: TeamMember[];
}) {
  mockGetAttributesAssignmentData.mockResolvedValue({
    attributesOfTheOrg,
    attributesAssignedToTeamMembersWithOptions: teamMembers,
  });
}

const Option1 = { id: "attr-1-opt-1", value: "Option 1" };
const Option2 = { id: "attr-1-opt-2", value: "Option 2" };
const Attribute1 = buildAttribute({
  id: "attr1",
  name: "Attribute 1",
  options: [Option1, Option2],
});

const teamAndOrg = { teamId: 1, orgId: 2 };

describe("findTeamMembersMatchingAttributeLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null(all members match) when the query value has no rules", async () => {
    mockAttributesAssignmentData({ attributesOfTheOrg: [Attribute1], teamMembers: [] });

    const { teamMembersMatchingAttributeLogic, checkedFallback, troubleshooter } =
      await findTeamMembersMatchingAttributeLogic(
        {
          ...teamAndOrg,
          attributesQueryValue: { type: "group" } as unknown as AttributesQueryValue,
        },
        { enableTroubleshooter: true }
      );

    expect(teamMembersMatchingAttributeLogic).toBeNull();
    expect(checkedFallback).toBe(false);
    expect(troubleshooter?.type).toBe(TroubleshooterCase.MATCHES_ALL_MEMBERS_BECAUSE_OF_EMPTY_QUERY_VALUE);
  });

  it("returns null(all members match) when attributesQueryValue is null", async () => {
    mockAttributesAssignmentData({ attributesOfTheOrg: [Attribute1], teamMembers: [] });

    const { teamMembersMatchingAttributeLogic } = await findTeamMembersMatchingAttributeLogic({
      ...teamAndOrg,
      attributesQueryValue: null,
    });

    expect(teamMembersMatchingAttributeLogic).toBeNull();
  });

  it("matches only the members having the selected option of a SINGLE_SELECT attribute", async () => {
    mockAttributesAssignmentData({
      attributesOfTheOrg: [Attribute1],
      teamMembers: [
        {
          userId: 10,
          attributes: {
            [Attribute1.id]: buildMemberAttributeValue({
              type: AttributeType.SINGLE_SELECT,
              values: [Option1.value],
            }),
          },
        },
        {
          userId: 11,
          attributes: {
            [Attribute1.id]: buildMemberAttributeValue({
              type: AttributeType.SINGLE_SELECT,
              values: [Option2.value],
            }),
          },
        },
      ],
    });

    const { teamMembersMatchingAttributeLogic, checkedFallback } =
      await findTeamMembersMatchingAttributeLogic({
        ...teamAndOrg,
        attributesQueryValue: buildQueryValue({
          rules: [{ raqbFieldId: Attribute1.id, value: [Option1.id], operator: "select_equals" }],
        }),
      });

    expect(teamMembersMatchingAttributeLogic).toEqual([{ userId: 10, result: RaqbLogicResult.MATCH }]);
    expect(checkedFallback).toBe(false);
  });

  it("matches members of a MULTI_SELECT attribute with the 'any in' operator", async () => {
    const MultiSelectAttribute = buildAttribute({
      id: "attr2",
      name: "Attribute 2",
      type: AttributeType.MULTI_SELECT,
      options: [Option1, Option2],
    });

    mockAttributesAssignmentData({
      attributesOfTheOrg: [MultiSelectAttribute],
      teamMembers: [
        {
          userId: 10,
          attributes: {
            [MultiSelectAttribute.id]: buildMemberAttributeValue({
              type: AttributeType.MULTI_SELECT,
              values: [Option2.value],
            }),
          },
        },
        {
          userId: 11,
          attributes: {
            [MultiSelectAttribute.id]: buildMemberAttributeValue({
              type: AttributeType.MULTI_SELECT,
              values: [Option1.value],
            }),
          },
        },
      ],
    });

    const { teamMembersMatchingAttributeLogic } = await findTeamMembersMatchingAttributeLogic({
      ...teamAndOrg,
      attributesQueryValue: buildQueryValue({
        rules: [
          {
            raqbFieldId: MultiSelectAttribute.id,
            value: [[Option1.id]],
            operator: "multiselect_some_in",
            valueType: ["multiselect"],
          },
        ],
      }),
    });

    expect(teamMembersMatchingAttributeLogic).toEqual([{ userId: 11, result: RaqbLogicResult.MATCH }]);
  });

  it("resolves a 'Value of field' operand against the form response", async () => {
    const fieldId = "field-1";
    mockAttributesAssignmentData({
      attributesOfTheOrg: [Attribute1],
      teamMembers: [
        {
          userId: 10,
          attributes: {
            [Attribute1.id]: buildMemberAttributeValue({
              type: AttributeType.SINGLE_SELECT,
              values: [Option1.value],
            }),
          },
        },
      ],
    });

    const { teamMembersMatchingAttributeLogic } = await findTeamMembersMatchingAttributeLogic({
      ...teamAndOrg,
      attributesQueryValue: buildQueryValue({
        rules: [{ raqbFieldId: Attribute1.id, value: [`{field:${fieldId}}`], operator: "select_equals" }],
      }),
      dynamicFieldValueOperands: {
        fields: [
          { id: fieldId, type: "select", label: "Field 1", options: [{ id: null, label: "Option 1" }] },
        ],
        response: { [fieldId]: { value: Option1.value, label: Option1.value } },
      },
    });

    expect(teamMembersMatchingAttributeLogic).toEqual([{ userId: 10, result: RaqbLogicResult.MATCH }]);
  });

  it("only requests the attributes referenced by the query values", async () => {
    mockAttributesAssignmentData({ attributesOfTheOrg: [Attribute1], teamMembers: [] });

    await findTeamMembersMatchingAttributeLogic({
      ...teamAndOrg,
      attributesQueryValue: buildQueryValue({
        rules: [{ raqbFieldId: Attribute1.id, value: [Option1.id], operator: "select_equals" }],
      }),
    });

    expect(mockGetAttributesAssignmentData).toHaveBeenCalledWith({
      teamId: teamAndOrg.teamId,
      orgId: teamAndOrg.orgId,
      attributeIds: [Attribute1.id],
    });
  });

  it("fetches all attributes when no attribute is referenced by the query value", async () => {
    mockAttributesAssignmentData({ attributesOfTheOrg: [Attribute1], teamMembers: [] });

    await findTeamMembersMatchingAttributeLogic({
      ...teamAndOrg,
      attributesQueryValue: null,
    });

    expect(mockGetAttributesAssignmentData).toHaveBeenCalledWith({
      teamId: teamAndOrg.teamId,
      orgId: teamAndOrg.orgId,
      attributeIds: undefined,
    });
  });

  describe("fallback logic", () => {
    const noMatchQueryValue = buildQueryValue({
      rules: [{ raqbFieldId: Attribute1.id, value: [Option2.id], operator: "select_equals" }],
    });
    const matchQueryValue = buildQueryValue({
      rules: [{ raqbFieldId: Attribute1.id, value: [Option1.id], operator: "select_equals" }],
    });

    beforeEach(() => {
      mockAttributesAssignmentData({
        attributesOfTheOrg: [Attribute1],
        teamMembers: [
          {
            userId: 10,
            attributes: {
              [Attribute1.id]: buildMemberAttributeValue({
                type: AttributeType.SINGLE_SELECT,
                values: [Option1.value],
              }),
            },
          },
        ],
      });
    });

    it("uses the fallback query value when the main logic matches nobody", async () => {
      const { teamMembersMatchingAttributeLogic, checkedFallback } =
        await findTeamMembersMatchingAttributeLogic({
          ...teamAndOrg,
          attributesQueryValue: noMatchQueryValue,
          fallbackAttributesQueryValue: matchQueryValue,
        });

      expect(checkedFallback).toBe(true);
      expect(teamMembersMatchingAttributeLogic).toEqual([{ userId: 10, result: RaqbLogicResult.MATCH }]);
    });

    it("does not consider the fallback when the key isn't provided at all", async () => {
      const { teamMembersMatchingAttributeLogic, checkedFallback } =
        await findTeamMembersMatchingAttributeLogic({
          ...teamAndOrg,
          attributesQueryValue: noMatchQueryValue,
        });

      expect(checkedFallback).toBe(false);
      expect(teamMembersMatchingAttributeLogic).toEqual([]);
    });

    it("matches all members when the fallback query value is undefined", async () => {
      const { teamMembersMatchingAttributeLogic, checkedFallback } =
        await findTeamMembersMatchingAttributeLogic({
          ...teamAndOrg,
          attributesQueryValue: noMatchQueryValue,
          fallbackAttributesQueryValue: undefined,
        });

      expect(checkedFallback).toBe(true);
      expect(teamMembersMatchingAttributeLogic).toBeNull();
    });

    it("does not run the fallback when the main logic matched somebody", async () => {
      const { teamMembersMatchingAttributeLogic, checkedFallback } =
        await findTeamMembersMatchingAttributeLogic({
          ...teamAndOrg,
          attributesQueryValue: matchQueryValue,
          fallbackAttributesQueryValue: noMatchQueryValue,
        });

      expect(checkedFallback).toBe(false);
      expect(teamMembersMatchingAttributeLogic).toEqual([{ userId: 10, result: RaqbLogicResult.MATCH }]);
    });
  });

  describe("troubleshooter", () => {
    beforeEach(() => {
      mockAttributesAssignmentData({
        attributesOfTheOrg: [Attribute1],
        teamMembers: [
          {
            userId: 10,
            attributes: {
              [Attribute1.id]: buildMemberAttributeValue({
                type: AttributeType.SINGLE_SELECT,
                values: [Option1.value],
              }),
            },
          },
        ],
      });
    });

    it("is not returned unless enabled", async () => {
      const { troubleshooter } = await findTeamMembersMatchingAttributeLogic({
        ...teamAndOrg,
        attributesQueryValue: buildQueryValue({
          rules: [{ raqbFieldId: Attribute1.id, value: [Option1.id], operator: "select_equals" }],
        }),
      });

      expect(troubleshooter).toBeUndefined();
    });

    it("reports the match results along with the per user attributes data", async () => {
      const { troubleshooter } = await findTeamMembersMatchingAttributeLogic(
        {
          ...teamAndOrg,
          attributesQueryValue: buildQueryValue({
            rules: [{ raqbFieldId: Attribute1.id, value: [Option1.id], operator: "select_equals" }],
          }),
        },
        { enableTroubleshooter: true }
      );

      expect(troubleshooter?.type).toBe(TroubleshooterCase.MATCH_RESULTS_READY);
      expect(troubleshooter?.data.attributesOfTheOrg).toEqual([Attribute1]);
      expect(troubleshooter?.data.attributesDataPerUser).toEqual(
        new Map([[10, { [Attribute1.id]: Option1.value.toLowerCase() }]])
      );
    });

    it("reports that the fallback was used", async () => {
      const { troubleshooter } = await findTeamMembersMatchingAttributeLogic(
        {
          ...teamAndOrg,
          attributesQueryValue: buildQueryValue({
            rules: [{ raqbFieldId: Attribute1.id, value: [Option2.id], operator: "select_equals" }],
          }),
          fallbackAttributesQueryValue: buildQueryValue({
            rules: [{ raqbFieldId: Attribute1.id, value: [Option1.id], operator: "select_equals" }],
          }),
        },
        { enableTroubleshooter: true }
      );

      expect(troubleshooter?.type).toBe(TroubleshooterCase.MATCH_RESULTS_READY_WITH_FALLBACK);
    });
  });

  describe("logic building errors", () => {
    beforeEach(() => {
      mockAttributesAssignmentData({
        attributesOfTheOrg: [Attribute1],
        teamMembers: [
          {
            userId: 10,
            attributes: {
              [Attribute1.id]: buildMemberAttributeValue({
                type: AttributeType.SINGLE_SELECT,
                values: [Option1.value],
              }),
            },
          },
        ],
      });
    });

    it("matches nobody when the option used in the rule doesn't exist", async () => {
      const { teamMembersMatchingAttributeLogic } = await findTeamMembersMatchingAttributeLogic({
        ...teamAndOrg,
        attributesQueryValue: buildQueryValue({
          rules: [{ raqbFieldId: Attribute1.id, value: ["non-existing-option"], operator: "select_equals" }],
        }),
      });

      expect(teamMembersMatchingAttributeLogic).toEqual([]);
    });

    it("matches all members when the rule uses an attribute that isn't in the org", async () => {
      const { teamMembersMatchingAttributeLogic, mainAttributeLogicBuildingWarnings, troubleshooter } =
        await findTeamMembersMatchingAttributeLogic(
          {
            ...teamAndOrg,
            attributesQueryValue: buildQueryValue({
              rules: [{ raqbFieldId: "unknown-attribute", value: [Option1.id], operator: "select_equals" }],
            }),
          },
          { enableTroubleshooter: true }
        );

      expect(teamMembersMatchingAttributeLogic).toBeNull();
      expect(mainAttributeLogicBuildingWarnings).toBeNull();
      expect(troubleshooter?.type).toBe(TroubleshooterCase.NO_LOGIC_FOUND);
    });
  });

  describe("performance measurement", () => {
    beforeEach(() => {
      mockAttributesAssignmentData({
        attributesOfTheOrg: [Attribute1],
        teamMembers: [
          {
            userId: 10,
            attributes: {
              [Attribute1.id]: buildMemberAttributeValue({
                type: AttributeType.SINGLE_SELECT,
                values: [Option1.value],
              }),
            },
          },
        ],
      });
    });

    const queryValue = buildQueryValue({
      rules: [{ raqbFieldId: Attribute1.id, value: [Option1.id], operator: "select_equals" }],
    });

    it("doesn't measure the individual steps by default", async () => {
      const { timeTaken } = await findTeamMembersMatchingAttributeLogic({
        ...teamAndOrg,
        attributesQueryValue: queryValue,
      });

      expect("ttgetAttributesQueryBuilderConfigHavingListofLabels" in timeTaken).toBe(true);
      if ("ttgetAttributesQueryBuilderConfigHavingListofLabels" in timeTaken) {
        expect(timeTaken.ttgetAttributesQueryBuilderConfigHavingListofLabels).toBeNull();
        expect(timeTaken.ttTeamMembersMatchingAttributeLogic).toBeNull();
      }
      expect(typeof timeTaken.ttGetAttributesForLogic).toBe("number");
    });

    it("measures the individual steps when enablePerf is set", async () => {
      const { timeTaken } = await findTeamMembersMatchingAttributeLogic(
        { ...teamAndOrg, attributesQueryValue: queryValue },
        { enablePerf: true, concurrency: 4 }
      );

      expect("ttgetAttributesQueryBuilderConfigHavingListofLabels" in timeTaken).toBe(true);
      if ("ttgetAttributesQueryBuilderConfigHavingListofLabels" in timeTaken) {
        expect(typeof timeTaken.ttgetAttributesQueryBuilderConfigHavingListofLabels).toBe("number");
        expect(typeof timeTaken.ttTeamMembersMatchingAttributeLogic).toBe("number");
      }
    });
  });

  describe("routing form trace service", () => {
    const buildTraceService = () => ({ attributeLogicEvaluated: vi.fn() });

    type Options = NonNullable<Parameters<typeof findTeamMembersMatchingAttributeLogic>[1]>;
    const withTraceService = (service: ReturnType<typeof buildTraceService>): Options => ({
      routingFormTraceService: service as unknown as Options["routingFormTraceService"],
    });

    it("reports the attribute name/value pairs that were matched", async () => {
      mockAttributesAssignmentData({
        attributesOfTheOrg: [Attribute1],
        teamMembers: [
          {
            userId: 10,
            attributes: {
              [Attribute1.id]: buildMemberAttributeValue({
                type: AttributeType.SINGLE_SELECT,
                values: [Option1.value],
              }),
            },
          },
        ],
      });

      const routingFormTraceService = buildTraceService();

      await findTeamMembersMatchingAttributeLogic(
        {
          ...teamAndOrg,
          attributesQueryValue: buildQueryValue({
            rules: [{ raqbFieldId: Attribute1.id, value: [Option1.id], operator: "select_equals" }],
          }),
          routeName: "Route 1",
          routeIsFallback: false,
        },
        withTraceService(routingFormTraceService)
      );

      expect(routingFormTraceService.attributeLogicEvaluated).toHaveBeenCalledWith({
        routeName: "Route 1",
        routeIsFallback: false,
        checkedFallback: false,
        attributeRoutingDetails: [
          { attributeName: Attribute1.name, attributeValue: Option1.value.toLowerCase() },
        ],
      });
    });

    it("reports an unresolvable 'Value of field' operand as (empty)", async () => {
      mockAttributesAssignmentData({
        attributesOfTheOrg: [Attribute1],
        teamMembers: [],
      });

      const routingFormTraceService = buildTraceService();
      const fieldId = "field-1";

      await findTeamMembersMatchingAttributeLogic(
        {
          ...teamAndOrg,
          attributesQueryValue: buildQueryValue({
            rules: [{ raqbFieldId: Attribute1.id, value: [`{field:${fieldId}}`], operator: "select_equals" }],
          }),
          dynamicFieldValueOperands: {
            fields: [{ id: fieldId, type: "text", label: "Field 1" }],
            response: { [fieldId]: { value: "", label: "" } },
          },
        },
        withTraceService(routingFormTraceService)
      );

      expect(routingFormTraceService.attributeLogicEvaluated).toHaveBeenCalledWith(
        expect.objectContaining({
          attributeRoutingDetails: [{ attributeName: Attribute1.name, attributeValue: "(empty)" }],
        })
      );
    });

    it("keeps the template as is when the field of a 'Value of field' operand doesn't exist", async () => {
      mockAttributesAssignmentData({
        attributesOfTheOrg: [Attribute1],
        teamMembers: [],
      });

      const routingFormTraceService = buildTraceService();

      await findTeamMembersMatchingAttributeLogic(
        {
          ...teamAndOrg,
          attributesQueryValue: buildQueryValue({
            rules: [
              { raqbFieldId: Attribute1.id, value: ["{field:unknown-field}"], operator: "select_equals" },
            ],
          }),
          dynamicFieldValueOperands: {
            fields: [{ id: "field-1", type: "text", label: "Field 1" }],
            response: {},
          },
        },
        withTraceService(routingFormTraceService)
      );

      expect(routingFormTraceService.attributeLogicEvaluated).toHaveBeenCalledWith(
        expect.objectContaining({
          attributeRoutingDetails: [
            { attributeName: Attribute1.name, attributeValue: "{field:unknown-field}" },
          ],
        })
      );
    });

    it("reports no details when the query value has no rules", async () => {
      mockAttributesAssignmentData({ attributesOfTheOrg: [Attribute1], teamMembers: [] });

      const routingFormTraceService = buildTraceService();

      await findTeamMembersMatchingAttributeLogic(
        {
          ...teamAndOrg,
          attributesQueryValue: null,
        },
        withTraceService(routingFormTraceService)
      );

      expect(routingFormTraceService.attributeLogicEvaluated).toHaveBeenCalledWith(
        expect.objectContaining({ attributeRoutingDetails: [] })
      );
    });

    it("stringifies a non string response value of a 'Value of field' operand", async () => {
      mockAttributesAssignmentData({ attributesOfTheOrg: [Attribute1], teamMembers: [] });

      const routingFormTraceService = buildTraceService();
      const fieldId = "field-1";

      await findTeamMembersMatchingAttributeLogic(
        {
          ...teamAndOrg,
          attributesQueryValue: buildQueryValue({
            rules: [{ raqbFieldId: Attribute1.id, value: [`{field:${fieldId}}`], operator: "select_equals" }],
          }),
          dynamicFieldValueOperands: {
            fields: [{ id: fieldId, type: "number", label: "Field 1" }],
            response: { [fieldId]: { value: 0, label: "0" } },
          },
        },
        withTraceService(routingFormTraceService)
      );

      expect(routingFormTraceService.attributeLogicEvaluated).toHaveBeenCalledWith(
        expect.objectContaining({
          attributeRoutingDetails: [{ attributeName: Attribute1.name, attributeValue: "0" }],
        })
      );
    });

    it("keeps the template as is when the field has no entry in the response", async () => {
      mockAttributesAssignmentData({ attributesOfTheOrg: [Attribute1], teamMembers: [] });

      const routingFormTraceService = buildTraceService();
      const fieldId = "field-1";

      await findTeamMembersMatchingAttributeLogic(
        {
          ...teamAndOrg,
          attributesQueryValue: buildQueryValue({
            rules: [{ raqbFieldId: Attribute1.id, value: [`{field:${fieldId}}`], operator: "select_equals" }],
          }),
          dynamicFieldValueOperands: {
            fields: [{ id: fieldId, type: "text", label: "Field 1" }],
            response: {},
          },
        },
        withTraceService(routingFormTraceService)
      );

      expect(routingFormTraceService.attributeLogicEvaluated).toHaveBeenCalledWith(
        expect.objectContaining({
          attributeRoutingDetails: [{ attributeName: Attribute1.name, attributeValue: `{field:${fieldId}}` }],
        })
      );
    });

    it("joins the values of a multiselect rule", async () => {
      const MultiSelectAttribute = buildAttribute({
        id: "attr2",
        name: "Attribute 2",
        type: AttributeType.MULTI_SELECT,
        options: [Option1, Option2],
      });
      mockAttributesAssignmentData({ attributesOfTheOrg: [MultiSelectAttribute], teamMembers: [] });

      const routingFormTraceService = buildTraceService();
      const fieldId = "field-1";

      await findTeamMembersMatchingAttributeLogic(
        {
          ...teamAndOrg,
          attributesQueryValue: buildQueryValue({
            rules: [
              {
                raqbFieldId: MultiSelectAttribute.id,
                value: [[`{field:${fieldId}}`, Option1.id]],
                operator: "multiselect_some_in",
                valueType: ["multiselect"],
              },
            ],
          }),
          dynamicFieldValueOperands: {
            fields: [{ id: fieldId, type: "text", label: "Field 1" }],
            response: { [fieldId]: { value: "", label: "" } },
          },
        },
        withTraceService(routingFormTraceService)
      );

      expect(routingFormTraceService.attributeLogicEvaluated).toHaveBeenCalledWith(
        expect.objectContaining({
          attributeRoutingDetails: [
            {
              attributeName: MultiSelectAttribute.name,
              attributeValue: `(empty), ${Option1.value.toLowerCase()}`,
            },
          ],
        })
      );
    });

    it("skips rules that reference an attribute that isn't in the org", async () => {
      mockAttributesAssignmentData({ attributesOfTheOrg: [Attribute1], teamMembers: [] });

      const routingFormTraceService = buildTraceService();

      await findTeamMembersMatchingAttributeLogic(
        {
          ...teamAndOrg,
          attributesQueryValue: buildQueryValue({
            rules: [{ raqbFieldId: "unknown-attribute", value: [Option1.id], operator: "select_equals" }],
          }),
        },
        withTraceService(routingFormTraceService)
      );

      expect(routingFormTraceService.attributeLogicEvaluated).toHaveBeenCalledWith(
        expect.objectContaining({ attributeRoutingDetails: [] })
      );
    });

    it("skips rules that have no value set", async () => {
      mockAttributesAssignmentData({ attributesOfTheOrg: [Attribute1], teamMembers: [] });

      const routingFormTraceService = buildTraceService();

      await findTeamMembersMatchingAttributeLogic(
        {
          ...teamAndOrg,
          attributesQueryValue: buildQueryValue({
            rules: [{ raqbFieldId: Attribute1.id, value: [], operator: "select_equals" }],
          }),
        },
        withTraceService(routingFormTraceService)
      );

      expect(routingFormTraceService.attributeLogicEvaluated).toHaveBeenCalledWith(
        expect.objectContaining({ attributeRoutingDetails: [] })
      );
    });
  });
});

describe("getAttributesForLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the org attributes along with the team members data and the time taken", async () => {
    const teamMembers = [
      {
        userId: 10,
        attributes: {
          [Attribute1.id]: buildMemberAttributeValue({
            type: AttributeType.SINGLE_SELECT,
            values: [Option1.value],
          }),
        },
      },
    ];
    mockAttributesAssignmentData({ attributesOfTheOrg: [Attribute1], teamMembers });

    const result = await getAttributesForLogic({ teamId: 1, orgId: 2, attributeIds: [Attribute1.id] });

    expect(result.attributesOfTheOrg).toEqual([Attribute1]);
    expect(result.teamMembersWithAttributeOptionValuePerAttribute).toEqual(teamMembers);
    expect(typeof result.timeTaken).toBe("number");
  });
});
