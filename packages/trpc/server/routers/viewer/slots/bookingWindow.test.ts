import dayjs from "@calcom/dayjs";
import { describe, expect, it } from "vitest";
import { filterSlotsByBookingWindow, getPrivateLinkBookingWindow } from "./bookingWindow";

describe("filterSlotsByBookingWindow", () => {
  const bookingWindow = {
    start: new Date("2026-08-20T08:00:00.000Z"),
    end: new Date("2026-08-20T14:00:00.000Z"),
  };

  it("keeps slots fully inside the window", () => {
    const slots = [{ time: dayjs.utc("2026-08-20T09:00:00.000Z") }];

    expect(filterSlotsByBookingWindow(slots, bookingWindow, 60)).toHaveLength(1);
  });

  it("rejects slots that partially overlap the window", () => {
    const slots = [
      { time: dayjs.utc("2026-08-20T07:30:00.000Z") },
      { time: dayjs.utc("2026-08-20T13:30:00.000Z") },
    ];

    expect(filterSlotsByBookingWindow(slots, bookingWindow, 60)).toHaveLength(0);
  });

  it("rejects slots outside the window", () => {
    const slots = [{ time: dayjs.utc("2026-08-20T15:00:00.000Z") }];

    expect(filterSlotsByBookingWindow(slots, bookingWindow, 60)).toHaveLength(0);
  });

  it("does not filter a link without a window", () => {
    expect(
      getPrivateLinkBookingWindow({ eventTypeId: 1, bookingWindowStart: null, bookingWindowEnd: null }, 1)
    ).toEqual({ isInvalid: false, window: null });
  });

  it("marks a link from another event type as invalid", () => {
    expect(
      getPrivateLinkBookingWindow(
        {
          eventTypeId: 2,
          bookingWindowStart: bookingWindow.start,
          bookingWindowEnd: bookingWindow.end,
        },
        1
      )
    ).toEqual({ isInvalid: true, window: null });
  });
});
