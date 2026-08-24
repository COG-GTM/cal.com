import dayjs from "@calcom/dayjs";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockedTimeCell } from "../blocking/BlockedTimeCell";
import { SchedulerColumns } from "../grid/index";
import { HorizontalLines } from "../horizontalLines/index";
import { Spinner } from "../spinner/Spinner";
import { VerticalLines } from "../verticalLines/index";

vi.mock("@calcom/features/bookings/lib", () => ({
  useTimePreferences: () => ({ timeFormat: "HH:mm" }),
}));

const days = [dayjs("2024-01-01"), dayjs("2024-01-02"), dayjs("2024-01-03")];

describe("VerticalLines", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders one line per day in left to right order for ltr locales", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");

    const { container } = render(<VerticalLines days={days} borderColor="default" />);
    const wrapper = container.firstElementChild;

    expect(wrapper).toHaveAttribute("dir", "ltr");
    expect(wrapper?.className).toContain("divide-default");
    expect(wrapper?.children).toHaveLength(days.length);
    expect((wrapper?.children[0] as HTMLElement).style.gridColumnStart).toBe("1");
  });

  it("reverses the column order for rtl locales and honours the subtle border color", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("ar-EG");

    const { container } = render(<VerticalLines days={days} borderColor="subtle" />);
    const wrapper = container.firstElementChild;

    expect(wrapper).toHaveAttribute("dir", "rtl");
    expect(wrapper?.className).toContain("divide-subtle");
    expect((wrapper?.children[0] as HTMLElement).style.gridColumnStart).toBe("3");
  });
});

describe("HorizontalLines", () => {
  it("renders a label per hour plus a trailing label for the hour after the last one", () => {
    const hours = [dayjs("2024-01-01T09:00:00Z"), dayjs("2024-01-01T10:00:00Z")];

    render(
      <HorizontalLines
        hours={hours}
        numberOfGridStopsPerCell={4}
        containerOffsetRef={createRef<HTMLDivElement>()}
        borderColor="default"
      />
    );

    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByText("11:00")).toBeInTheDocument();
  });

  it("sizes the grid rows from the number of hours", () => {
    const hours = [dayjs("2024-01-01T09:00:00Z")];

    const { container } = render(
      <HorizontalLines
        hours={hours}
        numberOfGridStopsPerCell={4}
        containerOffsetRef={createRef<HTMLDivElement>()}
        borderColor="subtle"
      />
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.gridTemplateRows).toContain("repeat(1");
    expect(wrapper.className).toContain("divide-subtle");
  });
});

describe("Spinner", () => {
  it("merges custom class names onto the wrapper", () => {
    const { container } = render(<Spinner className="custom-spinner" />);

    expect(container.firstElementChild?.className).toContain("custom-spinner");
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("BlockedTimeCell", () => {
  it("renders a non interactive striped overlay", () => {
    const { container } = render(<BlockedTimeCell />);

    expect(container.firstElementChild?.className).toContain("hover:cursor-not-allowed");
  });
});

describe("SchedulerColumns", () => {
  it("forwards its ref, exposes the grid stops and renders children", () => {
    const ref = createRef<HTMLOListElement>();

    render(
      <SchedulerColumns ref={ref} offsetHeight={20} gridStopsPerDay={48} zIndex={5}>
        <li>column</li>
      </SchedulerColumns>
    );

    expect(ref.current).toBeInstanceOf(HTMLOListElement);
    expect(ref.current).toHaveAttribute("data-gridstopsperday", "48");
    expect(ref.current?.style.marginTop).toBe("20px");
    expect(ref.current?.style.zIndex).toBe("5");
    expect(screen.getByText("column")).toBeInTheDocument();
  });

  it("renders without an explicit offset height", () => {
    const ref = createRef<HTMLOListElement>();

    render(
      <SchedulerColumns ref={ref} offsetHeight={undefined} gridStopsPerDay={24}>
        <li>column</li>
      </SchedulerColumns>
    );

    expect(ref.current?.style.marginTop).not.toBe("20px");
    expect(ref.current).toHaveAttribute("data-gridstopsperday", "24");
  });
});
