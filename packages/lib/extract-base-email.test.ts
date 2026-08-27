import { describe, expect, it } from "vitest";
import { extractBaseEmail } from "./extract-base-email";

describe("extractBaseEmail", () => {
  it("returns the email unchanged when there is no plus addressing", () => {
    expect(extractBaseEmail("john@example.com")).toBe("john@example.com");
  });

  it("strips a plus suffix from the local part", () => {
    expect(extractBaseEmail("john+spam@example.com")).toBe("john@example.com");
  });

  it("strips everything after the first plus", () => {
    expect(extractBaseEmail("john+a+b@example.com")).toBe("john@example.com");
  });

  it("preserves the domain untouched", () => {
    expect(extractBaseEmail("john+tag@sub.example.co.uk")).toBe("john@sub.example.co.uk");
  });
});
