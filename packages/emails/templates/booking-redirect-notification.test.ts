import { describe, expect, it } from "vitest";
import type { IBookingRedirect } from "../lib/types/booking-redirect-types";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import BookingRedirectNotification from "./booking-redirect-notification";

const language = createTranslator({
  booking_redirect_email_subject: "Bookings redirected to you",
  booking_redirect_updated_email_subject: "Booking redirect updated",
  booking_redirect_cancelled_email_subject: "Booking redirect cancelled",
});

const buildInput = (action: IBookingRedirect["action"]): IBookingRedirect => ({
  language,
  fromEmail: "oliver@example.com",
  eventOwner: "Oliver",
  toEmail: "anna@example.com",
  toName: "Anna",
  dates: "June 1 - June 5",
  action,
});

describe("BookingRedirectNotification", () => {
  it.each([
    ["add", "Bookings redirected to you"],
    ["update", "Booking redirect updated"],
    ["cancel", "Booking redirect cancelled"],
  ] as const)("uses the %s subject", async (action, subject) => {
    const payload = await getPayload(new BookingRedirectNotification(buildInput(action)));

    expect(payload.subject).toBe(subject);
    expect(payload.to).toBe("Anna <anna@example.com>");
  });
});
