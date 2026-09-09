import { SchedulingType } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import { createEventTypeInput, EventTypeDuplicateInput } from "./schemas";

describe("EventTypeDuplicateInput", () => {
  const validInput = {
    id: 1,
    slug: "30min-copy",
    title: "30 min copy",
    description: "",
    length: 30,
  };

  it("accepts a valid duplicate payload", () => {
    expect(EventTypeDuplicateInput.parse(validInput)).toEqual(validInput);
  });

  it("accepts a nullable teamId", () => {
    expect(EventTypeDuplicateInput.parse({ ...validInput, teamId: null }).teamId).toBeNull();
  });

  it("rejects an empty title", () => {
    expect(EventTypeDuplicateInput.safeParse({ ...validInput, title: "" }).success).toBe(false);
  });

  it("rejects unknown keys because the schema is strict", () => {
    expect(EventTypeDuplicateInput.safeParse({ ...validInput, unexpected: true }).success).toBe(false);
  });
});

describe("createEventTypeInput", () => {
  const validInput = {
    title: "30 min",
    slug: "30min",
    length: 30,
  };

  it("accepts the minimum payload for a personal event", () => {
    const parsed = createEventTypeInput.parse(validInput);
    expect(parsed.title).toBe("30 min");
    expect(parsed.slug).toBe("30min");
  });

  it("slugifies the provided slug", () => {
    expect(createEventTypeInput.parse({ ...validInput, slug: "My Event" }).slug).toBe("my-event");
  });

  it("trims the title and rejects a blank one", () => {
    expect(createEventTypeInput.parse({ ...validInput, title: "  padded  " }).title).toBe("padded");
    expect(createEventTypeInput.safeParse({ ...validInput, title: "   " }).success).toBe(false);
  });

  it("requires a scheduling type for team events", () => {
    const result = createEventTypeInput.safeParse({ ...validInput, teamId: 3 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["schedulingType"]);
      expect(result.error.issues[0].message).toBe("You must select a scheduling type for team events");
    }
  });

  it("accepts a team event that declares a scheduling type", () => {
    const parsed = createEventTypeInput.parse({
      ...validInput,
      teamId: 3,
      schedulingType: SchedulingType.ROUND_ROBIN,
    });

    expect(parsed.schedulingType).toBe(SchedulingType.ROUND_ROBIN);
  });

  it("rejects a negative slot interval and a fractional length", () => {
    expect(createEventTypeInput.safeParse({ ...validInput, slotInterval: -1 }).success).toBe(false);
    expect(createEventTypeInput.safeParse({ ...validInput, length: 30.5 }).success).toBe(false);
  });

  it("validates calVideoSettings and rejects a non url exit redirect", () => {
    expect(
      createEventTypeInput.parse({
        ...validInput,
        calVideoSettings: { disableRecordingForGuests: true, redirectUrlOnExit: "https://cal.com" },
      }).calVideoSettings
    ).toMatchObject({ disableRecordingForGuests: true, redirectUrlOnExit: "https://cal.com" });

    expect(
      createEventTypeInput.safeParse({ ...validInput, calVideoSettings: { redirectUrlOnExit: "nope" } })
        .success
    ).toBe(false);
  });

  it("accepts locations", () => {
    const parsed = createEventTypeInput.parse({
      ...validInput,
      locations: [{ type: "integrations:daily" }],
    });

    expect(parsed.locations).toEqual([{ type: "integrations:daily" }]);
  });
});
