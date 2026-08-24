import dayjs from "@calcom/dayjs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarStoreContext, createCalendarStore } from "../../state/store";
import type { CalendarEvent } from "../../types/events";
import type { CalendarComponentProps } from "../../types/state";
import { EventList } from "../event/EventList";

vi.mock("@calcom/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const day = dayjs("2024-01-02T00:00:00Z");

const event = (
  id: number,
  start: string,
  end: string,
  options?: CalendarEvent["options"]
): CalendarEvent => ({
  id,
  title: `Event ${id}`,
  start: new Date(start),
  end: new Date(end),
  options,
});

const renderEventList = (initial: Partial<CalendarComponentProps>) => {
  const store = createCalendarStore({ startHour: 0, endHour: 23, ...initial });
  return render(
    <CalendarStoreContext.Provider value={store}>
      <EventList day={day} />
    </CalendarStoreContext.Provider>
  );
};

describe("EventList", () => {
  it("renders only the events of the given day and skips all day events", () => {
    const { container } = renderEventList({
      events: [
        event(1, "2024-01-02T09:00:00Z", "2024-01-02T09:30:00Z"),
        event(2, "2024-01-03T09:00:00Z", "2024-01-03T09:30:00Z"),
        event(3, "2024-01-02T11:00:00Z", "2024-01-02T12:00:00Z", { allDay: true }),
      ],
    });

    expect(container.querySelectorAll("[data-calendar-event-id]")).toHaveLength(1);
    expect(container.querySelector("[data-calendar-event-id='1']")).toBeInTheDocument();
  });

  it("raises the z-index and disables pointer events according to the event options", () => {
    const { container } = renderEventList({
      events: [event(1, "2024-01-02T09:00:00Z", "2024-01-02T09:30:00Z", { borderOnly: true })],
    });

    const wrapper = container.querySelector("[data-calendar-event-id='1']") as HTMLElement;
    expect(wrapper.className).toContain("pointer-events-none");
  });

  it("forwards the test id and source of the event", () => {
    const { container } = renderEventList({
      events: [
        {
          ...event(1, "2024-01-02T09:00:00Z", "2024-01-02T09:30:00Z", { "data-test-id": "my-event" }),
          source: "google",
        },
      ],
    });

    expect(screen.getByTestId("my-event")).toBeInTheDocument();
    expect(container.querySelector("[data-calendar-event-source='google']")).toBeInTheDocument();
  });

  it("marks the hovered event and dims the rest of its overlap group", () => {
    const { container } = renderEventList({
      events: [
        event(1, "2024-01-02T09:00:00Z", "2024-01-02T10:00:00Z"),
        event(2, "2024-01-02T09:30:00Z", "2024-01-02T10:30:00Z"),
      ],
    });

    const first = container.querySelector("[data-calendar-event-id='1']") as HTMLElement;
    const second = container.querySelector("[data-calendar-event-id='2']") as HTMLElement;

    fireEvent.mouseEnter(first);
    expect(second.style.opacity).toBe("0.6");

    fireEvent.mouseLeave(first);
    expect(second.style.opacity).toBe("1");
  });

  it("scrolls the event matching the selected booking uid into view", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      });

    renderEventList({
      events: [event(1, "2024-01-02T09:00:00Z", "2024-01-02T09:30:00Z", { bookingUid: "uid-1" })],
      selectedBookingUid: "uid-1",
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });

    requestAnimationFrame.mockRestore();
  });

  it("does not scroll when no event matches the selected booking uid", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    renderEventList({
      events: [event(1, "2024-01-02T09:00:00Z", "2024-01-02T09:30:00Z")],
      selectedBookingUid: "unknown",
    });

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("reports clicks through the store callback", () => {
    const onEventClick = vi.fn();
    renderEventList({
      events: [event(1, "2024-01-02T09:00:00Z", "2024-01-02T09:30:00Z")],
      onEventClick,
    });

    screen.getByRole("button").click();

    expect(onEventClick).toHaveBeenCalled();
  });
});
