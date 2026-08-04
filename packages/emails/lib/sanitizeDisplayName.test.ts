import { describe, expect, test } from "vitest";

import { sanitizeDisplayName } from "./sanitizeDisplayName";

describe("sanitizeDisplayName", () => {
  test("returns the input unchanged when it is not in `name <email>` form", () => {
    expect(sanitizeDisplayName("john@example.com")).toEqual("john@example.com");
    expect(sanitizeDisplayName("John Doe")).toEqual("John Doe");
    expect(sanitizeDisplayName("")).toEqual("");
  });

  test("keeps a clean display name as is", () => {
    expect(sanitizeDisplayName("John Doe <john@example.com>")).toEqual("John Doe <john@example.com>");
  });

  test("replaces header injection characters in the display name with spaces", () => {
    expect(sanitizeDisplayName('Jo;h"n<D>o(e):Ltd <john@example.com>')).toEqual(
      "Jo h n D o e Ltd <john@example.com>"
    );
  });

  test("collapses consecutive whitespace created by sanitization", () => {
    expect(sanitizeDisplayName("John;;;Doe <john@example.com>")).toEqual("John Doe <john@example.com>");
  });

  test("does not sanitize the email part", () => {
    expect(sanitizeDisplayName("John Doe <john+(tag)@example.com>")).toEqual(
      "John Doe <john+(tag)@example.com>"
    );
  });

  test("only sanitizes up to the first angle bracket", () => {
    expect(sanitizeDisplayName("John;Doe <fake> <john@example.com>")).toEqual(
      "John Doe <fake> <john@example.com>"
    );
  });
});
