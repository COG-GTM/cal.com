import { describe, expect, it } from "vitest";
import {
  buildCancelLink,
  buildPlatformCancelLink,
  buildPlatformRescheduleLink,
  buildRescheduleLink,
  buildStandardCancelLink,
  buildStandardRescheduleLink,
} from "./LinkBuilder";

const PLATFORM_CANCEL_URL = "https://platform.example.com/cancel";
const PLATFORM_RESCHEDULE_URL = "https://platform.example.com/reschedule";
const BOOKER_URL = "https://cal.example.com";

describe("LinkBuilder", () => {
  describe("buildPlatformCancelLink", () => {
    it("builds a minimal link with the uid in the path", () => {
      const link = new URL(buildPlatformCancelLink({ platformCancelUrl: PLATFORM_CANCEL_URL, uid: "uid-1" }));

      expect(link.pathname).toBe("/cancel/uid-1");
      expect(link.searchParams.get("cancel")).toBe("true");
      expect(link.searchParams.get("allRemainingBookings")).toBe("false");
      expect(link.searchParams.get("slug")).toBeNull();
      expect(link.searchParams.get("username")).toBeNull();
      expect(link.searchParams.get("seatReferenceUid")).toBeNull();
      expect(link.searchParams.get("teamId")).toBeNull();
    });

    it("appends every optional parameter when provided", () => {
      const link = new URL(
        buildPlatformCancelLink({
          platformCancelUrl: PLATFORM_CANCEL_URL,
          uid: "uid-1",
          slug: "30min",
          username: "alice",
          isRecurring: true,
          seatReferenceUid: "seat-1",
          teamId: 42,
        })
      );

      expect(link.searchParams.get("slug")).toBe("30min");
      expect(link.searchParams.get("username")).toBe("alice");
      expect(link.searchParams.get("allRemainingBookings")).toBe("true");
      expect(link.searchParams.get("seatReferenceUid")).toBe("seat-1");
      expect(link.searchParams.get("teamId")).toBe("42");
    });

    it("keeps the uid in the path even when it is null", () => {
      const link = new URL(buildPlatformCancelLink({ platformCancelUrl: PLATFORM_CANCEL_URL, uid: null }));

      expect(link.pathname).toBe("/cancel/null");
    });
  });

  describe("buildPlatformRescheduleLink", () => {
    it("builds a minimal link with the uid in the path", () => {
      const link = new URL(
        buildPlatformRescheduleLink({ platformRescheduleUrl: PLATFORM_RESCHEDULE_URL, uid: "uid-1" })
      );

      expect(link.pathname).toBe("/reschedule/uid-1");
      expect(link.searchParams.get("reschedule")).toBe("true");
      expect(link.searchParams.get("slug")).toBeNull();
      expect(link.searchParams.get("username")).toBeNull();
      expect(link.searchParams.get("teamId")).toBeNull();
    });

    it("prefers the seat reference uid over the booking uid in the path", () => {
      const link = new URL(
        buildPlatformRescheduleLink({
          platformRescheduleUrl: PLATFORM_RESCHEDULE_URL,
          uid: "uid-1",
          slug: "30min",
          username: "alice",
          seatReferenceUid: "seat-1",
          teamId: 42,
        })
      );

      expect(link.pathname).toBe("/reschedule/seat-1");
      expect(link.searchParams.get("slug")).toBe("30min");
      expect(link.searchParams.get("username")).toBe("alice");
      expect(link.searchParams.get("teamId")).toBe("42");
    });
  });

  describe("buildStandardCancelLink", () => {
    it("builds a booking link with cancel defaults", () => {
      const link = new URL(buildStandardCancelLink({ bookerUrl: BOOKER_URL, uid: "uid-1" }));

      expect(link.pathname).toBe("/booking/uid-1");
      expect(link.searchParams.get("cancel")).toBe("true");
      expect(link.searchParams.get("allRemainingBookings")).toBe("false");
      expect(link.searchParams.get("cancelledBy")).toBeNull();
      expect(link.searchParams.get("seatReferenceUid")).toBeNull();
    });

    it("appends cancelledBy, seat reference and recurring flag", () => {
      const link = new URL(
        buildStandardCancelLink({
          bookerUrl: BOOKER_URL,
          uid: "uid-1",
          cancelledBy: "alice@example.com",
          seatReferenceUid: "seat-1",
          isRecurring: true,
        })
      );

      expect(link.searchParams.get("allRemainingBookings")).toBe("true");
      expect(link.searchParams.get("cancelledBy")).toBe("alice@example.com");
      expect(link.searchParams.get("seatReferenceUid")).toBe("seat-1");
    });
  });

  describe("buildStandardRescheduleLink", () => {
    it("builds a reschedule link without optional parameters", () => {
      const link = new URL(buildStandardRescheduleLink({ bookerUrl: BOOKER_URL, uid: "uid-1" }));

      expect(link.pathname).toBe("/reschedule/uid-1");
      expect(link.search).toBe("");
    });

    it("prefers the seat reference uid and appends optional parameters", () => {
      const link = new URL(
        buildStandardRescheduleLink({
          bookerUrl: BOOKER_URL,
          uid: "uid-1",
          rescheduledBy: "alice@example.com",
          seatReferenceUid: "seat-1",
          allowRescheduleForCancelledBooking: true,
        })
      );

      expect(link.pathname).toBe("/reschedule/seat-1");
      expect(link.searchParams.get("allowRescheduleForCancelledBooking")).toBe("true");
      expect(link.searchParams.get("rescheduledBy")).toBe("alice@example.com");
      expect(link.searchParams.get("seatReferenceUid")).toBe("seat-1");
    });
  });

  describe("buildCancelLink", () => {
    it("uses the platform link when both the client id and the platform url are set", () => {
      const link = new URL(
        buildCancelLink({
          platformClientId: "client-1",
          platformCancelUrl: PLATFORM_CANCEL_URL,
          uid: "uid-1",
          bookerUrl: BOOKER_URL,
          slug: "30min",
        })
      );

      expect(link.origin).toBe("https://platform.example.com");
      expect(link.pathname).toBe("/cancel/uid-1");
      expect(link.searchParams.get("slug")).toBe("30min");
    });

    it("falls back to the standard link when the platform url is missing", () => {
      const link = new URL(
        buildCancelLink({
          platformClientId: "client-1",
          platformCancelUrl: null,
          uid: "uid-1",
          bookerUrl: BOOKER_URL,
          cancelledBy: "alice@example.com",
        })
      );

      expect(link.origin).toBe(BOOKER_URL);
      expect(link.pathname).toBe("/booking/uid-1");
      expect(link.searchParams.get("cancelledBy")).toBe("alice@example.com");
    });

    it("falls back to the standard link when the platform client id is missing", () => {
      const link = new URL(
        buildCancelLink({
          platformCancelUrl: PLATFORM_CANCEL_URL,
          uid: "uid-1",
          bookerUrl: BOOKER_URL,
        })
      );

      expect(link.origin).toBe(BOOKER_URL);
    });
  });

  describe("buildRescheduleLink", () => {
    it("uses the platform link when both the client id and the platform url are set", () => {
      const link = new URL(
        buildRescheduleLink({
          platformClientId: "client-1",
          platformRescheduleUrl: PLATFORM_RESCHEDULE_URL,
          uid: "uid-1",
          bookerUrl: BOOKER_URL,
          username: "alice",
          teamId: 42,
        })
      );

      expect(link.origin).toBe("https://platform.example.com");
      expect(link.pathname).toBe("/reschedule/uid-1");
      expect(link.searchParams.get("username")).toBe("alice");
      expect(link.searchParams.get("teamId")).toBe("42");
    });

    it("falls back to the standard link when the platform url is missing", () => {
      const link = new URL(
        buildRescheduleLink({
          platformClientId: "client-1",
          platformRescheduleUrl: null,
          uid: "uid-1",
          bookerUrl: BOOKER_URL,
          rescheduledBy: "alice@example.com",
        })
      );

      expect(link.origin).toBe(BOOKER_URL);
      expect(link.pathname).toBe("/reschedule/uid-1");
      expect(link.searchParams.get("rescheduledBy")).toBe("alice@example.com");
    });

    it("falls back to the standard link when the platform client id is missing", () => {
      const link = new URL(
        buildRescheduleLink({
          platformRescheduleUrl: PLATFORM_RESCHEDULE_URL,
          uid: "uid-1",
          bookerUrl: BOOKER_URL,
        })
      );

      expect(link.origin).toBe(BOOKER_URL);
    });
  });
});
