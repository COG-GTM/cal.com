import type { Dayjs } from "@calcom/dayjs";

type BookingWindow = {
  start: Date;
  end: Date;
};

export type HashedLinkSlotData = {
  eventTypeId: number;
  bookingWindowStart: Date | null;
  bookingWindowEnd: Date | null;
};

export const getPrivateLinkBookingWindow = (
  hashedLink: HashedLinkSlotData | null,
  eventTypeId: number
): { isInvalid: boolean; window: BookingWindow | null } => {
  if (!hashedLink || hashedLink.eventTypeId !== eventTypeId) {
    return { isInvalid: true, window: null };
  }

  if (!hashedLink.bookingWindowStart || !hashedLink.bookingWindowEnd) {
    return { isInvalid: false, window: null };
  }

  return {
    isInvalid: false,
    window: {
      start: hashedLink.bookingWindowStart,
      end: hashedLink.bookingWindowEnd,
    },
  };
};

export const filterSlotsByBookingWindow = <T extends { time: Dayjs }>(
  slots: T[],
  bookingWindow: BookingWindow,
  eventLength: number
): T[] =>
  slots.filter((slot) => {
    const slotStart = slot.time.toDate();
    const slotEnd = slot.time.add(eventLength, "minute").toDate();
    return slotStart >= bookingWindow.start && slotEnd <= bookingWindow.end;
  });
