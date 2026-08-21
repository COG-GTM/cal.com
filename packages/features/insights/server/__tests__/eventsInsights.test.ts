import { readonlyPrisma } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventsInsights } from "../events";

vi.mock("@calcom/prisma", () => ({
  readonlyPrisma: {
    bookingTimeStatusDenormalized: {
      groupBy: vi.fn(),
    },
  },
}));

const groupByMock = vi.mocked(readonlyPrisma.bookingTimeStatusDenormalized.groupBy);

type GroupByRow = {
  timeStatus: string | null;
  noShowHost: boolean | null;
  _count: { _all: number } | null;
};

const mockGroupBy = (rows: GroupByRow[]) => {
  groupByMock.mockResolvedValue(rows as unknown as Awaited<ReturnType<typeof groupByMock>>);
};

describe("EventsInsights.countGroupedByStatus", () => {
  beforeEach(() => {
    groupByMock.mockReset();
  });

  it("groups by timeStatus and noShowHost using the passed where clause", async () => {
    mockGroupBy([]);

    const where = { teamId: 1 };
    await EventsInsights.countGroupedByStatus(where);

    expect(groupByMock).toHaveBeenCalledWith({
      where,
      by: ["timeStatus", "noShowHost"],
      _count: { _all: true },
    });
  });

  it("returns all-zero counters when there are no rows", async () => {
    mockGroupBy([]);

    await expect(EventsInsights.countGroupedByStatus({})).resolves.toEqual({
      completed: 0,
      rescheduled: 0,
      cancelled: 0,
      noShowHost: 0,
      _all: 0,
    });
  });

  it("aggregates per status and keeps a running total in _all", async () => {
    mockGroupBy([
      { timeStatus: "completed", noShowHost: false, _count: { _all: 3 } },
      { timeStatus: "completed", noShowHost: true, _count: { _all: 2 } },
      { timeStatus: "cancelled", noShowHost: false, _count: { _all: 4 } },
      { timeStatus: "rescheduled", noShowHost: null, _count: { _all: 1 } },
    ]);

    await expect(EventsInsights.countGroupedByStatus({})).resolves.toEqual({
      completed: 5,
      rescheduled: 1,
      cancelled: 4,
      noShowHost: 2,
      _all: 10,
    });
  });

  it("ignores rows without a timeStatus", async () => {
    mockGroupBy([
      { timeStatus: null, noShowHost: true, _count: { _all: 7 } },
      { timeStatus: "completed", noShowHost: false, _count: { _all: 1 } },
    ]);

    await expect(EventsInsights.countGroupedByStatus({})).resolves.toEqual({
      completed: 1,
      rescheduled: 0,
      cancelled: 0,
      noShowHost: 0,
      _all: 1,
    });
  });

  it("treats a missing _count as zero", async () => {
    mockGroupBy([{ timeStatus: "cancelled", noShowHost: false, _count: null }]);

    await expect(EventsInsights.countGroupedByStatus({})).resolves.toEqual({
      completed: 0,
      rescheduled: 0,
      cancelled: 0,
      noShowHost: 0,
      _all: 0,
    });
  });
});
