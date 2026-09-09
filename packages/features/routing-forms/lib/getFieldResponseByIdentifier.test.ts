import { describe, expect, it } from "vitest";
import { getFieldResponseByIdentifier } from "./getFieldResponseByIdentifier";

const formFields = [
  { id: "field-1", label: "Your email", identifier: "email", type: "email" },
  { id: "field-2", label: "Company size", type: "number" },
];

describe("getFieldResponseByIdentifier", () => {
  it("returns the value of the identified field of a raw response payload", () => {
    const result = getFieldResponseByIdentifier({
      responsePayload: { "field-1": { value: "john@example.com", label: "Your email" } },
      formFields,
      identifier: "email",
    });

    expect(result).toEqual({ success: true, data: "john@example.com" });
  });

  it("returns an error result when the identifier doesn't match any field", () => {
    const result = getFieldResponseByIdentifier({
      responsePayload: { "field-1": { value: "john@example.com" } },
      formFields,
      identifier: "phone",
    });

    expect(result).toEqual({ success: false, error: "Field with identifier phone not found" });
  });

  it("throws when the response payload is malformed", () => {
    expect(() =>
      getFieldResponseByIdentifier({
        responsePayload: { "field-1": "john@example.com" },
        formFields,
        identifier: "email",
      })
    ).toThrow();
  });
});
