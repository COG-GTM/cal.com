import { describe, expect, it } from "vitest";
import { sanitizeDisplayName } from "./sanitizeDisplayName";

describe("sanitizeDisplayName", () => {
  it("returns the input untouched when it is not a `Name <email>` pair", () => {
    expect(sanitizeDisplayName("notifications@cal.com")).toBe("notifications@cal.com");
    expect(sanitizeDisplayName("Cal.com")).toBe("Cal.com");
    expect(sanitizeDisplayName("")).toBe("");
  });

  it("keeps a clean display name as is", () => {
    expect(sanitizeDisplayName("John Doe <john@example.com>")).toBe("John Doe <john@example.com>");
  });

  it("replaces header-breaking characters in the display name with spaces", () => {
    expect(sanitizeDisplayName('Jo;hn,"D<o>e():x <john@example.com>')).toBe(
      "Jo hn D o e x <john@example.com>"
    );
  });

  it("collapses the whitespace introduced by sanitization", () => {
    expect(sanitizeDisplayName("John;;;Doe <john@example.com>")).toBe("John Doe <john@example.com>");
  });

  it("does not sanitize the email part", () => {
    expect(sanitizeDisplayName("John Doe <john+a:b@example.com>")).toBe("John Doe <john+a:b@example.com>");
  });

  it("splits on the first ` <` so nested brackets stay in the email part", () => {
    expect(sanitizeDisplayName("Team <Cal> <team@cal.com>")).toBe("Team <Cal> <team@cal.com>");
  });
});
