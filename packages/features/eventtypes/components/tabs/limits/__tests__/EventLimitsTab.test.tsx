import { EventLimitsTab } from "@calcom/features/eventtypes/components/tabs/limits/EventLimitsTab";
import type { EventTypeSetupProps, FormValues } from "@calcom/features/eventtypes/lib/types";
import { PeriodType, SchedulingType } from "@calcom/prisma/enums";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { installBrowserApiStubs } from "../../../__tests__/domStubs";

installBrowserApiStubs();

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
    usePathname: () => "/event-types/1",
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values && "x" in values ? `${key}:${String(values.x)}` : key,
    i18n: { language: "en" },
  }),
}));

type EventType = EventTypeSetupProps["eventType"];

const buildEventType = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 1,
    userId: 1,
    schedulingType: null,
    metadata: {},
    team: null,
    parent: null,
    ...overrides,
  }) as unknown as EventType;

const defaultFormValues: Partial<FormValues> = {
  beforeEventBuffer: 0,
  afterEventBuffer: 0,
  minimumBookingNotice: 120,
  slotInterval: null,
  bookingLimits: {},
  durationLimits: {},
  onlyShowFirstAvailableSlot: false,
  periodType: PeriodType.UNLIMITED,
  periodDays: 0,
  periodCountCalendarDays: false,
  periodDates: { startDate: new Date("2024-01-01"), endDate: new Date("2024-01-10") },
  offsetStart: 0,
  maxActiveBookingsPerBooker: null,
  metadata: {},
};

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

const renderTab = ({
  values = {},
  eventType = buildEventType(),
}: {
  values?: Partial<FormValues>;
  eventType?: EventType;
} = {}) =>
  render(
    <Wrapper defaultValues={{ ...defaultFormValues, ...values }}>
      <EventLimitsTab eventType={eventType} />
    </Wrapper>
  );

const getToggle = (title: string) => {
  const toggle = screen.getByText(title).closest("fieldset")?.querySelector('button[role="switch"]');
  expect(toggle).toBeTruthy();
  return toggle as HTMLElement;
};

const getSpinButtonWithValue = (value: string) => {
  const input = screen
    .getAllByRole("spinbutton")
    .find((element) => (element as HTMLInputElement).value === value);
  expect(input).toBeTruthy();
  return input as HTMLElement;
};

describe("EventLimitsTab buffers and notice", () => {
  it("stores the selected before-event buffer in the form", async () => {
    renderTab();

    await userEvent.click(screen.getAllByText("event_buffer_default")[0]);
    await userEvent.click(screen.getByText("15 minutes"));

    expect(latestValues.beforeEventBuffer).toBe(15);
  });

  it("stores the selected after-event buffer in the form", async () => {
    renderTab();

    await userEvent.click(screen.getAllByText("event_buffer_default")[1]);
    await userEvent.click(screen.getByText("45 minutes"));

    expect(latestValues.afterEventBuffer).toBe(45);
  });

  it("shows the minimum booking notice in the largest matching unit", () => {
    renderTab({ values: { minimumBookingNotice: 120 } });

    expect(screen.getByPlaceholderText("0")).toHaveValue(2);
    expect(screen.getByText("hours")).toBeInTheDocument();
  });

  it("converts the typed minimum booking notice back into minutes", async () => {
    renderTab({ values: { minimumBookingNotice: 120 } });

    const input = screen.getByPlaceholderText("0");
    await userEvent.clear(input);
    await userEvent.type(input, "3");

    expect(latestValues.minimumBookingNotice).toBe(180);
  });

  it("converts the minimum booking notice when the unit changes", async () => {
    renderTab({ values: { minimumBookingNotice: 120 } });

    await userEvent.click(screen.getByText("hours"));
    await userEvent.click(screen.getByText("days"));

    expect(latestValues.minimumBookingNotice).toBe(2 * 24 * 60);
  });

  it("stores a slot interval and resets it to null for the default option", async () => {
    renderTab();

    await userEvent.click(screen.getByText("slot_interval_default"));
    await userEvent.click(screen.getByText("20 minutes"));
    expect(latestValues.slotInterval).toBe(20);

    await userEvent.click(screen.getByText("20 minutes"));
    await userEvent.click(screen.getByText("slot_interval_default"));
    expect(latestValues.slotInterval).toBeNull();
  });
});

