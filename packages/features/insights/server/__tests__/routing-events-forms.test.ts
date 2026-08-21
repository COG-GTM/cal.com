import { readonlyPrisma } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoutingEventsInsights } from "../routing-events";

vi.mock("@calcom/prisma", () => ({
  readonlyPrisma: {
    team: {
      findMany: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
    },
    app_RoutingForms_Form: {
      findMany: vi.fn(),
    },
  },
}));

const teamFindMany = vi.mocked(readonlyPrisma.team.findMany);
const membershipFindMany = vi.mocked(readonlyPrisma.membership.findMany);
const formFindMany = vi.mocked(readonlyPrisma.app_RoutingForms_Form.findMany);

describe("RoutingEventsInsights.getRoutingFormsForFilters", () => {
  beforeEach(() => {
    teamFindMany.mockReset();
    membershipFindMany.mockReset();
    formFindMany.mockReset();
    formFindMany.mockResolvedValue([]);
  });

  it("scopes to the personal forms of the user when no team is given", async () => {
    await RoutingEventsInsights.getRoutingFormsForFilters({ userId: 3, isAll: false });

    expect(teamFindMany).not.toHaveBeenCalled();
    expect(formFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 3, teamId: null } })
    );
  });

  it("expands an organization into its child teams and filters by accepted memberships", async () => {
    teamFindMany.mockResolvedValue([{ id: 20 }, { id: 21 }]);
    membershipFindMany.mockResolvedValue([{ teamId: 10 }, { teamId: 20 }]);

    await RoutingEventsInsights.getRoutingFormsForFilters({ userId: 3, isAll: true, organizationId: 10 });

    expect(teamFindMany).toHaveBeenCalledWith({ where: { parentId: 10 }, select: { id: true } });
    expect(membershipFindMany).toHaveBeenCalledWith({
      where: { userId: 3, teamId: { in: [10, 20, 21] }, accepted: true },
      select: { teamId: true },
    });
    expect(formFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: { in: [10, 20] } } })
    );
  });

  it("falls back to personal forms when the user is not an accepted member of the requested team", async () => {
    membershipFindMany.mockResolvedValue([]);

    await RoutingEventsInsights.getRoutingFormsForFilters({ userId: 3, teamId: 7, isAll: false });

    expect(formFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 3, teamId: null } })
    );
  });

  it("selects the response count for each form", async () => {
    formFindMany.mockResolvedValue([{ id: "form-1", name: "Form 1", _count: { responses: 4 } }]);

    const forms = await RoutingEventsInsights.getRoutingFormsForFilters({ userId: 3, isAll: false });

    expect(formFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true, _count: { select: { responses: true } } },
      })
    );
    expect(forms).toEqual([{ id: "form-1", name: "Form 1", _count: { responses: 4 } }]);
  });
});

describe("RoutingEventsInsights.getRoutingFormFieldOptions", () => {
  beforeEach(() => {
    teamFindMany.mockReset();
    membershipFindMany.mockReset();
    formFindMany.mockReset();
  });

  it("flattens and parses the fields of every matching form", async () => {
    formFindMany.mockResolvedValue([
      { id: "f1", fields: [{ id: "a", label: "A", type: "text" }] },
      { id: "f2", fields: [{ id: "b", label: "B", type: "number" }] },
    ]);

    const fields = await RoutingEventsInsights.getRoutingFormFieldOptions({ userId: 1, isAll: false });

    expect(fields).toEqual([
      { id: "a", label: "A", type: "text" },
      { id: "b", label: "B", type: "number" },
    ]);
  });

  it("narrows to a single form when routingFormId is provided", async () => {
    formFindMany.mockResolvedValue([]);

    await RoutingEventsInsights.getRoutingFormFieldOptions({
      userId: 1,
      isAll: false,
      routingFormId: "form-9",
    });

    expect(formFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 1, teamId: null, id: "form-9" } })
    );
  });

  it("throws when a form contains a field that does not match the schema", async () => {
    formFindMany.mockResolvedValue([{ id: "f1", fields: [{ label: "missing id", type: "text" }] }]);

    await expect(
      RoutingEventsInsights.getRoutingFormFieldOptions({ userId: 1, isAll: false })
    ).rejects.toThrow();
  });
});

describe("RoutingEventsInsights.getRoutingFormHeaders", () => {
  beforeEach(() => {
    teamFindMany.mockReset();
    membershipFindMany.mockReset();
    formFindMany.mockReset();
  });

  it("keeps supported fields and drops deleted ones, unsupported types and label-less fields", async () => {
    formFindMany.mockResolvedValue([
      {
        id: "f1",
        name: "Form 1",
        fields: [
          { id: "text", label: "Text", type: "text" },
          { id: "deleted", label: "Deleted", type: "text", deleted: true },
          { id: "unsupported", label: "Unsupported", type: "radio" },
          { id: "nolabel", label: "", type: "text" },
        ],
      },
    ]);

    const headers = await RoutingEventsInsights.getRoutingFormHeaders({ userId: 1, isAll: false });

    expect(headers.map((header) => header.id)).toEqual(["text"]);
    expect(headers[0]).toEqual({ id: "text", label: "Text", type: "text", options: undefined });
  });

  it("drops select and multiselect fields without options", async () => {
    formFindMany.mockResolvedValue([
      {
        id: "f1",
        name: "Form 1",
        fields: [
          { id: "select-empty", label: "Empty select", type: "select", options: [] },
          { id: "multi-missing", label: "Missing options", type: "multiselect" },
          {
            id: "select-ok",
            label: "Select",
            type: "select",
            options: [{ id: "opt-1", label: "Option 1" }],
          },
        ],
      },
    ]);

    const headers = await RoutingEventsInsights.getRoutingFormHeaders({ userId: 1, isAll: false });

    expect(headers.map((header) => header.id)).toEqual(["select-ok"]);
  });

  it("de-duplicates fields aggregated from multiple forms", async () => {
    formFindMany.mockResolvedValue([
      { id: "f1", name: "Form 1", fields: [{ id: "shared", label: "Shared", type: "text" }] },
      { id: "f2", name: "Form 2", fields: [{ id: "shared", label: "Shared", type: "text" }] },
    ]);

    const headers = await RoutingEventsInsights.getRoutingFormHeaders({ userId: 1, isAll: false });

    expect(headers).toHaveLength(1);
  });

  it("returns an empty list when no forms match", async () => {
    formFindMany.mockResolvedValue([]);

    await expect(RoutingEventsInsights.getRoutingFormHeaders({ userId: 1, isAll: false })).resolves.toEqual(
      []
    );
  });
});

describe("RoutingEventsInsights.objectToCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(RoutingEventsInsights.objectToCsv([])).toBe("");
  });

  it("quotes values with commas, quotes or newlines", () => {
    const csv = RoutingEventsInsights.objectToCsv([{ a: 'x,"y"', b: "plain" }]);

    expect(csv).toBe(["a,b", '"x,""y""",plain'].join("\n"));
  });

  it("emits empty cells for missing keys", () => {
    const csv = RoutingEventsInsights.objectToCsv([{ a: "1", b: "2" }, { a: "3" }]);

    expect(csv.split("\n")).toEqual(["a,b", "1,2", "3,"]);
  });
});
