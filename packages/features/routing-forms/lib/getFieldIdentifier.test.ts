import { describe, expect, it } from "vitest";
import getFieldIdentifier from "./getFieldIdentifier";
import type { Field } from "./types";

function buildField(field: Partial<Field> & Pick<Field, "id" | "label" | "type">): Field {
  return field;
}

describe("getFieldIdentifier", () => {
  it("returns the identifier when it is set", () => {
    const field = buildField({ id: "1", label: "Your email", type: "email", identifier: "email" });

    expect(getFieldIdentifier(field)).toBe("email");
  });

  it("falls back to the label when the identifier is not set", () => {
    const field = buildField({ id: "1", label: "Your email", type: "email" });

    expect(getFieldIdentifier(field)).toBe("Your email");
  });

  it("falls back to the label when the identifier is an empty string", () => {
    const field = buildField({ id: "1", label: "Your email", type: "email", identifier: "" });

    expect(getFieldIdentifier(field)).toBe("Your email");
  });
});
