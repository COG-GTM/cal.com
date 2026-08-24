import dayjs from "@calcom/dayjs";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarStoreContext, createCalendarStore } from "../../state/store";
import type { CalendarComponentProps } from "../../types/state";
import { BlockedList } from "../blocking/BlockedList";

const renderBlockedList = (day: dayjs.Dayjs, initial: Partial<CalendarComponentProps> = {}) => {
  const store = createCalendarStore({ startHour: 0, endHour: 23, ...initial });
  return render(
    <CalendarStoreContext.Provider value={store}>
      <BlockedList day={day} containerRef={createRef<HTMLDivElement>()} />
    </CalendarStoreContext.Provider>
  );
};

const blockedCells = (container: HTMLElement) => container.querySelectorAll(".hover\\:cursor-not-allowed");

describe("BlockedList", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks the whole column for days in the past", () => {
    const { container } = renderBlockedList(dayjs("2024-01-09T00:00:00Z"));

    expect(blockedCells(container)).toHaveLength(1);
  });

  it("blocks the elapsed part of today", () => {
    const { container } = renderBlockedList(dayjs("2024-01-10T00:00:00Z"));

    expect(blockedCells(container)).toHaveLength(1);
  });

  it("renders nothing for a future day without blocking dates", () => {
    const { container } = renderBlockedList(dayjs("2024-01-11T00:00:00Z"));

    expect(blockedCells(container)).toHaveLength(0);
  });

  it("renders a cell per blocking range that falls on the day", () => {
    const { container } = renderBlockedList(dayjs("2024-01-11T00:00:00Z"), {
      blockingDates: [
        { start: new Date("2024-01-11T09:00:00.000Z"), end: new Date("2024-01-11T10:00:00.000Z") },
        { start: new Date("2024-01-12T09:00:00.000Z"), end: new Date("2024-01-12T10:00:00.000Z") },
      ],
    });

    expect(blockedCells(container)).toHaveLength(1);
  });

  it("skips blocking ranges that already ended", () => {
    const { container } = renderBlockedList(dayjs("2024-01-10T00:00:00Z"), {
      blockingDates: [
        { start: new Date("2024-01-10T08:00:00.000Z"), end: new Date("2024-01-10T09:00:00.000Z") },
      ],
    });

    // Only the "elapsed part of today" cell remains.
    expect(blockedCells(container)).toHaveLength(1);
  });

  it("keeps blocking ranges that started in the past but are still running", () => {
    const { container } = renderBlockedList(dayjs("2024-01-10T00:00:00Z"), {
      blockingDates: [
        { start: new Date("2024-01-10T11:00:00.000Z"), end: new Date("2024-01-10T14:00:00.000Z") },
      ],
    });

    expect(blockedCells(container)).toHaveLength(2);
  });
});
