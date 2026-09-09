import { describe, expect, it } from "vitest";
import { parseRoutingFormResponse } from "./parseRoutingFormResponse";

const formFields = [
  { id: "field-1", label: "Your email", identifier: "email", type: "email" },
  {
    id: "field-2",
    label: "Skills",
    type: "multiselect",
    options: [
      { id: "option-1", label: "TypeScript" },
      { id: null, label: "Legacy option" },
    ],
  },
];

describe("parseRoutingFormResponse", () => {
  it("parses a response along with its fields", () => {
    const parsed = parseRoutingFormResponse(
      {
        "field-1": { value: "john@example.com", label: "Your email" },
        "field-2": { value: ["TypeScript"] },
      },
      formFields
    );

    expect(parsed).toEqual({
      response: {
        "field-1": { value: "john@example.com", label: "Your email" },
        "field-2": { value: ["TypeScript"] },
      },
      fields: formFields,
    });
  });

  it("accepts numeric response values", () => {
    const parsed = parseRoutingFormResponse({ "field-3": { value: 42 } }, []);

    expect(parsed.response["field-3"].value).toBe(42);
  });

  it("throws when a response value has an unsupported type", () => {
    expect(() => parseRoutingFormResponse({ "field-1": { value: { nested: true } } }, formFields)).toThrow();
  });

  it("throws when the response isn't a record of objects", () => {
    expect(() => parseRoutingFormResponse("not-a-response", formFields)).toThrow();
  });

  it("throws when a field is missing its required properties", () => {
    expect(() => parseRoutingFormResponse({}, [{ id: "field-1" }])).toThrow();
  });
});
