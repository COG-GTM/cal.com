import { describe, expect, it } from "vitest";
import { sanitizeDisplayName } from "./sanitizeDisplayName";

describe("sanitizeDisplayName", () => {
  it("removes header-breaking characters from the display name but keeps the address", () => {
    expect(sanitizeDisplayName('Anna "The; Attendee" (Sales) <anna@example.com>')).toBe(
      "Anna The Attendee Sales  <anna@example.com>"
    );
  });

  it("collapses the whitespace left behind by removed characters", () => {
    expect(sanitizeDisplayName("Anna,,,Attendee <anna@example.com>")).toBe(
      "Anna Attendee <anna@example.com>"
    );
  });

  it("returns the input untouched when it is not a name/address pair", () => {
    expect(sanitizeDisplayName("anna@example.com")).toBe("anna@example.com");
  });
});
