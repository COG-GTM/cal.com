import { describe, expect, it } from "vitest";
import type { ChildrenEventType } from "./childrenEventType";
import { stripChildrenForPayload } from "./childrenEventType";

const child = {
  value: "child-value",
  label: "Child label",
  created: true,
  slug: "child-slug",
  hidden: true,
  owner: {
    avatar: "avatar",
    id: 7,
    email: "owner@example.com",
    name: "Owner",
    username: "owner",
    membership: "MEMBER",
    eventTypeSlugs: ["one", "two"],
    profile: {},
  },
} as ChildrenEventType;

describe("stripChildrenForPayload", () => {
  it("keeps only the server payload fields", () => {
    expect(stripChildrenForPayload([child])).toEqual([
      {
        hidden: true,
        owner: {
          id: 7,
          name: "Owner",
          email: "owner@example.com",
          eventTypeSlugs: ["one", "two"],
        },
      },
    ]);
  });

  it("handles an empty children array", () => {
    expect(stripChildrenForPayload([])).toEqual([]);
  });
});
