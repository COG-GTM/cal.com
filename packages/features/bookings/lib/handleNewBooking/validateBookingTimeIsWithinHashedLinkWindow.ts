import type { HashedLinkService } from "@calcom/features/hashedLink/lib/service/HashedLinkService";
import { HttpError } from "@calcom/lib/http-error";

type Props = {
  hashedLink: string;
  eventTypeId: number;
  reqBodyStart: string;
  reqBodyEnd: string;
  hashedLinkService: HashedLinkService;
};

export const validateBookingTimeIsWithinHashedLinkWindow = async ({
  hashedLink,
  eventTypeId,
  reqBodyStart,
  reqBodyEnd,
  hashedLinkService,
}: Props): Promise<void> => {
  const link = await hashedLinkService.validate(hashedLink);

  if (link.eventTypeId !== eventTypeId) {
    throw new HttpError({
      statusCode: 400,
      message: "The private link does not belong to this event type",
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
      message: "The booking time is outside the private link's bookable window",
    });
  }
};
