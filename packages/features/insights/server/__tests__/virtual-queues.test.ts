import { getSerializableForm } from "@calcom/routing-forms/lib/getSerializableForm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VirtualQueuesInsights } from "../virtual-queues";

vi.mock("@calcom/prisma", () => ({
  readonlyPrisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@calcom/routing-forms/lib/getSerializableForm", () => ({
  getSerializableForm: vi.fn(),
}));

const { readonlyPrisma } = await import("@calcom/prisma");
const queryRawMock = vi.mocked(readonlyPrisma.$queryRaw);
const getSerializableFormMock = vi.mocked(getSerializableForm);

const buildForm = (id: string) => ({
  id,
  name: `form-${id}`,
  description: null,
  position: 0,
  routes: null,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  fields: null,
  userId: 1,
  teamId: 2,
  disabled: false,
  settings: null,
  updatedById: null,
});

describe("VirtualQueuesInsights.getUserRelevantTeamRoutingForms", () => {
  beforeEach(() => {
    queryRawMock.mockReset();
    getSerializableFormMock.mockReset();
    getSerializableFormMock.mockImplementation(((args: { form: { id: string } }) =>
      Promise.resolve({ id: args.form.id, serialized: true })) as unknown as typeof getSerializableForm);
  });

  it("interpolates the userId into the raw query", async () => {
    queryRawMock.mockResolvedValue([]);

    await VirtualQueuesInsights.getUserRelevantTeamRoutingForms({ userId: 42 });

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    const [query, ...values] = queryRawMock.mock.calls[0];
    expect(Array.isArray(query)).toBe(true);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((value) => value === 42)).toBe(true);
  });

  it("returns an empty list when no weighted round-robin forms are found", async () => {
    queryRawMock.mockResolvedValue([]);

    await expect(VirtualQueuesInsights.getUserRelevantTeamRoutingForms({ userId: 1 })).resolves.toEqual([]);
    expect(getSerializableFormMock).not.toHaveBeenCalled();
  });

  it("serializes every returned form, preserving order", async () => {
    queryRawMock.mockResolvedValue([buildForm("a"), buildForm("b")]);

    const result = await VirtualQueuesInsights.getUserRelevantTeamRoutingForms({ userId: 1 });

    expect(getSerializableFormMock).toHaveBeenCalledTimes(2);
    expect(getSerializableFormMock).toHaveBeenNthCalledWith(1, { form: buildForm("a") });
    expect(result).toEqual([
      { id: "a", serialized: true },
      { id: "b", serialized: true },
    ]);
  });

  it("propagates serialization errors", async () => {
    queryRawMock.mockResolvedValue([buildForm("a")]);
    getSerializableFormMock.mockRejectedValue(new Error("bad form"));

    await expect(VirtualQueuesInsights.getUserRelevantTeamRoutingForms({ userId: 1 })).rejects.toThrow(
      "bad form"
    );
  });
});
