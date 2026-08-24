import { describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "../types/events";
import { createCalendarStore } from "./store";

const event = (uid: string, start: string): CalendarEvent => ({
  id: uid,
  title: `Event ${uid}`,
  start: new Date(start),
  end: new Date(new Date(start).getTime() + 30 * 60 * 1000),
});

describe("createCalendarStore", () => {
  it("exposes sensible defaults", () => {
    const state = createCalendarStore().getState();

    expect(state.view).toBe("week");
    expect(state.startHour).toBe(0);
    expect(state.endHour).toBe(23);
    expect(state.gridCellsPerHour).toBe(4);
    expect(state.events).toEqual([]);
    expect(state.startDate.getDay()).toBe(0);
  });

  it("lets initial props override the defaults", () => {
    const state = createCalendarStore({ view: "day", startHour: 8 }).getState();

    expect(state.view).toBe("day");
    expect(state.startHour).toBe(8);
  });

  it("updates view, dates, events and the selected event through its setters", () => {
    const store = createCalendarStore();
    const startDate = new Date("2024-01-01T00:00:00.000Z");
    const endDate = new Date("2024-01-07T00:00:00.000Z");
    const selected = event("1", "2024-01-01T10:00:00.000Z");

    store.getState().setView("month");
    store.getState().setStartDate(startDate);
    store.getState().setEndDate(endDate);
    store.getState().setEvents([selected]);
    store.getState().setSelectedEvent(selected);

    expect(store.getState()).toMatchObject({
      view: "month",
      startDate,
      endDate,
      events: [selected],
      selectedEvent: selected,
    });
  });

  describe("initState", () => {
    it("keeps the given event order when sortEvents is not set", () => {
      const store = createCalendarStore();
      const events = [event("2", "2024-01-02T10:00:00.000Z"), event("1", "2024-01-01T10:00:00.000Z")];

      store.getState().initState({ events, sortEvents: false });

      expect(store.getState().events.map((e) => e.id)).toEqual(["2", "1"]);
    });

    it("sorts events chronologically when sortEvents is set", () => {
      const store = createCalendarStore();
      const events = [event("2", "2024-01-02T10:00:00.000Z"), event("1", "2024-01-01T10:00:00.000Z")];

      store.getState().initState({ events, sortEvents: true });

      expect(store.getState().events.map((e) => e.id)).toEqual(["1", "2"]);
      expect(events.map((e) => e.id)).toEqual(["2", "1"]);
    });

    it("merges overlapping blocking dates and defaults them to an empty list", () => {
      const store = createCalendarStore();

      store.getState().initState({
        events: [],
        blockingDates: [
          {
            start: new Date("2024-01-01T09:00:00.000Z"),
            end: new Date("2024-01-01T10:00:00.000Z"),
          },
          {
            start: new Date("2024-01-01T10:00:00.000Z"),
            end: new Date("2024-01-01T11:00:00.000Z"),
          },
        ],
      });

      expect(store.getState().blockingDates).toHaveLength(1);

      store.getState().initState({ events: [] });
      expect(store.getState().blockingDates).toEqual([]);
    });

    it("carries over the selected booking uid", () => {
      const store = createCalendarStore();

      store.getState().initState({ events: [], selectedBookingUid: "booking-1" });

      expect(store.getState().selectedBookingUid).toBe("booking-1");
    });
  });

  describe("handleDateChange", () => {
    const startDate = new Date("2024-01-07T00:00:00.000Z");
    const endDate = new Date("2024-01-13T00:00:00.000Z");

    it("moves the range forward by one view unit and notifies the callback", () => {
      const onDateChange = vi.fn();
      const store = createCalendarStore({ startDate, endDate, view: "week", onDateChange });

      store.getState().handleDateChange("INCREMENT");

      expect(store.getState().startDate.toISOString()).toBe("2024-01-14T00:00:00.000Z");
      expect(store.getState().endDate.toISOString()).toBe("2024-01-20T00:00:00.000Z");
      expect(onDateChange).toHaveBeenCalledWith(
        new Date("2024-01-14T00:00:00.000Z"),
        new Date("2024-01-20T00:00:00.000Z")
      );
    });

    it("moves the range backwards and notifies the callback", () => {
      const onDateChange = vi.fn();
      const store = createCalendarStore({ startDate, endDate, view: "week", onDateChange });

      store.getState().handleDateChange("DECREMENT");

      expect(store.getState().startDate.toISOString()).toBe("2023-12-31T00:00:00.000Z");
      expect(onDateChange).toHaveBeenCalled();
    });

    it("does not move past minDate or maxDate when incrementing", () => {
      const store = createCalendarStore({
        startDate,
        endDate,
        view: "week",
        maxDate: new Date("2024-01-15T00:00:00.000Z"),
      });

      store.getState().handleDateChange("INCREMENT");

      expect(store.getState().startDate).toEqual(startDate);
      expect(store.getState().endDate).toEqual(endDate);
    });

    it("works without an onDateChange callback", () => {
      const store = createCalendarStore({ startDate, endDate, view: "day" });

      store.getState().handleDateChange("INCREMENT");

      expect(store.getState().startDate.toISOString()).toBe("2024-01-08T00:00:00.000Z");
    });
  });
});
