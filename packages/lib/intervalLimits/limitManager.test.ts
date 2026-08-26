import dayjs from "@calcom/dayjs";
import { describe, expect, it } from "vitest";
import LimitManager, { LimitSources } from "./limitManager";

describe("LimitSources", () => {
  it("returns title and source for eventBookingLimit", () => {
    expect(LimitSources.eventBookingLimit({ limit: 3, unit: "day" })).toEqual({
      title: "busy_time.event_booking_limit",
      source: "Event Booking Limit for User: 3 per day",
    });
  });

  it("returns title and source for eventDurationLimit", () => {
    expect(LimitSources.eventDurationLimit({ limit: 120, unit: "week" })).toEqual({
      title: "busy_time.event_duration_limit",
      source: "Event Duration Limit for User: 120 minutes per week",
    });
  });

  it("returns title and source for teamBookingLimit", () => {
    expect(LimitSources.teamBookingLimit({ limit: 10, unit: "month" })).toEqual({
      title: "busy_time.team_booking_limit",
      source: "Team Booking Limit: 10 per month",
    });
  });
});

describe("LimitManager", () => {
  const start = dayjs.utc("2024-06-12T00:00:00.000Z");

  const addBusy = (manager: LimitManager, unit: "day" | "week" | "month" | "year", startTime = start) => {
    manager.addBusyTime({
      start: startTime.startOf(unit),
      unit,
      title: "busy",
      source: "test",
    });
  };

  it("returns empty busy times initially", () => {
    const manager = new LimitManager();
    expect(manager.getBusyTimes()).toEqual([]);
  });

  it("adds a busy time with start, end, title and source", () => {
    const manager = new LimitManager();
    addBusy(manager, "day");
    expect(manager.getBusyTimes()).toEqual([
      {
        start: start.startOf("day").toISOString(),
        end: start.endOf("day").toISOString(),
        title: "busy",
        source: "test",
      },
    ]);
  });

  it("adds a busy time in a specific timezone", () => {
    const manager = new LimitManager();
    const tzStart = start.tz("America/New_York").startOf("day");
    manager.addBusyTime({
      start: tzStart,
      unit: "day",
      timeZone: "America/New_York",
      title: "busy",
      source: "test",
    });
    expect(manager.getBusyTimes()).toEqual([
      {
        start: tzStart.toISOString(),
        end: tzStart.endOf("day").toISOString(),
        title: "busy",
        source: "test",
      },
    ]);
    expect(manager.isAlreadyBusy(tzStart, "day", "America/New_York")).toBe(true);
  });

  it("is not busy when nothing was added", () => {
    const manager = new LimitManager();
    expect(manager.isAlreadyBusy(start, "day")).toBe(false);
    expect(manager.isAlreadyBusy(start, "week")).toBe(false);
    expect(manager.isAlreadyBusy(start, "month")).toBe(false);
  });

  it("marks everything busy when the year is busy", () => {
    const manager = new LimitManager();
    addBusy(manager, "year");
    expect(manager.isAlreadyBusy(start, "day")).toBe(true);
    expect(manager.isAlreadyBusy(start, "week")).toBe(true);
    expect(manager.isAlreadyBusy(start, "month")).toBe(true);
  });

  it("marks month busy when the month is busy", () => {
    const manager = new LimitManager();
    addBusy(manager, "month");
    expect(manager.isAlreadyBusy(start, "month")).toBe(true);
    expect(manager.isAlreadyBusy(start, "day")).toBe(true);
  });

  it("marks week busy only when both months of the week are busy", () => {
    const manager = new LimitManager();
    // 2024-06-30 is a week spanning June and July
    const weekSpanningTwoMonths = dayjs.utc("2024-06-30T00:00:00.000Z");
    addBusy(manager, "month", weekSpanningTwoMonths);
    expect(manager.isAlreadyBusy(weekSpanningTwoMonths, "week")).toBe(false);

    addBusy(manager, "month", weekSpanningTwoMonths.endOf("week"));
    expect(manager.isAlreadyBusy(weekSpanningTwoMonths, "week")).toBe(true);
  });

  it("marks week busy when the week itself is busy", () => {
    const manager = new LimitManager();
    addBusy(manager, "week");
    expect(manager.isAlreadyBusy(start, "week")).toBe(true);
    expect(manager.isAlreadyBusy(start, "day")).toBe(true);
  });

  it("marks day busy when the day itself is busy", () => {
    const manager = new LimitManager();
    addBusy(manager, "day");
    expect(manager.isAlreadyBusy(start, "day")).toBe(true);
    expect(manager.isAlreadyBusy(start.add(1, "day"), "day")).toBe(false);
  });

  it("merges busy times from another manager without overwriting", () => {
    const managerA = new LimitManager();
    const managerB = new LimitManager();
    addBusy(managerA, "day");
    managerB.addBusyTime({
      start: start.startOf("day"),
      unit: "day",
      title: "other",
      source: "other-source",
    });
    addBusy(managerB, "week");

    managerA.mergeBusyTimes(managerB);

    const busyTimes = managerA.getBusyTimes();
    expect(busyTimes).toHaveLength(2);
    expect(busyTimes[0].title).toBe("busy");
    expect(busyTimes[1].end).toBe(start.startOf("week").endOf("week").toISOString());
  });
});
