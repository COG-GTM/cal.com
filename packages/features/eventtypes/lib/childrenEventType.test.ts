import { MembershipRole } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import type { ChildrenEventType } from "./childrenEventType";
import { stripChildrenForPayload } from "./childrenEventType";

const buildChild = (overrides: Partial<ChildrenEventType> = {}): ChildrenEventType => ({
  value: "1",
  label: "Alice",
  created: true,
  slug: "30min",
  hidden: false,
  owner: {
    avatar: "/avatar.png",
    id: 1,
    email: "alice@example.com",
    name: "Alice",
    username: "alice",
    membership: MembershipRole.MEMBER,
    eventTypeSlugs: ["30min"],
    profile: {
      id: null,
      upId: "usr-1",
      username: "alice",
      organizationId: null,
      organization: null,
    },
  },
  ...overrides,
});

describe("stripChildrenForPayload", () => {
  it("keeps only the fields the server needs", () => {
    expect(stripChildrenForPayload([buildChild()])).toEqual([
      {
        hidden: false,
        owner: {
          id: 1,
          name: "Alice",
          email: "alice@example.com",
          eventTypeSlugs: ["30min"],
        },
      },
    ]);
  });

  it("drops display-only fields such as avatar, username, membership and profile", () => {
    const [stripped] = stripChildrenForPayload([buildChild()]);

    expect(stripped).not.toHaveProperty("label");
    expect(stripped).not.toHaveProperty("slug");
    expect(stripped.owner).not.toHaveProperty("avatar");
    expect(stripped.owner).not.toHaveProperty("username");
    expect(stripped.owner).not.toHaveProperty("membership");
    expect(stripped.owner).not.toHaveProperty("profile");
  });

  it("preserves the hidden flag per child and maps every entry", () => {
    const result = stripChildrenForPayload([
      buildChild({ hidden: true }),
      buildChild({ hidden: false, owner: { ...buildChild().owner, id: 2, name: "Bob" } }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].hidden).toBe(true);
    expect(result[1].owner.name).toBe("Bob");
  });

  it("returns an empty array when there are no children", () => {
    expect(stripChildrenForPayload([])).toEqual([]);
  });
});
