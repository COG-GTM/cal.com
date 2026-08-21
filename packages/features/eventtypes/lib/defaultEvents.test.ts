import { describe, expect, it } from "vitest";
import {
  dynamicEvent,
  getDefaultEvent,
  getDynamicEventDescription,
  getDynamicEventName,
  getGroupName,
  getUsernameList,
  getUsernameSlugLink,
} from "./defaultEvents";

describe("default event helpers", () => {
  it("normalizes usernames from strings, arrays, and encoded separators", () => {
    expect(getUsernameList(undefined)).toEqual([]);
    expect(getUsernameList("alice")).toEqual(["alice"]);
    expect(getUsernameList(["Alice", "Bob"])).toEqual(["alice", "bob"]);
    expect(getUsernameList("Alice+Bob%20Carol%2bDave")).toEqual(["alice", "bob", "carol", "dave"]);
    expect(getUsernameList(["Alice++", "+Bob", ""])).toEqual(["alice", "bob"]);
    expect(getUsernameList("Jane Doe")).toEqual(["jane", "doe"]);
  });

  it("returns the dynamic default event for known and unknown slugs", () => {
    expect(getDefaultEvent("dynamic")).toBe(dynamicEvent);
    expect(getDefaultEvent("missing")).toBe(dynamicEvent);
    expect(getDefaultEvent("missing")).toMatchObject({
      isDynamic: true,
      metadata: { multipleDuration: [15, 30, 45, 60, 90] },
    });
  });

  it("builds a dynamic name while consuming the final name", () => {
    const names = ["Alice", "Bob"];

    expect(getDynamicEventName(names, "30")).toBe("Dynamic Collective 30 min event with Alice & Bob");
    expect(names).toEqual(["Alice"]);
    expect(getDynamicEventName(["Solo"], "15")).toBe("Dynamic Collective 15 min event with  & Solo");
  });

  it("builds group descriptions and username links", () => {
    expect(getDynamicEventDescription(["alice", "bob"], "45")).toBe("Book a 45 min event with alice, bob");
    expect(getGroupName(["Alice", "Bob"])).toBe("Alice, Bob");
    expect(
      getUsernameSlugLink({
        users: [{ username: "alice" }],
        slug: "demo",
      })
    ).toBe("/alice/demo");
    expect(
      getUsernameSlugLink({
        users: [{ username: "alice" }, { username: "bob" }],
        slug: "demo",
      })
    ).toBe("/alice+bob/demo");
  });
});
