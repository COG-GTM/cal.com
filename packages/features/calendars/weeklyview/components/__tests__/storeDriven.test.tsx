import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarStoreContext, createCalendarStore } from "../../state/store";
import type { CalendarComponentProps } from "../../types/state";
import { CurrentTime } from "../currentTime/index";
import { SchedulerHeading } from "../heading/SchedulerHeading";

vi.mock("@calcom/features/bookings/lib", () => ({
  useTimePreferences: () => ({ timeFormat: "HH:mm" }),
}));

const renderWithStore = (ui: ReactNode, initial?: Partial<CalendarComponentProps>) => {
  const store = createCalendarStore(initial);
  const result = render(<CalendarStoreContext.Provider value={store}>{ui}</CalendarStoreContext.Provider>);
  return { ...result, store };
};

describe("SchedulerHeading", () => {
  const initial = {
    startDate: new Date("2024-01-07T00:00:00.000Z"),
    endDate: new Date("2024-01-13T00:00:00.000Z"),
    view: "week" as const,
  };

  it("renders the date range of the current view", () => {
    renderWithStore(<SchedulerHeading />, initial);

    expect(screen.getByRole("heading")).toHaveTextContent("Jan 07-13,2024");
  });

  it("moves the range when the navigation buttons are used", () => {
    const { store } = renderWithStore(<SchedulerHeading />, initial);

    fireEvent.click(screen.getByLabelText("Next Week"));
    expect(store.getState().startDate.toISOString()).toBe("2024-01-14T00:00:00.000Z");

    fireEvent.click(screen.getByLabelText("Previous Week"));
    expect(store.getState().startDate.toISOString()).toBe("2024-01-07T00:00:00.000Z");
  });

  it("throws when rendered outside of a calendar store provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => render(<SchedulerHeading />)).toThrow("useCalendarStore must be used within");

    consoleError.mockRestore();
  });
});

describe("CurrentTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-07T10:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the current time in the given timezone", () => {
    renderWithStore(<CurrentTime timezone="UTC" scrollToCurrentTime={false} />, {
      startHour: 9,
      endHour: 17,
    });

    expect(screen.getByText("10:30")).toBeInTheDocument();

    renderWithStore(<CurrentTime timezone="America/New_York" scrollToCurrentTime={false} />, {
      startHour: 0,
      endHour: 23,
    });

    expect(screen.getByText("05:30")).toBeInTheDocument();
  });

  it("still renders when the current time is outside of the displayed hours", () => {
    const { container } = renderWithStore(<CurrentTime timezone="UTC" scrollToCurrentTime={false} />, {
      startHour: 12,
      endHour: 17,
    });

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("10:30")).toBeInTheDocument();
  });

  it("scrolls itself into view once when asked to", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    renderWithStore(<CurrentTime timezone="UTC" />, { startHour: 9, endHour: 17 });
    vi.advanceTimersByTime(200);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("recomputes the position when the tab becomes visible again", () => {
    const { unmount } = renderWithStore(
      <CurrentTime timezone="UTC" scrollToCurrentTime={false} updateOnFocus />,
      { startHour: 9, endHour: 17 }
    );

    const removeEventListener = vi.spyOn(document, "removeEventListener");

    vi.setSystemTime(new Date("2024-01-07T11:00:00.000Z"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByText("11:00")).toBeInTheDocument();

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });

  it("does not listen for visibility changes when updateOnFocus is off", () => {
    const addEventListener = vi.spyOn(document, "addEventListener");

    renderWithStore(<CurrentTime timezone="UTC" scrollToCurrentTime={false} />, {
      startHour: 9,
      endHour: 17,
    });

    expect(addEventListener).not.toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