describe("EventLimitsTab booking frequency limits", () => {
  it("seeds a daily limit when enabled and clears it when disabled", async () => {
    renderTab();

    await userEvent.click(getToggle("limit_booking_frequency"));
    expect(latestValues.bookingLimits).toEqual({ PER_DAY: 1 });

    await userEvent.click(getToggle("limit_booking_frequency"));
    expect(latestValues.bookingLimits).toEqual({});
  });

  it("adds the next unused interval when add_limit is clicked", async () => {
    renderTab({ values: { bookingLimits: { PER_DAY: 1 } } });

    await userEvent.click(screen.getByText("add_limit"));

    expect(latestValues.bookingLimits).toEqual({ PER_DAY: 1, PER_WEEK: 1 });
  });

  it("updates the limit value that is typed", async () => {
    renderTab({ values: { bookingLimits: { PER_DAY: 1 } } });

    const item = screen.getByTestId("add-limit");
    const input = within(item).getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "4");

    expect(latestValues.bookingLimits).toEqual({ PER_DAY: 4 });
  });

  it("moves the limit to the newly selected interval", async () => {
    renderTab({ values: { bookingLimits: { PER_DAY: 3 } } });

    await userEvent.click(screen.getByText("Per day"));
    await userEvent.click(screen.getByText("Per month"));

    expect(latestValues.bookingLimits).toEqual({ PER_MONTH: 3 });
  });

  it("deletes a limit and hides the delete buttons when only one is left", async () => {
    renderTab({ values: { bookingLimits: { PER_DAY: 1, PER_WEEK: 2 } } });

    const items = screen.getAllByTestId("add-limit");
    const deleteButton = within(items[0]).getByRole("button");
    await userEvent.click(deleteButton);

    expect(latestValues.bookingLimits).toEqual({ PER_WEEK: 2 });
  });

  it("hides the add button once all four intervals are used", () => {
    renderTab({
      values: { bookingLimits: { PER_DAY: 1, PER_WEEK: 1, PER_MONTH: 1, PER_YEAR: 1 } },
    });

    expect(screen.queryByText("add_limit")).toBeNull();
  });
});

describe("EventLimitsTab duration and slot limits", () => {
  it("toggles onlyShowFirstAvailableSlot", async () => {
    renderTab();

    await userEvent.click(getToggle("only_show_first_available_slot"));

    expect(latestValues.onlyShowFirstAvailableSlot).toBe(true);
  });

  it("seeds a 60 minute daily duration limit when enabled and clears it when disabled", async () => {
    renderTab();

    await userEvent.click(getToggle("limit_total_booking_duration"));
    expect(latestValues.durationLimits).toEqual({ PER_DAY: 60 });

    await userEvent.click(getToggle("limit_total_booking_duration"));
    expect(latestValues.durationLimits).toEqual({});
  });
});

