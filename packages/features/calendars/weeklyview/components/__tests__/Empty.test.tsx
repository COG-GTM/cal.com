import dayjs from "@calcom/dayjs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarStoreContext, createCalendarStore } from "../../state/store";
import type { CalendarAvailableTimeslots, CalendarComponentProps } from "../../types/state";
import { AvailableCellsForDay, EmptyCell } from "../event/Empty";

vi.mock("@calcom/features/bookings/lib", () => ({
  useTimePreferences: () => ({ timeFormat: "HH:mm" }),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

vi.mock("@calcom/lib/components/ServerTrans", () => ({
  default: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

const day = dayjs("2024-01-02T00:00:00Z");

const withStore = (ui: React.ReactNode, initial: Partial<CalendarComponentProps> = {}) => {
  const store = createCalendarStore({ startHour: 0, endHour: 23, ...initial });
  return render(<CalendarStoreContext.Provider value={store}>{ui}</CalendarStoreContext.Provider>);
};

describe("EmptyCell", () => {
  const props = {
    day,
    gridCellIdx: 4,
    totalGridCells: 48,
    selectionLength: 23,
    startHour: 0,
    timezone: "UTC",
  };

  it("renders a cell for the time the grid index maps to", () => {
    withStore(<EmptyCell {...props} />, { hoverEventDuration: 30 });

    expect(screen.getByTestId("calendar-empty-cell")).toHaveAttribute(
      "data-slot",
      "2024-01-02T02:00:00.000Z"
    );
  });

  it("reports clicks with the cell time", () => {
    const onEmptyCellClick = vi.fn();
    withStore(<EmptyCell {...props} />, { onEmptyCellClick, hoverEventDuration: 30 });

    fireEvent.click(screen.getByTestId("calendar-empty-cell"));

    expect(onEmptyCellClick).toHaveBeenCalledWith(new Date("2024-01-02T02:00:00.000Z"));
  });

  it("shows the hover label only when a hover duration is configured", () => {
    const { rerender, container } = withStore(<EmptyCell {...props} />, { hoverEventDuration: 30 });
    expect(screen.getByText("02:00")).toBeInTheDocument();

    const store = createCalendarStore({ startHour: 0, endHour: 23, hoverEventDuration: 0 });
    rerender(
      <CalendarStoreContext.Provider value={store}>
        <EmptyCell {...props} />
      </CalendarStoreContext.Provider>
    );
    expect(container.querySelector(".bg-brand-default")).not.toBeInTheDocument();
  });
});

describe("AvailableCellsForDay", () => {
  const slot = (start: string, end: string, extra: Record<string, unknown> = {}) => ({
    start,
    end,
    ...extra,
  });

  const renderCells = (
    availableSlots: CalendarAvailableTimeslots,
    renderOutOfOffice?: Parameters<typeof AvailableCellsForDay>[0]["renderOutOfOffice"]
  ) =>
    withStore(
      <AvailableCellsForDay
        timezone="UTC"
        availableSlots={availableSlots}
        day={day}
        startHour={0}
        renderOutOfOffice={renderOutOfOffice}
      />,
      { hoverEventDuration: 30 }
    );

  it("renders nothing when there are no slots for the day", () => {
    const { container } = renderCells({});

    expect(container).toBeEmptyDOMElement();
  });

  it("renders one cell per available slot", () => {
    renderCells({
      "2024-01-02": [
        slot("2024-01-02T09:00:00.000Z", "2024-01-02T09:30:00.000Z"),
        slot("2024-01-02T10:00:00.000Z", "2024-01-02T10:30:00.000Z"),
      ],
    });

    expect(screen.getAllByTestId("calendar-empty-cell")).toHaveLength(2);
  });

  it("renders the out of office slot when every slot is away", () => {
    renderCells({
      "2024-01-02": [
        slot("2024-01-02T09:00:00.000Z", "2024-01-02T09:30:00.000Z", {
          away: true,
          fromUser: { id: 1, displayName: "Alice" },
          toUser: { id: 2, displayName: "Bob" },
        }),
        slot("2024-01-02T10:00:00.000Z", "2024-01-02T10:30:00.000Z", {
          away: true,
          fromUser: { id: 1, displayName: "Alice" },
          toUser: { id: 2, displayName: "Bob" },
        }),
      ],
    });

    expect(screen.getByText("ooo_user_is_ooo")).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-empty-cell")).not.toBeInTheDocument();
  });

  it("uses a custom out of office renderer when one is given", () => {
    renderCells(
      {
        "2024-01-02": [
          slot("2024-01-02T09:00:00.000Z", "2024-01-02T09:30:00.000Z", {
            away: true,
            fromUser: { id: 1, displayName: "Alice" },
            toUser: { id: 2, displayName: "Bob" },
          }),
        ],
      },
      () => <span>custom ooo</span>
    );

    expect(screen.getByText("custom ooo")).toBeInTheDocument();
  });

  it("renders nothing when all slots are away but nothing may be shown", () => {
    const { container } = renderCells({
      "2024-01-02": [slot("2024-01-02T09:00:00.000Z", "2024-01-02T09:30:00.000Z", { away: true })],
    });

    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to regular cells when at least one slot is available", () => {
    renderCells({
      "2024-01-02": [
        slot("2024-01-02T09:00:00.000Z", "2024-01-02T09:30:00.000Z", { away: true }),
        slot("2024-01-02T10:00:00.000Z", "2024-01-02T10:30:00.000Z"),
      ],
    });

    expect(screen.getAllByTestId("calendar-empty-cell")).toHaveLength(2);
  });
});
