import RecurringEventController from "@calcom/features/eventtypes/components/tabs/recurring/RecurringEventController";
import type { EventTypeSetup, FormValues } from "@calcom/features/eventtypes/lib/types";
import { Frequency } from "@calcom/prisma/zod-utils";
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

const eventType = {
  id: 1,
  schedulingType: null,
  userId: 1,
  metadata: {},
  recurringEvent: null,
} as unknown as EventTypeSetup;

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

const renderController = ({
  defaultValues = { recurringEvent: null },
  paymentEnabled = false,
  event = eventType,
}: {
  defaultValues?: Partial<FormValues>;
  paymentEnabled?: boolean;
  event?: EventTypeSetup;
} = {}) =>
  render(
    <Wrapper defaultValues={defaultValues}>
      <RecurringEventController eventType={event} paymentEnabled={paymentEnabled} />
    </Wrapper>
  );

describe("RecurringEventController", () => {
  it("only warns about payments when the event type requires a payment", () => {
    renderController({ paymentEnabled: true });

    expect(screen.getByText("warning_payment_recurring_event")).toBeInTheDocument();
    expect(screen.queryByTestId("recurring-event-check")).toBeNull();
  });

  it("enables recurrence with the default weekly settings", async () => {
    renderController();

    expect(screen.queryByTestId("recurring-event-collapsible")).toBeNull();

    await userEvent.click(screen.getByRole("switch"));

    expect(latestValues.recurringEvent).toEqual({ interval: 1, count: 12, freq: Frequency.WEEKLY });
    expect(screen.getByTestId("recurring-event-collapsible")).toBeInTheDocument();
  });

  it("reuses the recurrence already configured on the event type", async () => {
    renderController({
      event: {
        ...eventType,
        recurringEvent: { interval: 2, count: 4, freq: Frequency.MONTHLY },
      } as unknown as EventTypeSetup,
    });

    await userEvent.click(screen.getByRole("switch"));

    expect(latestValues.recurringEvent).toEqual({ interval: 2, count: 4, freq: Frequency.MONTHLY });
  });

  it("clears the recurrence when it is turned off", async () => {
    renderController({
      defaultValues: { recurringEvent: { interval: 1, count: 12, freq: Frequency.WEEKLY } },
    });

    await userEvent.click(screen.getByRole("switch"));

    expect(latestValues.recurringEvent).toBeNull();
  });

  it("updates the interval and the maximum number of events", async () => {
    renderController({
      defaultValues: { recurringEvent: { interval: 1, count: 12, freq: Frequency.WEEKLY } },
    });

    const [intervalInput, countInput] = screen.getAllByRole("spinbutton");

    await userEvent.clear(intervalInput);
    await userEvent.type(intervalInput, "3");
    expect(latestValues.recurringEvent).toMatchObject({ interval: 3 });

    await userEvent.clear(countInput);
    await userEvent.type(countInput, "5");
    expect(latestValues.recurringEvent).toMatchObject({ count: 5 });
  });

  it("changes the frequency through the select", async () => {
    renderController({
      defaultValues: { recurringEvent: { interval: 1, count: 12, freq: Frequency.WEEKLY } },
    });

    await userEvent.click(screen.getByText("weekly"));
    await userEvent.click(screen.getByText("monthly"));

    expect(latestValues.recurringEvent).toMatchObject({ freq: Frequency.MONTHLY });
  });

  it("cannot be enabled for events that offer seats", () => {
    renderController({ defaultValues: { recurringEvent: null, seatsPerTimeSlot: 3 } });

    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("cannot be enabled for events with a booker booking limit", () => {
    renderController({ defaultValues: { recurringEvent: null, maxActiveBookingsPerBooker: 2 } });

    expect(screen.getByRole("switch")).toBeDisabled();
  });
});
