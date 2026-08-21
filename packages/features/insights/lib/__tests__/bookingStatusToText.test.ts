import { BookingStatus } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import { bookingStatusToText } from "../bookingStatusToText";

describe("bookingStatusToText", () => {
  it("title cases a single word status", () => {
    expect(bookingStatusToText(BookingStatus.CANCELLED)).toBe("Cancelled");
  });

  it("replaces underscores with spaces and title cases each word", () => {
    expect(bookingStatusToText(BookingStatus.AWAITING_HOST)).toBe("Awaiting Host");
  });

  it("handles every booking status without leaving underscores or upper case runs", () => {
    for (const status of Object.values(BookingStatus)) {
      const text = bookingStatusToText(status);
      expect(text).not.toContain("_");
      expect(text).toBe(text.replace(/([a-z])([A-Z])/g, "$1 $2"));
    }
  });
});