describe("EventLimitsTab future booking limits", () => {
  it("defaults to a 30 day rolling limit when enabled and resets to unlimited when disabled", async () => {
    renderTab();

    await userEvent.click(getToggle("limit_future_bookings"));
    expect(latestValues.periodType).toBe(PeriodType.ROLLING);
    expect(latestValues.periodDays).toBe(30);

    await userEvent.click(getToggle("limit_future_bookings"));
    expect(latestValues.periodType).toBe(PeriodType.UNLIMITED);
  });

  it("keeps an already configured number of period days", async () => {
    renderTab({ values: { periodDays: 12 } });

    await userEvent.click(getToggle("limit_future_bookings"));

    expect(latestValues.periodDays).toBe(12);
  });

  it("switches between calendar days and business days", async () => {
    renderTab({ values: { periodType: PeriodType.ROLLING, periodDays: 30 } });

    await userEvent.click(screen.getByText("business_days"));
    await userEvent.click(screen.getByText("calendar_days"));
    expect(latestValues.periodCountCalendarDays).toBe(true);

    await userEvent.click(screen.getByText("calendar_days"));
    await userEvent.click(screen.getByText("business_days"));
    expect(latestValues.periodCountCalendarDays).toBe(false);
  });

  it("turns the rolling limit into a rolling window when unavailable days are excluded", async () => {
    renderTab({ values: { periodType: PeriodType.ROLLING, periodDays: 30 } });

    await userEvent.click(screen.getByRole("checkbox", { name: /always_show_x_days:30/ }));

    expect(latestValues.periodType).toBe(PeriodType.ROLLING_WINDOW);
  });

  it("caps the period days when switching to a rolling window", async () => {
    renderTab({ values: { periodType: PeriodType.ROLLING, periodDays: 5000 } });

    await userEvent.click(screen.getByRole("checkbox", { name: /always_show_x_days:5000/ }));

    expect(latestValues.periodDays).toBeLessThan(5000);
  });

  it("renders a rolling window event type with the exclusion already checked", () => {
    renderTab({ values: { periodType: PeriodType.ROLLING_WINDOW, periodDays: 30 } });

    expect(screen.getByRole("checkbox", { name: /always_show_x_days:30/ })).toBeChecked();
  });

  it("switches the limit to a date range", async () => {
    renderTab({ values: { periodType: PeriodType.ROLLING, periodDays: 30 } });

    await userEvent.click(screen.getAllByRole("radio")[1]);

    expect(latestValues.periodType).toBe(PeriodType.RANGE);
  });
});

describe("EventLimitsTab offset start", () => {
  it("does not render the offset section when there is no offset", () => {
    renderTab();

    expect(screen.queryByText("offset_toggle")).toBeNull();
  });

  it("renders the offset section and clears the offset when toggled off", async () => {
    renderTab({ values: { offsetStart: 15 } });

    expect(getSpinButtonWithValue("15")).toBeInTheDocument();

    await userEvent.click(getToggle("offset_toggle"));

    expect(latestValues.offsetStart).toBe(0);
  });
});

describe("EventLimitsTab team limits badge", () => {
  it("links to the team settings when the team has booking limits", () => {
    renderTab({
      eventType: buildEventType({ team: { id: 7, bookingLimits: { PER_DAY: 2 } } }),
    });

    const badge = screen.getByText("team_limits_apply");
    expect(badge.closest("a")).toHaveAttribute("href", "/settings/teams/7/settings");
  });

  it("renders a non-linked badge for a managed child event type", () => {
    renderTab({
      eventType: buildEventType({
        team: null,
        parent: { team: { bookingLimits: { PER_DAY: 2 }, includeManagedEventsInLimits: true } },
      }),
    });

    const badge = screen.getByText("team_limits_apply");
    expect(badge.closest("a")).toBeNull();
  });

  it("hides the badge when the team has no booking limits", () => {
    renderTab({ eventType: buildEventType({ team: { id: 7, bookingLimits: {} } }) });

    expect(screen.queryByText("team_limits_apply")).toBeNull();
  });

  it("hides the badge on a managed parent that does not include managed events in its limits", () => {
    renderTab({
      eventType: buildEventType({
        schedulingType: SchedulingType.MANAGED,
        team: { id: 7, bookingLimits: { PER_DAY: 2 }, includeManagedEventsInLimits: false },
      }),
    });

    expect(screen.queryByText("team_limits_apply")).toBeNull();
  });
});

describe("EventLimitsTab locked fields", () => {
  it("disables the limits of a managed child event type", () => {
    renderTab({
      values: {
        ...defaultFormValues,
        metadata: { managedEventConfig: { unlockedFields: {} } },
      },
      eventType: buildEventType({ metadata: { managedEventConfig: { unlockedFields: {} } } }),
    });

    expect(getToggle("limit_booking_frequency")).toBeDisabled();
    expect(getToggle("limit_total_booking_duration")).toBeDisabled();
    expect(getToggle("limit_future_bookings")).toBeDisabled();
  });

  it("keeps unlocked fields editable on a managed child event type", () => {
    const metadata = { managedEventConfig: { unlockedFields: { bookingLimits: true } } };
    renderTab({
      values: { ...defaultFormValues, metadata },
      eventType: buildEventType({ metadata }),
    });

    expect(getToggle("limit_booking_frequency")).not.toBeDisabled();
    expect(getToggle("limit_total_booking_duration")).toBeDisabled();
  });
});
