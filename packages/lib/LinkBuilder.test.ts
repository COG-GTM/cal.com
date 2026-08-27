import { describe, expect, it } from "vitest";
import {
  buildCancelLink,
  buildPlatformCancelLink,
  buildPlatformRescheduleLink,
  buildRescheduleLink,
  buildStandardCancelLink,
  buildStandardRescheduleLink,
} from "./LinkBuilder";

const bookerUrl = "https://cal.com";
const platformUrl = "https://platform.example.com/cancel";

describe("buildPlatformCancelLink", () => {
  it("builds a link with all optional params", () => {
    const link = new URL(
      buildPlatformCancelLink({
        platformCancelUrl: platformUrl,
        uid: "abc",
        slug: "30min",
        username: "alice",
        isRecurring: true,
        seatReferenceUid: "seat1",
        teamId: 5,
      })
    );
    expect(link.pathname).toBe("/cancel/abc");
    expect(link.searchParams.get("slug")).toBe("30min");
    expect(link.searchParams.get("username")).toBe("alice");
    expect(link.searchParams.get("cancel")).toBe("true");
    expect(link.searchParams.get("allRemainingBookings")).toBe("true");
    expect(link.searchParams.get("seatReferenceUid")).toBe("seat1");
    expect(link.searchParams.get("teamId")).toBe("5");
  });

  it("omits optional params and defaults allRemainingBookings to false", () => {
    const link = new URL(buildPlatformCancelLink({ platformCancelUrl: platformUrl, uid: "abc" }));
    expect(link.searchParams.get("allRemainingBookings")).toBe("false");
    expect(link.searchParams.has("slug")).toBe(false);
    expect(link.searchParams.has("username")).toBe(false);
    expect(link.searchParams.has("seatReferenceUid")).toBe(false);
    expect(link.searchParams.has("teamId")).toBe(false);
  });
});

describe("buildPlatformRescheduleLink", () => {
  it("prefers seatReferenceUid over uid in the path", () => {
    const link = new URL(
      buildPlatformRescheduleLink({
        platformRescheduleUrl: platformUrl,
        uid: "abc",
        seatReferenceUid: "seat1",
        slug: "30min",
        username: "alice",
        teamId: 5,
      })
    );
    expect(link.pathname).toBe("/cancel/seat1");
    expect(link.searchParams.get("reschedule")).toBe("true");
    expect(link.searchParams.get("slug")).toBe("30min");
    expect(link.searchParams.get("username")).toBe("alice");
    expect(link.searchParams.get("teamId")).toBe("5");
  });

  it("falls back to uid without optional params", () => {
    const link = new URL(buildPlatformRescheduleLink({ platformRescheduleUrl: platformUrl, uid: "abc" }));
    expect(link.pathname).toBe("/cancel/abc");
    expect(link.searchParams.has("slug")).toBe(false);
    expect(link.searchParams.has("teamId")).toBe(false);
  });
});

describe("buildStandardCancelLink", () => {
  it("builds a booking cancel link with all params", () => {
    const link = new URL(
      buildStandardCancelLink({
        bookerUrl,
        uid: "abc",
        cancelledBy: "bob@example.com",
        seatReferenceUid: "seat1",
        isRecurring: true,
      })
    );
    expect(link.pathname).toBe("/booking/abc");
    expect(link.searchParams.get("cancel")).toBe("true");
    expect(link.searchParams.get("allRemainingBookings")).toBe("true");
    expect(link.searchParams.get("cancelledBy")).toBe("bob@example.com");
    expect(link.searchParams.get("seatReferenceUid")).toBe("seat1");
  });

  it("omits optional params", () => {
    const link = new URL(buildStandardCancelLink({ bookerUrl, uid: "abc" }));
    expect(link.searchParams.get("allRemainingBookings")).toBe("false");
    expect(link.searchParams.has("cancelledBy")).toBe(false);
    expect(link.searchParams.has("seatReferenceUid")).toBe(false);
  });
});

describe("buildStandardRescheduleLink", () => {
  it("builds a reschedule link with all params", () => {
    const link = new URL(
      buildStandardRescheduleLink({
        bookerUrl,
        uid: "abc",
        rescheduledBy: "bob@example.com",
        seatReferenceUid: "seat1",
        allowRescheduleForCancelledBooking: true,
      })
    );
    expect(link.pathname).toBe("/reschedule/seat1");
    expect(link.searchParams.get("allowRescheduleForCancelledBooking")).toBe("true");
    expect(link.searchParams.get("rescheduledBy")).toBe("bob@example.com");
    expect(link.searchParams.get("seatReferenceUid")).toBe("seat1");
  });

  it("uses uid and omits optional params", () => {
    const link = new URL(buildStandardRescheduleLink({ bookerUrl, uid: "abc" }));
    expect(link.pathname).toBe("/reschedule/abc");
    expect(link.searchParams.has("allowRescheduleForCancelledBooking")).toBe(false);
    expect(link.searchParams.has("rescheduledBy")).toBe(false);
  });
});

describe("buildCancelLink", () => {
  it("uses the platform link when platformClientId and platformCancelUrl are set", () => {
    const result = buildCancelLink({
      platformClientId: "client1",
      platformCancelUrl: platformUrl,
      uid: "abc",
      bookerUrl,
    });
    expect(result.startsWith(platformUrl)).toBe(true);
  });

  it("falls back to the standard link when platform params are missing", () => {
    const result = buildCancelLink({ platformClientId: "client1", uid: "abc", bookerUrl });
    expect(result.startsWith(`${bookerUrl}/booking/abc`)).toBe(true);
  });
});

describe("buildRescheduleLink", () => {
  it("uses the platform link when platformClientId and platformRescheduleUrl are set", () => {
    const result = buildRescheduleLink({
      platformClientId: "client1",
      platformRescheduleUrl: platformUrl,
      uid: "abc",
      bookerUrl,
    });
    expect(result.startsWith(platformUrl)).toBe(true);
  });

  it("falls back to the standard link when platform params are missing", () => {
    const result = buildRescheduleLink({ uid: "abc", bookerUrl });
    expect(result.startsWith(`${bookerUrl}/reschedule/abc`)).toBe(true);
  });
});
