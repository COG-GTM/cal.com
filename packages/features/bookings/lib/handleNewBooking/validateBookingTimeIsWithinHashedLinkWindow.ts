import type { HashedLinkRepository } from "@calcom/features/hashedLink/lib/repository/HashedLinkRepository";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { HttpError } from "@calcom/lib/http-error";

type Props = {
  hashedLink: string;
  eventTypeId: number;
  reqBodyStart: string;
  reqBodyEnd: string;
  hashedLinkRepository: HashedLinkRepository;
};

export const validateBookingTimeIsWithinHashedLinkWindow = async ({
  hashedLink,
  eventTypeId,
  reqBodyStart,
  reqBodyEnd,
  hashedLinkRepository,
}: Props): Promise<void> => {
  const link = await hashedLinkRepository.findLinkWithValidationData(hashedLink);

  if (!link || link.eventTypeId !== eventTypeId) {
    throw new HttpError({
      statusCode: 400,
      message: ErrorCode.PrivateLinkWrongEventType,
    });
  }

  if (!link.bookingWindowStart || !link.bookingWindowEnd) {
    return;
  }

  const bookingStart = new Date(reqBodyStart);
  const bookingEnd = new Date(reqBodyEnd);
  const isWithinWindow = bookingStart >= link.bookingWindowStart && bookingEnd <= link.bookingWindowEnd;

  if (!isWithinWindow) {
    throw new HttpError({
      statusCode: 400,
      message: ErrorCode.BookingTimeOutsidePrivateLinkWindow,
    });
  }
};
