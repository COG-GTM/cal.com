import { getEventName } from "@calcom/features/eventtypes/lib/eventNaming";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

const t = ((key: string) => key) as TFunction;

const baseEvent = {
  eventType: "Consultation",
  host: "Alice Doe",
  eventDuration: 30,
  t,
};

describe("getEventName with structured names and booking fields", () => {
  it("joins first and last name of an attendee name object", () => {
    const eventName = getEventName({
      ...baseEvent,
      attendeeName: { firstName: "Bob", lastName: "Smith" },
      eventName: "{Scheduler} meets {Organiser}",
    });

    expect(eventName).toBe("Bob Smith meets Alice Doe");
  });

  it("interpolates a missing last name of an attendee name object literally", () => {
    const eventName = getEventName({
      ...baseEvent,
      attendeeName: { firstName: "Bob" },
      eventName: "{Scheduler} meets {Organiser}",
    });

    expect(eventName).toBe("Bob undefined meets Alice Doe");
  });

  it("replaces {Scheduler last name} from the name booking field", () => {
    const eventName = getEventName({
      ...baseEvent,
      attendeeName: "Bob Smith",
      eventName: "Call with {Scheduler last name}",
      bookingFields: { name: { firstName: "Bob", lastName: "Smith" } },
    });

    expect(eventName).toBe("Call with Smith");
  });

  it("keeps unknown variables untouched when there are no booking fields", () => {
    const eventName = getEventName({
      ...baseEvent,
      attendeeName: "Bob",
      eventName: "Call about {topic}",
    });

    expect(eventName).toBe("Call about {topic}");
  });

  it("builds the name from a firstName/lastName booking field object", () => {
    const eventName = getEventName({
      ...baseEvent,
      attendeeName: "Bob",
      eventName: "Call with {name}",
      bookingFields: { name: { firstName: "Bob", lastName: "Smith" } },
    });

    expect(eventName).toBe("Call with Bob Smith");
  });

  it("omits the last name when the name booking field only has a first name", () => {
    const eventName = getEventName({
      ...baseEvent,
      attendeeName: "Bob",
      eventName: "Call with {name}",
      bookingFields: { name: { firstName: "Bob" } },
    });

    expect(eventName).toBe("Call with Bob");
  });

  it("resolves a location booking field value to its human readable label", () => {
    const eventName = getEventName({
      ...baseEvent,
      attendeeName: "Bob",
      eventName: "Call via {location}",
      bookingFields: { location: { value: "integrations:daily" } },
    });

    expect(eventName).toBe("Call via Cal Video");
  });

  it("uses the raw value for a non-location object booking field", () => {
    const eventName = getEventName({
      ...baseEvent,
      attendeeName: "Bob",
      eventName: "Call about {topic}",
      bookingFields: { topic: { value: "pricing" } },
    });

    expect(eventName).toBe("Call about pricing");
  });

  it("drops variables whose booking field value is empty", () => {
    const eventName = getEventName({
      ...baseEvent,
      attendeeName: "Bob",
      eventName: "Call about {topic}",
      bookingFields: { topic: "" },
    });

    expect(eventName).toBe("Call about ");
  });
});
