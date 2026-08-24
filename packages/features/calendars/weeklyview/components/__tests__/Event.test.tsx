import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "../../types/events";
import { Event } from "../event/Event";

vi.mock("@calcom/ui/components/tooltip", () => ({
  Tooltip: ({ children, content }: { children: React.ReactNode; content: React.ReactNode }) => (
    <div>
      <div data-testid="tooltip-content">{content}</div>
      {children}
    </div>
  ),
}));

const baseEvent: CalendarEvent = {
  id: 1,
  title: "Standup",
  start: new Date("2024-01-02T09:00:00.000Z"),
  end: new Date("2024-01-02T09:30:00.000Z"),
};

describe("Event", () => {
  it("renders a div with a single line layout for short events", () => {
    render(<Event event={baseEvent} eventDuration={30} />);

    const element = screen
      .getByTestId("tooltip-content")
      .parentElement?.querySelector("[data-booking-calendar-event]");
    expect(element?.tagName).toBe("DIV");
    expect(screen.getAllByText("Standup").length).toBeGreaterThan(0);
    expect(screen.getAllByText("09:00 - 09:30").length).toBeGreaterThan(0);
  });

  it("renders a button and reports clicks when a click handler is given", () => {
    const onEventClick = vi.fn();

    render(<Event event={baseEvent} eventDuration={60} onEventClick={onEventClick} />);

    const button = screen.getByRole("button");
    button.click();

    expect(onEventClick).toHaveBeenCalledWith(baseEvent);
  });

  it("shows the description only for full height events", () => {
    const event = { ...baseEvent, description: "Daily sync" };

    const { rerender } = render(<Event event={event} eventDuration={42} />);
    expect(screen.getAllByText("Daily sync")).toHaveLength(1);

    rerender(<Event event={event} eventDuration={60} />);
    expect(screen.getAllByText("Daily sync")).toHaveLength(2);
  });

  it("hides the time range when the event asks for it", () => {
    render(<Event event={{ ...baseEvent, options: { hideTime: true } }} eventDuration={60} />);

    expect(screen.queryByText("09:00 - 09:30")).not.toBeInTheDocument();
  });

  it("derives the colour bar from the booking status", () => {
    const { container } = render(
      <Event event={{ ...baseEvent, options: { status: "PENDING" } }} eventDuration={60} />
    );

    expect(container.querySelector(".bg-orange-500")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("prefers an explicit colour over the status colour", () => {
    const { container } = render(
      <Event event={{ ...baseEvent, options: { status: "ACCEPTED", color: "#ff0000" } }} eventDuration={60} />
    );

    expect(container.querySelector(".bg-green-500")).not.toBeInTheDocument();
    expect(container.querySelector("[style*='rgb(255, 0, 0)']")).toBeInTheDocument();
  });

  it("does not show a status line for accepted bookings", () => {
    render(<Event event={{ ...baseEvent, options: { status: "ACCEPTED" } }} eventDuration={60} />);

    expect(screen.queryByText("accepted")).not.toBeInTheDocument();
  });

  it("highlights the event when it is hovered or currently selected", () => {
    const { container, rerender } = render(
      <Event event={baseEvent} eventDuration={60} isHovered currentlySelectedEventId={2} />
    );
    expect(container.querySelector(".ring-2")).toBeInTheDocument();

    rerender(<Event event={baseEvent} eventDuration={60} currentlySelectedEventId={1} />);
    expect(container.querySelector(".ring-2")).toBeInTheDocument();
  });

  it("exposes the booking uid and custom class names", () => {
    const { container } = render(
      <Event
        event={{
          ...baseEvent,
          options: { bookingUid: "uid-1", className: "custom-event", borderOnly: true },
        }}
        eventDuration={60}
      />
    );

    expect(container.querySelector("[data-booking-uid='uid-1']")).toBeInTheDocument();
    expect(container.querySelector(".custom-event")).toBeInTheDocument();
  });
});
