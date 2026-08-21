import { SchedulingType } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import { createEventTypeInput, EventTypeDuplicateInput } from "./schemas";

describe("createEventTypeInput", () => {
  it("accepts a minimal personal event", () => {
    const result = createEventTypeInput.parse({
      title: "  Personal event  ",
      slug: "personal-event",
      length: 30,
    });

    expect(result.title).toBe("Personal event");
    expect(result.length).toBe(30);
  });

  it("requires a scheduling type for team events", () => {
    const result = createEventTypeInput.safeParse({
      title: "Team event",
      slug: "team-event",
      length: 30,
      teamId: 42,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["schedulingType"]);
    }
  });

  it("accepts a team event with a scheduling type", () => {
    expect(
      createEventTypeInput.parse({
        title: "Team event",
        slug: "team-event",
        length: 30,
        teamId: 42,
        schedulingType: SchedulingType.ROUND_ROBIN,
      })
    ).toMatchObject({ teamId: 42, schedulingType: SchedulingType.ROUND_ROBIN });
  });

  it.each([
    ["", "title"],
    ["   ", "title"],
  ])("rejects a blank %s title", (title) => {
    expect(createEventTypeInput.safeParse({ title, slug: "event", length: 30 }).success).toBe(false);
  });

  it.each([
    [{ length: 30.5 }, "length"],
    [{ slotInterval: -1 }, "slotInterval"],
    [{ beforeEventBuffer: -1 }, "beforeEventBuffer"],
    [{ afterEventBuffer: -1 }, "afterEventBuffer"],
    [{ calVideoSettings: { redirectUrlOnExit: "not-a-url" } }, "calVideoSettings"],
  ])("rejects invalid %s", (override) => {
    const result = createEventTypeInput.safeParse({
      title: "Event",
      slug: "event",
      length: 30,
      ...override,
    });

    expect(result.success).toBe(false);
  });
});

describe("EventTypeDuplicateInput", () => {
  const validInput = {
    id: 1,
    slug: "event",
    title: "Event",
    description: "Description",
    length: 30,
  };

  it("rejects unknown keys", () => {
    expect(EventTypeDuplicateInput.safeParse({ ...validInput, extra: true }).success).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(EventTypeDuplicateInput.safeParse({ ...validInput, title: "" }).success).toBe(false);
  });
});
