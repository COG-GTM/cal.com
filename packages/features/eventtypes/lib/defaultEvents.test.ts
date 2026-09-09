import { describe, expect, it } from "vitest";
import {
  defaultEvents,
  dynamicEvent,
  getDefaultEvent,
  getDynamicEventDescription,
  getDynamicEventName,
  getGroupName,
  getUsernameList,
  getUsernameSlugLink,
} from "./defaultEvents";

describe("dynamicEvent", () => {
  it("is a 30 minute dynamic group meeting with multiple durations", () => {
    expect(dynamicEvent.slug).toBe("dynamic");
    expect(dynamicEvent.length).toBe(30);
    expect(dynamicEvent.isDynamic).toBe(true);
    expect(dynamicEvent.metadata?.multipleDuration).toEqual([15, 30, 45, 60, 90]);
  });

  it("is the only registered default event", () => {
    expect(defaultEvents).toEqual([dynamicEvent]);
  });
});

describe("getDynamicEventDescription", () => {
  it("lists every username in the description", () => {
    expect(getDynamicEventDescription(["alice", "bob"], "30")).toBe("Book a 30 min event with alice, bob");
  });

  it("handles a single username", () => {
    expect(getDynamicEventDescription(["alice"], "15")).toBe("Book a 15 min event with alice");
  });
});

describe("getDynamicEventName", () => {
  it("separates the last participant with an ampersand", () => {
    expect(getDynamicEventName(["alice", "bob", "carol"], "30")).toBe(
      "Dynamic Collective 30 min event with alice, bob & carol"
    );
  });

  it("leaves the leading list empty when there is a single participant", () => {
    expect(getDynamicEventName(["alice"], "30")).toBe("Dynamic Collective 30 min event with  & alice");
  });
});

describe("getDefaultEvent", () => {
  it("returns the matching default event for a known slug", () => {
    expect(getDefaultEvent("dynamic")).toBe(dynamicEvent);
  });

  it("falls back to the dynamic event for an unknown slug", () => {
    expect(getDefaultEvent("does-not-exist")).toBe(dynamicEvent);
  });
});

describe("getGroupName", () => {
  it("joins usernames with a comma", () => {
    expect(getGroupName(["alice", "bob"])).toBe("alice, bob");
  });
});

describe("getUsernameSlugLink", () => {
  it("builds a single user link", () => {
    expect(getUsernameSlugLink({ users: [{ username: "alice" }], slug: "30min" })).toBe("/alice/30min");
  });

  it("joins multiple usernames with a plus sign", () => {
    expect(getUsernameSlugLink({ users: [{ username: "alice" }, { username: "bob" }], slug: "30min" })).toBe(
      "/alice+bob/30min"
    );
  });
});

describe("getUsernameList", () => {
  it("returns an empty list for undefined input", () => {
    expect(getUsernameList(undefined)).toEqual([]);
  });

  it("splits a plus separated list", () => {
    expect(getUsernameList("alice+bob")).toEqual(["alice", "bob"]);
  });

  it("treats url encoded separators as a plus", () => {
    expect(getUsernameList("alice%20bob%2bcarol")).toEqual(["alice", "bob", "carol"]);
  });

  it("slugifies each username", () => {
    expect(getUsernameList("Alice Doe")).toEqual(["alice", "doe"]);
  });

  it("accepts an array and drops empty segments", () => {
    expect(getUsernameList(["alice+", "bob"])).toEqual(["alice", "bob"]);
  });
});
