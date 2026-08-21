import { describe, expect, it } from "vitest";
import { objectToCsv } from "../objectToCsv";

describe("objectToCsv", () => {
  it("returns an empty string for an empty data set", () => {
    expect(objectToCsv([])).toBe("");
  });

  it("uses the keys of the first row as headers and keeps their order", () => {
    const csv = objectToCsv([
      { name: "Ada", email: "ada@example.com" },
      { name: "Grace", email: "grace@example.com" },
    ]);

    expect(csv).toBe(["name,email", "Ada,ada@example.com", "Grace,grace@example.com"].join("\n"));
  });

  it("emits empty cells for keys missing from later rows", () => {
    const csv = objectToCsv([
      { name: "Ada", email: "ada@example.com" },
      { name: "Grace" } as Record<string, string>,
    ]);

    expect(csv.split("\n")[2]).toBe("Grace,");
  });

  it("ignores keys that are not present in the first row", () => {
    const csv = objectToCsv([{ name: "Ada" }, { name: "Grace", extra: "dropped" }]);

    expect(csv).toBe(["name", "Ada", "Grace"].join("\n"));
  });

  it("quotes values containing commas, newlines or quotes and escapes inner quotes", () => {
    const csv = objectToCsv([
      {
        comma: "a,b",
        newline: "line1\nline2",
        quote: 'say "hi"',
        plain: "plain",
      },
    ]);

    expect(csv.split("\n").slice(1).join("\n")).toBe('"a,b","line1\nline2","say ""hi""",plain');
  });

  it("treats falsy values as empty strings", () => {
    const csv = objectToCsv([{ empty: "", zero: "0" }]);

    expect(csv).toBe(["empty,zero", ",0"].join("\n"));
  });
});
