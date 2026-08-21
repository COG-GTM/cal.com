import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import type { eventTypeBookingFields } from "@calcom/prisma/zod-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { removeBookingField, upsertBookingField } from "./bookingFieldsManager";

type BookingMocks = {
  getBookingFieldsWithSystemFields: ReturnType<typeof vi.fn>;
};

const mocks: BookingMocks = vi.hoisted(() => ({
  getBookingFieldsWithSystemFields: vi.fn(),
}));

vi.mock("@calcom/features/bookings/lib/getBookingFields", () => ({
  getBookingFieldsWithSystemFields: mocks.getBookingFieldsWithSystemFields,
}));

type BookingField = z.infer<typeof eventTypeBookingFields>[number];
type BookingFieldSource = NonNullable<BookingField["sources"]>[number];

const buildSource = (overrides: Partial<BookingFieldSource> = {}): BookingFieldSource => ({
  id: "source-1",
  type: "workflow",
  label: "Workflow",
  fieldRequired: false,
  ...overrides,
});

const buildField = (overrides: Partial<BookingField> = {}): BookingField =>
  ({
    name: "company",
    type: "text",
    defaultLabel: "Company",
    required: false,
    sources: [buildSource()],
    ...overrides,
  }) as BookingField;

const withoutRequired = (field: BookingField): Omit<BookingField, "required"> => {
  const { required: _required, ...fieldWithoutRequired } = field;
  return fieldWithoutRequired;
};

const configureEvent = ({
  bookingFields = [],
  teamId = null,
  organizationId = null,
}: {
  bookingFields?: BookingField[];
  teamId?: number | null;
  organizationId?: number | null;
} = {}): void => {
  let profile: { organizationId: number } | null = null;
  if (organizationId !== null) {
    profile = { organizationId };
  }
  prismaMock.eventType.findUnique.mockResolvedValue({
    id: 10,
    teamId,
    bookingFields,
    customInputs: [],
    profile,
    workflows: [],
  } as never);
  mocks.getBookingFieldsWithSystemFields.mockImplementation(({ bookingFields: fields }) => fields);
};

const updatedBookingFields = (): BookingField[] | undefined =>
  prismaMock.eventType.update.mock.calls.at(-1)?.[0]?.data.bookingFields as BookingField[];

describe("bookingFieldsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("event lookup and organization context", () => {
    it.each([
      ["personal event", null, null, false],
      ["team event without organization profile", 20, null, false],
      ["organization profile without team", null, 30, false],
      ["organization team event", 20, 30, true],
    ])("passes isOrgTeamEvent for %s", async (_label, teamId, organizationId, isOrgTeamEvent) => {
      configureEvent({ teamId, organizationId });
      const field = buildField();
      mocks.getBookingFieldsWithSystemFields.mockReturnValue([field]);

      await upsertBookingField(withoutRequired(field), buildSource(), 10);

      expect(mocks.getBookingFieldsWithSystemFields).toHaveBeenCalledWith(
        expect.objectContaining({ isOrgTeamEvent })
      );
      expect(mocks.getBookingFieldsWithSystemFields.mock.calls[0]?.[0]).not.toHaveProperty("profile");
    });

    it.each([
      "upsertBookingField",
      "removeBookingField",
    ])("rejects when the event type is missing: %s", async (operation) => {
      prismaMock.eventType.findUnique.mockResolvedValue(null);

      let call: Promise<unknown>;
      if (operation === "upsertBookingField") {
        call = upsertBookingField(
          { name: "company", type: "text", defaultLabel: "Company", sources: [] },
          buildSource(),
          42
        );
      } else {
        call = removeBookingField({ name: "company" }, { id: "source-1", type: "workflow" }, 42);
      }

      await expect(call).rejects.toThrow("EventType:42 not found");
    });
  });

  describe("upsertBookingField", () => {
    it("adds a new field with its source requirement", async () => {
      configureEvent();
      const source = buildSource({ id: "workflow-1", fieldRequired: true });

      await upsertBookingField(
        { name: "company", type: "text", defaultLabel: "Company", sources: [] },
        source,
        10
      );

      expect(prismaMock.eventType.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          bookingFields: [expect.objectContaining({ name: "company", required: true, sources: [source] })],
        },
      });
    });

    it("merges an existing source without duplicating it", async () => {
      const existing = buildField({
        required: true,
        sources: [buildSource({ id: "workflow-1", fieldRequired: true })],
      });
      configureEvent({ bookingFields: [existing] });
      const source = buildSource({ id: "workflow-1", label: "Updated", fieldRequired: false });

      await upsertBookingField(withoutRequired(existing), source, 10);

      expect(updatedBookingFields()).toEqual([{ ...existing, required: false, sources: [{ ...source }] }]);
    });

    it("appends a new source and keeps required when another source requires it", async () => {
      const existing = buildField({ sources: [buildSource({ id: "workflow-1", fieldRequired: true })] });
      configureEvent({ bookingFields: [existing] });
      const source = buildSource({ id: "workflow-2", fieldRequired: false });

      await upsertBookingField(withoutRequired(existing), source, 10);

      expect(updatedBookingFields()).toEqual([
        { ...existing, required: true, sources: [...(existing.sources ?? []), source] },
      ]);
    });

    it("recomputes required as false when no source requires the field", async () => {
      const existing = buildField({
        required: true,
        sources: [buildSource({ id: "workflow-1", fieldRequired: false })],
      });
      configureEvent({ bookingFields: [existing] });

      await upsertBookingField(withoutRequired(existing), buildSource({ id: "workflow-2" }), 10);

      expect(updatedBookingFields()[0]).toMatchObject({ name: "company", required: false });
    });

    it("leaves different fields unchanged and handles missing sources", async () => {
      const untouched = buildField({ name: "department" });
      const emptySources = buildField({ name: "company", sources: undefined });
      configureEvent({ bookingFields: [untouched, emptySources] });

      await upsertBookingField(withoutRequired(emptySources), buildSource({ fieldRequired: true }), 10);

      expect(updatedBookingFields()).toEqual([
        untouched,
        { ...emptySources, required: true, sources: [buildSource({ fieldRequired: true })] },
      ]);
    });
  });

  describe("removeBookingField", () => {
    it("leaves the field unchanged when the source is unknown", async () => {
      const field = buildField();
      configureEvent({ bookingFields: [field] });

      await removeBookingField({ name: "company" }, { id: "missing", type: "workflow" }, 10);

      expect(updatedBookingFields()).toEqual([field]);
    });

    it("removes one source, recomputes required, and preserves unrelated fields", async () => {
      const field = buildField({
        required: true,
        sources: [
          buildSource({ id: "workflow-1", fieldRequired: true }),
          buildSource({ id: "workflow-2", fieldRequired: false }),
        ],
      });
      const other = buildField({ name: "department" });
      configureEvent({ bookingFields: [field, other] });

      await removeBookingField({ name: "company" }, { id: "workflow-1", type: "workflow" }, 10);

      const remainingSource = field.sources?.[1];
      expect(remainingSource).toBeDefined();
      expect(updatedBookingFields()).toEqual([
        { ...field, required: false, sources: [remainingSource] },
        other,
      ]);
    });

    it("drops a field after removing its final source", async () => {
      const field = buildField();
      configureEvent({ bookingFields: [field] });

      const source = field.sources?.[0];
      expect(source).toBeDefined();
      await removeBookingField({ name: "company" }, { id: source?.id ?? "", type: "workflow" }, 10);

      expect(updatedBookingFields()).toEqual([]);
    });
  });
});
