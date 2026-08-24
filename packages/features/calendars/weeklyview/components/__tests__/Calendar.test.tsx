import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Calendar } from "../Calendar";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@calcom/features/bookings/lib", () => ({
  useTimePreferences: () => ({ timeFormat: "HH:mm" }),
}));

vi.mock("@calcom/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const baseProps = {
  startDate: new Date("2024-01-01T00:00:00.000Z"),
  endDate: new Date("2024-01-02T00:00:00.000Z"),
  startHour: 9,
  endHour: 11,
  gridCellsPerHour: 4,
  timezone: "UTC",
  events: [],
  view: "week" as const,
};

describe("Calendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T10:00:00.000Z"));
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the heading, the day columns and an empty cell per grid stop", () => {
    const { container } = render(<Calendar {...baseProps} />);

    expect(screen.getByText("Mobile not supported yet")).toBeInTheDocument();
    expect(container.querySelector("[data-gridstopsperday]")).toHaveAttribute("data-gridstopsperday", "12");
    // 2 days x (3 displayed hours x 4 cells per hour)
    expect(screen.getAllByTestId("calendar-empty-cell")).toHaveLength(24);
  });

  it("hides the heading and shows the spinner while pending", () => {
    const { container, rerender } = render(<Calendar {...baseProps} hideHeader isPending />);

    expect(container.querySelector(".animate-spinning")).toBeInTheDocument();

    rerender(<Calendar {...baseProps} hideHeader />);
    expect(container.querySelector(".animate-spinning")).not.toBeInTheDocument();
  });

  it("renders available timeslots instead of empty cells when they are provided", () => {
    render(
      <Calendar
        {...baseProps}
        availableTimeslots={{
          "2024-01-01": [{ start: "2024-01-01T09:00:00.000Z", end: "2024-01-01T09:30:00.000Z" }],
        }}
      />
    );

    expect(screen.getAllByTestId("calendar-empty-cell")).toHaveLength(1);
  });

  it("renders the events of the range", () => {
    render(
      <Calendar
        {...baseProps}
        events={[
          {
            id: 1,
            title: "Standup",
            start: new Date("2024-01-01T09:00:00.000Z"),
            end: new Date("2024-01-01T09:30:00.000Z"),
          },
        ]}
      />
    );

    expect(screen.getAllByText("Standup").length).toBeGreaterThan(0);
  });

  it("drops the background pattern when it is disabled", () => {
    const { container } = render(<Calendar {...baseProps} showBackgroundPattern={false} />);

    expect(container.querySelector("[style*='repeating-linear-gradient']")).not.toBeInTheDocument();
  });

  it("uses the subtle border colour when asked", () => {
    const { container } = render(<Calendar {...baseProps} borderColor="subtle" />);

    expect(container.querySelector(".border-subtle")).toBeInTheDocument();
  });
});
