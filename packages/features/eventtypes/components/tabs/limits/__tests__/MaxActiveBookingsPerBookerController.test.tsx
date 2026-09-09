import MaxActiveBookingsPerBookerController from "@calcom/features/eventtypes/components/tabs/limits/MaxActiveBookingsPerBookerController";
import type { FormValues } from "@calcom/features/eventtypes/lib/types";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { installBrowserApiStubs } from "../../../__tests__/domStubs";

installBrowserApiStubs();

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

let latestValues: Partial<FormValues> = {};

const ValueSpy = () => {
  const { watch } = useFormContext<FormValues>();
  latestValues = watch();
  return null;
};

const Wrapper = ({
  children,
  defaultValues,
}: {
  children: ReactNode;
  defaultValues: Partial<FormValues>;
}) => {
  const form = useForm<FormValues>({ defaultValues });
  return (
    <TooltipProvider>
      <FormProvider {...form}>
        {children}
        <ValueSpy />
      </FormProvider>
    </TooltipProvider>
  );
};

const locked = { disabled: false, LockedIcon: false as const, isLocked: false };

const renderController = (
  defaultValues: Partial<FormValues> = { maxActiveBookingsPerBooker: null },
  maxActiveBookingsPerBookerLocked = locked
) =>
  render(
    <Wrapper defaultValues={defaultValues}>
      <MaxActiveBookingsPerBookerController
        maxActiveBookingsPerBookerLocked={maxActiveBookingsPerBookerLocked}
      />
    </Wrapper>
  );

describe("MaxActiveBookingsPerBookerController", () => {
  it("defaults the limit to one booking when the toggle is turned on", async () => {
    renderController();

    expect(screen.queryByTestId("booker-booking-limit-input")).toBeNull();

    await userEvent.click(screen.getByRole("switch"));

    expect(latestValues.maxActiveBookingsPerBooker).toBe(1);
    expect(screen.getByTestId("booker-booking-limit-input")).toBeInTheDocument();
  });

  it("clears the limit when the toggle is turned off", async () => {
    renderController({ maxActiveBookingsPerBooker: 3 });

    await userEvent.click(screen.getByRole("switch"));

    expect(latestValues.maxActiveBookingsPerBooker).toBeNull();
  });

  it("writes the typed limit into the form and clears it for an empty input", async () => {
    renderController({ maxActiveBookingsPerBooker: 3 });

    const input = screen.getByTestId("booker-booking-limit-input");
    await userEvent.clear(input);
    expect(latestValues.maxActiveBookingsPerBooker).toBeNull();

    await userEvent.type(input, "5");
    expect(latestValues.maxActiveBookingsPerBooker).toBe(5);
  });

  it("toggles the reschedule offer for the last booking", async () => {
    renderController({ maxActiveBookingsPerBooker: 3, maxActiveBookingPerBookerOfferReschedule: false });

    await userEvent.click(screen.getByRole("checkbox", { name: "reschedule_last_booking_offer" }));

    expect(latestValues.maxActiveBookingPerBookerOfferReschedule).toBe(true);
  });

  it("is disabled for recurring events", () => {
    renderController({
      maxActiveBookingsPerBooker: null,
      recurringEvent: { interval: 1, count: 12, freq: 2 },
    });

    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("is disabled when the field is locked by a managed event type", () => {
    renderController({ maxActiveBookingsPerBooker: null }, { ...locked, disabled: true, isLocked: true });

    expect(screen.getByRole("switch")).toBeDisabled();
  });
});
