import dayjs from "@calcom/dayjs";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarStoreContext, createCalendarStore } from "../../state/store";
import type { CalendarComponentProps } from "../../types/state";
import { DateValues } from "../DateValues/index";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ i18n: { language: "en" } }),
}));

const days = [dayjs("2024-01-01T00:00:00Z"), dayjs("2024-01-02T00:00:00Z")];

const renderDateValues = (initial: Partial<CalendarComponentProps>, showBorder = true) => {
  const store = createCalendarStore(initial);
  return render(
    <CalendarStoreContext.Provider value={store}>
      <DateValues
        showBorder={showBorder}
        borderColor="default"
        days={days}
        containerNavRef={createRef<HTMLDivElement>()}
      />
    </CalendarStoreContext.Provider>
  );
};

describe("DateValues", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-02T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a weekday label per day and highlights today", () => {
    const { container } = renderDateValues({ timezone: "UTC" });

    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(container.querySelector("[data-dayslength='2']")).toBeInTheDocument();
    expect(container.querySelector(".bg-brand-default")).toBeInTheDocument();
  });

  it("omits the timezone label when showTimezone is off", () => {
    renderDateValues({ timezone: "UTC", showTimezone: false });

    expect(screen.queryByText(/GMT/)).not.toBeInTheDocument();
  });

  it("shows a bare GMT label for a zero offset timezone", () => {
    renderDateValues({ timezone: "UTC", showTimezone: true });

    expect(screen.getByText("GMT")).toBeInTheDocument();
  });

  it("shows the signed decimal offset for other timezones", () => {
    renderDateValues({ timezone: "America/New_York", showTimezone: true });
    expect(screen.getByText("GMT -5")).toBeInTheDocument();
  });

  it("shows a positive fractional offset", () => {
    renderDateValues({ timezone: "Asia/Kolkata", showTimezone: true });

    expect(screen.getByText("GMT +5.5")).toBeInTheDocument();
  });

  it("drops the border classes when showBorder is off", () => {
    const { container } = renderDateValues({ timezone: "UTC" }, false);

    expect(container.querySelector(".border-r-default")).not.toBeInTheDocument();
  });
});
