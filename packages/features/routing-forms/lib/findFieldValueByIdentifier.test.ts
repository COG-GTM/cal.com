import { describe, expect, it } from "vitest";
import { findFieldValueByIdentifier } from "./findFieldValueByIdentifier";
import type { RoutingFormResponseData } from "./types";

const fields: RoutingFormResponseData["fields"] = [
  { id: "field-1", label: "Your email", identifier: "email", type: "email" },
  { id: "field-2", label: "Company size", type: "number" },
  { id: "field-3", label: "Skills", identifier: "skills", type: "multiselect" },
  { id: "field-4", label: "Notes", identifier: "notes", type: "text" },
];

describe("findFieldValueByIdentifier", () => {
  it("returns the value of the field matching the identifier", () => {
    const result = findFieldValueByIdentifier(
      { fields, response: { "field-1": { value: "john@example.com" } } },
      "email"
    );

    expect(result).toEqual({ success: true, data: "john@example.com" });
  });

  it("matches on the label when the field has no identifier", () => {
    const result = findFieldValueByIdentifier(
      { fields, response: { "field-2": { value: 100 } } },
      "Company size"
    );

    expect(result).toEqual({ success: true, data: 100 });
  });

  it("returns array values as is", () => {
    const result = findFieldValueByIdentifier(
      { fields, response: { "field-3": { value: ["typescript", "rust"] } } },
      "skills"
    );

    expect(result).toEqual({ success: true, data: ["typescript", "rust"] });
  });

  it("returns null when the field exists but has no response", () => {
    const result = findFieldValueByIdentifier({ fields, response: {} }, "notes");

    expect(result).toEqual({ success: true, data: null });
  });

  it("returns an error when no field matches the identifier", () => {
    const result = findFieldValueByIdentifier({ fields, response: {} }, "unknown");

    expect(result).toEqual({ success: false, error: "Field with identifier unknown not found" });
  });
});
