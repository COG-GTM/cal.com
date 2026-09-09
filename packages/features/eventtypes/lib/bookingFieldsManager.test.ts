import { prisma } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeBookingField, upsertBookingField } from "./bookingFieldsManager";

vi.mock("@calcom/prisma", () => ({
  prisma: {
    eventType: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const findUnique = vi.mocked(prisma.eventType.findUnique);
const update = vi.mocked(prisma.eventType.update);

type BookingField = {
  name: string;
  type: string;
  label?: string;
  required?: boolean;
  sources?: { id: string; type: string; label: string; fieldRequired?: boolean }[];
};

const workflowSource = { id: "workflow-1", type: "workflow", label: "Workflow", fieldRequired: true };

const mockEventType = (bookingFields: BookingField[]) => {
  findUnique.mockResolvedValue({
    id: 1,
    teamId: null,
    profile: { organizationId: null },
    customInputs: [],
    workflows: [],
    bookingFields,
    metadata: {},
  });
};

const savedFields = (): BookingField[] => update.mock.calls[0][0].data.bookingFields as BookingField[];

const fieldNamed = (name: string) => savedFields().find((field) => field.name === name);

describe("upsertBookingField", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws when the event type does not exist", async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      upsertBookingField({ name: "smsReminderNumber", type: "phone" }, workflowSource, 99)
    ).rejects.toThrow("EventType:99 not found");
    expect(update).not.toHaveBeenCalled();
  });

  it("adds a new field with the given source when the field does not exist yet", async () => {
    mockEventType([]);

    await upsertBookingField({ name: "smsReminderNumber", type: "phone" }, workflowSource, 1);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 } }));
    expect(fieldNamed("smsReminderNumber")).toMatchObject({
      type: "phone",
      required: true,
      sources: [workflowSource],
    });
  });

  it("appends a new source to an existing field and marks it required", async () => {
    mockEventType([
      {
        name: "smsReminderNumber",
        type: "phone",
        required: false,
        sources: [{ id: "workflow-0", type: "workflow", label: "Other", fieldRequired: false }],
      },
    ]);

    await upsertBookingField({ name: "smsReminderNumber", type: "phone" }, workflowSource, 1);

    const field = fieldNamed("smsReminderNumber");
    expect(field?.sources?.map((source) => source.id)).toEqual(["workflow-0", "workflow-1"]);
    expect(field?.required).toBe(true);
  });

  it("updates a matching source in place instead of duplicating it", async () => {
    mockEventType([
      {
        name: "smsReminderNumber",
        type: "phone",
        required: true,
        sources: [{ ...workflowSource, label: "Old label", fieldRequired: true }],
      },
    ]);

    await upsertBookingField(
      { name: "smsReminderNumber", type: "phone" },
      { ...workflowSource, label: "New label", fieldRequired: false },
      1
    );

    const field = fieldNamed("smsReminderNumber");
    expect(field?.sources).toHaveLength(1);
    expect(field?.sources?.[0].label).toBe("New label");
    expect(field?.required).toBe(false);
  });
});

describe("removeBookingField", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("removes the field entirely when its last source is removed", async () => {
    mockEventType([{ name: "smsReminderNumber", type: "phone", required: true, sources: [workflowSource] }]);

    await removeBookingField({ name: "smsReminderNumber" }, workflowSource, 1);

    expect(fieldNamed("smsReminderNumber")).toBeUndefined();
  });

  it("keeps the field and recomputes required when other sources remain", async () => {
    mockEventType([
      {
        name: "smsReminderNumber",
        type: "phone",
        required: true,
        sources: [
          workflowSource,
          { id: "workflow-2", type: "workflow", label: "Second", fieldRequired: false },
        ],
      },
    ]);

    await removeBookingField({ name: "smsReminderNumber" }, workflowSource, 1);

    const field = fieldNamed("smsReminderNumber");
    expect(field?.sources?.map((source) => source.id)).toEqual(["workflow-2"]);
    expect(field?.required).toBe(false);
  });

  it("leaves the field untouched when the source is not attached to it", async () => {
    mockEventType([
      {
        name: "smsReminderNumber",
        type: "phone",
        required: true,
        sources: [{ id: "workflow-2", type: "workflow", label: "Second", fieldRequired: true }],
      },
    ]);

    await removeBookingField({ name: "smsReminderNumber" }, workflowSource, 1);

    expect(fieldNamed("smsReminderNumber")?.sources?.map((source) => source.id)).toEqual(["workflow-2"]);
  });

  it("throws when the event type does not exist", async () => {
    findUnique.mockResolvedValue(null);

    await expect(removeBookingField({ name: "smsReminderNumber" }, workflowSource, 7)).rejects.toThrow(
      "EventType:7 not found"
    );
  });
});
