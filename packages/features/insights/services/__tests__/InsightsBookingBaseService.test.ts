import type { ColumnFilter } from "@calcom/features/data-table/lib/types";
import { ColumnFilterType } from "@calcom/features/data-table/lib/types";
import type { PrismaClient } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type {
  InsightsBookingServiceFilterOptions,
  InsightsBookingServicePublicOptions,
} from "../InsightsBookingBaseService";
import { buildHashMapForUsers, InsightsBookingBaseService } from "../InsightsBookingBaseService";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  findAllByParentId: vi.fn(),
  findByIdAndParentId: vi.fn(),
  findById: vi.fn(),
  findAllByTeamIds: vi.fn(),
  transformBookingsForCsv: vi.fn(),
}));

vi.mock("@calcom/features/pbac/services/permission-check.service", () => ({
  PermissionCheckService: class {
    checkPermission = mocks.checkPermission;
  },
}));

vi.mock("@calcom/features/ee/teams/repositories/TeamRepository", () => ({
  TeamRepository: class {
    findAllByParentId = mocks.findAllByParentId;
    findByIdAndParentId = mocks.findByIdAndParentId;
    findById = mocks.findById;
  },
}));

vi.mock("@calcom/features/membership/repositories/MembershipRepository", () => ({
  MembershipRepository: { findAllByTeamIds: mocks.findAllByTeamIds },
}));

vi.mock("../csvDataTransformer", () => ({
  transformBookingsForCsv: mocks.transformBookingsForCsv,
}));

const prismaMock = mockDeep<PrismaClient>();

const buildService = (
  options: InsightsBookingServicePublicOptions,
  filters?: InsightsBookingServiceFilterOptions
) => new InsightsBookingBaseService({ prisma: prismaMock, options, filters });

const userService = (filters?: InsightsBookingServiceFilterOptions) =>
  buildService({ scope: "user", userId: 1, orgId: null }, filters);

const dateRangeFilter = (startDate: string | null, endDate: string | null, id = "startTime"): ColumnFilter =>
  ({
    id,
    value: { type: ColumnFilterType.DATE_RANGE, data: { startDate, endDate, preset: "custom" } },
  }) as ColumnFilter;

const queryRawMock = () => vi.mocked(prismaMock.$queryRaw);

const lastQuery = (): Prisma.Sql => {
  const calls = queryRawMock().mock.calls;
  return calls[calls.length - 1][0] as unknown as Prisma.Sql;
};

const resolveQueryRaw = (...results: unknown[]) => {
  const mock = queryRawMock();
  mock.mockReset();
  results.forEach((result) => {
    mock.mockResolvedValueOnce(result);
  });
  return mock;
};

const dateRanges = [
  {
    startDate: "2024-01-01T00:00:00.000Z",
    endDate: "2024-01-01T23:59:59.999Z",
    formattedDate: "Jan 1",
    formattedDateFull: "Jan 1, 2024",
  },
  {
    startDate: "2024-01-02T00:00:00.000Z",
    endDate: "2024-01-02T23:59:59.999Z",
    formattedDate: "Jan 2",
    formattedDateFull: "Jan 2, 2024",
  },
];

beforeEach(() => {
  mockReset(prismaMock);
  mocks.checkPermission.mockReset();
  mocks.findAllByParentId.mockReset();
  mocks.findByIdAndParentId.mockReset();
  mocks.findById.mockReset();
  mocks.findAllByTeamIds.mockReset();
  mocks.transformBookingsForCsv.mockReset();
  mocks.checkPermission.mockResolvedValue(true);
  mocks.findAllByParentId.mockResolvedValue([]);
  mocks.findAllByTeamIds.mockResolvedValue([]);
});

describe("buildHashMapForUsers", () => {
  it("falls back to the username avatar endpoint when avatarUrl is missing", () => {
    const map = buildHashMapForUsers([
      { id: 1, username: "ada", avatarUrl: null },
      { id: 2, username: "grace", avatarUrl: "https://cdn/grace.png" },
    ]);

    expect(map.get(1)?.avatarUrl).toBe("/ada/avatar.png");
    expect(map.get(2)?.avatarUrl).toBe("https://cdn/grace.png");
  });
});

describe("InsightsBookingBaseService authorization", () => {
  it("returns a nothing-condition when the options fail validation", async () => {
    // org scope requires an orgId
    const service = buildService({ scope: "org", userId: 1, orgId: null });

    const conditions = await service.getAuthorizationConditions();

    expect(conditions.sql).toBe("1=0");
    expect((await service.getBaseConditions()).sql).toBe("(1=0)");
  });

  it("scopes personal insights to the user's own non-team bookings without a permission check", async () => {
    const conditions = await userService().getAuthorizationConditions();

    expect(conditions.sql).toContain('"userId" = ');
    expect(conditions.sql).toContain('"teamId" IS NULL');
    expect(conditions.values).toEqual([1]);
    expect(mocks.checkPermission).not.toHaveBeenCalled();
  });

  it("denies team insights when the user lacks the insights.read permission", async () => {
    mocks.checkPermission.mockResolvedValue(false);

    const conditions = await buildService({
      scope: "team",
      userId: 1,
      orgId: null,
      teamId: 5,
    }).getAuthorizationConditions();

    expect(conditions.sql).toBe("1=0");
    expect(mocks.checkPermission).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, teamId: 5, permission: "insights.read" })
    );
  });

  it("caches the authorization conditions so the permission check runs once", async () => {
    mocks.findById.mockResolvedValue({ id: 5, parentId: null });
    const service = buildService({ scope: "team", userId: 1, orgId: null, teamId: 5 });

    await service.getAuthorizationConditions();
    await service.getAuthorizationConditions();

    expect(mocks.checkPermission).toHaveBeenCalledTimes(1);
  });

  it("rejects a standalone team that actually belongs to an organization", async () => {
    mocks.findById.mockResolvedValue({ id: 5, parentId: 99 });

    const conditions = await buildService({
      scope: "team",
      userId: 1,
      orgId: null,
      teamId: 5,
    }).getAuthorizationConditions();

    expect(conditions.sql).toBe("1=0");
  });

  it("rejects a team whose organization does not match the requested orgId", async () => {
    mocks.findByIdAndParentId.mockResolvedValue(null);

    const conditions = await buildService({
      scope: "team",
      userId: 1,
      orgId: 10,
      teamId: 5,
    }).getAuthorizationConditions();

    expect(mocks.findByIdAndParentId).toHaveBeenCalledWith(expect.objectContaining({ id: 5, parentId: 10 }));
    expect(conditions.sql).toBe("1=0");
  });

  it("includes both team bookings and personal bookings of team members", async () => {
    mocks.findByIdAndParentId.mockResolvedValue({ id: 5 });
    mocks.findAllByTeamIds.mockResolvedValue([{ userId: 3 }, { userId: 4 }]);

    const conditions = await buildService({
      scope: "team",
      userId: 1,
      orgId: 10,
      teamId: 5,
    }).getAuthorizationConditions();

    expect(mocks.findAllByTeamIds).toHaveBeenCalledWith({ teamIds: [5], select: { userId: true } });
    expect(conditions.sql).toContain('"isTeamBooking" = true');
    expect(conditions.sql).toContain('"isTeamBooking" = false');
    expect(conditions.values).toEqual([5, [3, 4]]);
  });

  it("omits the personal-bookings branch for a team without members", async () => {
    mocks.findById.mockResolvedValue({ id: 5, parentId: null });
    mocks.findAllByTeamIds.mockResolvedValue([]);

    const conditions = await buildService({
      scope: "team",
      userId: 1,
      orgId: null,
      teamId: 5,
    }).getAuthorizationConditions();

    expect(conditions.sql).toContain('"isTeamBooking" = true');
    expect(conditions.sql).not.toContain('"isTeamBooking" = false');
  });

  it("expands an organization into its teams and de-duplicates member ids", async () => {
    mocks.findAllByParentId.mockResolvedValue([{ id: 30 }, { id: 20 }]);
    mocks.findAllByTeamIds.mockResolvedValue([{ userId: 7 }, { userId: 3 }, { userId: 7 }]);

    const conditions = await buildService({
      scope: "org",
      userId: 1,
      orgId: 10,
    }).getAuthorizationConditions();

    expect(mocks.findAllByTeamIds).toHaveBeenCalledWith({
      teamIds: [10, 20, 30],
      select: { userId: true },
    });
    expect(conditions.values).toEqual([
      [10, 20, 30],
      [3, 7],
    ]);
  });

  it("skips the member lookup for an organization without child teams", async () => {
    mocks.findAllByParentId.mockResolvedValue([]);

    const conditions = await buildService({
      scope: "org",
      userId: 1,
      orgId: 10,
    }).getAuthorizationConditions();

    expect(mocks.findAllByTeamIds).not.toHaveBeenCalled();
    expect(conditions.values).toEqual([[10]]);
    expect(conditions.sql).not.toContain('"isTeamBooking" = false');
  });
});

describe("InsightsBookingBaseService filter conditions", () => {
  it("returns null filter conditions when the filters fail validation", async () => {
    const service = new InsightsBookingBaseService({
      prisma: prismaMock,
      options: { scope: "user", userId: 1, orgId: null },
      // an unparseable filter shape disables filtering entirely
      filters: { columnFilters: [{ id: "status" }] } as unknown as InsightsBookingServiceFilterOptions,
    });

    await expect(service.getFilterConditions()).resolves.toBeNull();
  });

  it("returns null when there are no column filters", async () => {
    await expect(userService({ columnFilters: [] }).getFilterConditions()).resolves.toBeNull();
  });

  it("matches event type id against both the event type and its parent", async () => {
    const conditions = await userService({
      columnFilters: [{ id: "eventTypeId", value: { type: ColumnFilterType.MULTI_SELECT, data: [1, "2"] } }],
    }).getFilterConditions();

    expect(conditions?.sql).toContain('"eventTypeId" IN');
    expect(conditions?.sql).toContain('"eventParentId" IN');
    expect(conditions?.values).toEqual([1, 2, 1, 2]);
  });

  it("ignores an empty event type id filter", async () => {
    await expect(
      userService({
        columnFilters: [{ id: "eventTypeId", value: { type: ColumnFilterType.MULTI_SELECT, data: [] } }],
      }).getFilterConditions()
    ).resolves.toBeNull();
  });

  it("filters by member, status and paid flag", async () => {
    const conditions = await userService({
      columnFilters: [
        { id: "userId", value: { type: ColumnFilterType.SINGLE_SELECT, data: 9 } },
        { id: "status", value: { type: ColumnFilterType.MULTI_SELECT, data: ["accepted", "cancelled"] } },
        { id: "paid", value: { type: ColumnFilterType.SINGLE_SELECT, data: "true" } },
      ],
    }).getFilterConditions();

    expect(conditions?.sql).toContain('"userId" = ');
    expect(conditions?.sql).toContain('"status" IN');
    expect(conditions?.sql).toContain('"paid" = ');
    expect(conditions?.values).toEqual([9, "accepted", "cancelled", true]);
  });

  it('maps a non-"true" paid value to false', async () => {
    const conditions = await userService({
      columnFilters: [{ id: "paid", value: { type: ColumnFilterType.SINGLE_SELECT, data: "false" } }],
    }).getFilterConditions();

    expect(conditions?.values).toEqual([false]);
  });

  it("ignores a userId filter whose value is not numeric", async () => {
    await expect(
      userService({
        columnFilters: [{ id: "userId", value: { type: ColumnFilterType.SINGLE_SELECT, data: "9" } }],
      }).getFilterConditions()
    ).resolves.toBeNull();
  });

  it("builds text and number conditions for email, name and rating", async () => {
    const conditions = await userService({
      columnFilters: [
        {
          id: "userEmail",
          value: { type: ColumnFilterType.TEXT, data: { operator: "contains", operand: "example" } },
        },
        {
          id: "userName",
          value: { type: ColumnFilterType.TEXT, data: { operator: "equals", operand: "Ada" } },
        },
        { id: "rating", value: { type: ColumnFilterType.NUMBER, data: { operator: "gte", operand: 4 } } },
      ],
    }).getFilterConditions();

    expect(conditions?.sql).toContain('"userEmail"');
    expect(conditions?.sql).toContain('"userName"');
    expect(conditions?.sql).toContain('"rating"');
    expect(conditions?.values).toEqual(["%example%", "Ada", 4]);
  });

  it("builds a startTime range using startTime and endTime columns", async () => {
    const conditions = await userService({
      columnFilters: [dateRangeFilter("2024-01-01T00:00:00.000Z", "2024-01-31T00:00:00.000Z")],
    }).getFilterConditions();

    expect(conditions?.sql).toContain('<= "startTime"');
    expect(conditions?.sql).toContain('"endTime" <=');
  });

  it("builds a createdAt range against the createdAt column only", async () => {
    const conditions = await userService({
      columnFilters: [dateRangeFilter("2024-01-01T00:00:00.000Z", "2024-01-31T00:00:00.000Z", "createdAt")],
    }).getFilterConditions();

    expect(conditions?.sql).toContain('<= "createdAt"');
    expect(conditions?.sql).toContain('"createdAt" <=');
    expect(conditions?.sql).not.toContain('"startTime"');
  });

  it("accepts an open-ended range", async () => {
    const startOnly = await userService({
      columnFilters: [dateRangeFilter("2024-01-01T00:00:00.000Z", null)],
    }).getFilterConditions();
    const endOnly = await userService({
      columnFilters: [dateRangeFilter(null, "2024-01-31T00:00:00.000Z", "createdAt")],
    }).getFilterConditions();

    expect(startOnly?.values).toEqual(["2024-01-01T00:00:00.000Z"]);
    expect(endOnly?.values).toEqual(["2024-01-31T00:00:00.000Z"]);
  });

  it("ignores a range with neither bound", async () => {
    await expect(
      userService({ columnFilters: [dateRangeFilter(null, null)] }).getFilterConditions()
    ).resolves.toBeNull();
  });

  it.each([
    ["start", "not-a-date", "2024-01-31T00:00:00.000Z"],
    ["end", "2024-01-01T00:00:00.000Z", "also-not-a-date"],
  ])("throws on an invalid %s date", async (_label, startDate, endDate) => {
    await expect(
      userService({ columnFilters: [dateRangeFilter(startDate, endDate)] }).getFilterConditions()
    ).rejects.toThrow(/Invalid date format/);
  });

  it("ignores unknown columns and empty values", async () => {
    await expect(
      userService({
        columnFilters: [
          { id: "unknownColumn", value: { type: ColumnFilterType.SINGLE_SELECT, data: 1 } },
          { id: "status", value: undefined } as unknown as ColumnFilter,
        ],
      }).getFilterConditions()
    ).resolves.toBeNull();
  });

  it("combines authorization and filter conditions with AND", async () => {
    const service = userService({
      columnFilters: [{ id: "paid", value: { type: ColumnFilterType.SINGLE_SELECT, data: "true" } }],
    });

    const conditions = await service.getBaseConditions();

    expect(conditions.sql).toContain("AND");
    expect(conditions.sql).toContain('"paid"');
    expect(conditions.sql).toContain('"userId"');
  });

  it("caches filter conditions between calls", async () => {
    const service = userService({ columnFilters: [] });

    const first = await service.getFilterConditions();
    const second = await service.getFilterConditions();

    expect(first).toBe(second);
  });
});

describe("InsightsBookingBaseService.getBookingsByHourStats", () => {
  it("returns all 24 hours filling gaps with zero and passes the timezone through", async () => {
    resolveQueryRaw([
      { hour: "9", count: 3 },
      { hour: "17", count: 1 },
    ]);

    const stats = await userService().getBookingsByHourStats({ timeZone: "Asia/Tokyo" });

    expect(stats).toHaveLength(24);
    expect(stats[0]).toEqual({ hour: 0, count: 0 });
    expect(stats[9]).toEqual({ hour: 9, count: 3 });
    expect(stats[17]).toEqual({ hour: 17, count: 1 });
    expect(lastQuery().values).toContain("Asia/Tokyo");
  });

  it("returns 24 zeroed hours when there are no bookings", async () => {
    resolveQueryRaw([]);

    const stats = await userService().getBookingsByHourStats({ timeZone: "UTC" });

    expect(stats.every((entry) => entry.count === 0)).toBe(true);
  });
});

describe("InsightsBookingBaseService.findAll", () => {
  it("selects every column when no select is given", async () => {
    resolveQueryRaw([]);

    await userService().findAll();

    expect(lastQuery().sql).toContain("SELECT *");
  });

  it("selects only the requested columns", async () => {
    resolveQueryRaw([]);

    await userService().findAll({ select: { id: true, uid: true } });

    expect(lastQuery().sql).toContain('"id", "uid"');
  });

  it("rejects select keys that are not part of the denormalized booking view", async () => {
    resolveQueryRaw([]);

    await expect(userService().findAll({ select: { id: true, notAColumn: true } as never })).rejects.toThrow(
      "Invalid select keys provided"
    );
  });
});

describe("InsightsBookingBaseService.getCsvData", () => {
  const csvRow = {
    id: 1,
    uid: "uid-1",
    title: "Booking",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    timeStatus: "completed",
    eventTypeId: 2,
    eventLength: 30,
    startTime: new Date("2024-01-02T10:00:00.000Z"),
    endTime: new Date("2024-01-02T10:30:00.000Z"),
    paid: false,
    userEmail: "ada@example.com",
    userUsername: "ada",
    rating: 5,
    ratingFeedback: "great",
    noShowHost: false,
  };

  it("applies the default limit and offset", async () => {
    resolveQueryRaw([{ count: 0 }], []);

    const result = await userService().getCsvData({ timeZone: "UTC" });

    expect(result).toEqual({ data: [], total: 0 });
    const values = lastQuery().values;
    expect(values).toContain(100);
    expect(values).toContain(0);
  });

  it("passes an explicit limit and offset into the query", async () => {
    resolveQueryRaw([{ count: 5 }], []);

    await userService().getCsvData({ limit: 20, offset: 40, timeZone: "UTC" });

    const values = lastQuery().values;
    expect(values).toContain(20);
    expect(values).toContain(40);
  });

  it("returns rows untransformed when none of them has a uid", async () => {
    resolveQueryRaw([{ count: 1 }], [{ ...csvRow, uid: null }]);

    const result = await userService().getCsvData({ timeZone: "UTC" });

    expect(result.total).toBe(1);
    expect(mocks.transformBookingsForCsv).not.toHaveBeenCalled();
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("transforms the rows together with their bookings", async () => {
    resolveQueryRaw([{ count: 1 }], [csvRow]);
    const bookings = [{ uid: "uid-1" }];
    vi.mocked(prismaMock.booking.findMany).mockResolvedValue(bookings as never);
    mocks.transformBookingsForCsv.mockReturnValue([{ transformed: true }]);

    const result = await userService().getCsvData({ timeZone: "Asia/Tokyo" });

    expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uid: { in: ["uid-1"] } } })
    );
    expect(mocks.transformBookingsForCsv).toHaveBeenCalledWith([csvRow], bookings, "Asia/Tokyo");
    expect(result).toEqual({ data: [{ transformed: true }], total: 1 });
  });

  it("treats a missing count row as zero", async () => {
    resolveQueryRaw([], []);

    await expect(userService().getCsvData({ timeZone: "UTC" })).resolves.toEqual({ data: [], total: 0 });
  });
});

describe("InsightsBookingBaseService.getEventTrendsStats", () => {
  it("returns an empty array when there are no date ranges", async () => {
    const result = await userService().getEventTrendsStats({ timeZone: "UTC", dateRanges: [] });

    expect(result).toEqual([]);
    expect(queryRawMock()).not.toHaveBeenCalled();
  });

  it("aggregates counts per range including no-show hosts and guests", async () => {
    resolveQueryRaw([
      {
        date: new Date("2024-01-01T05:00:00.000Z"),
        bookingsCount: 2,
        timeStatus: "completed",
        noShowHost: true,
        noShowGuests: 1,
      },
      {
        date: new Date("2024-01-02T05:00:00.000Z"),
        bookingsCount: 3,
        timeStatus: "cancelled",
        noShowHost: false,
        noShowGuests: 0,
      },
      {
        date: new Date("2023-12-01T05:00:00.000Z"),
        bookingsCount: 9,
        timeStatus: "completed",
        noShowHost: false,
        noShowGuests: 0,
      },
    ]);

    const result = await userService().getEventTrendsStats({ timeZone: "UTC", dateRanges });

    expect(result[0]).toEqual({
      formattedDateFull: "Jan 1, 2024",
      Month: "Jan 1",
      Created: 2,
      Completed: 2,
      Rescheduled: 0,
      Cancelled: 0,
      "No-Show (Host)": 2,
      "No-Show (Guest)": 1,
    });
    expect(result[1]).toMatchObject({ Created: 3, Cancelled: 3, "No-Show (Host)": 0 });
  });

  it("ignores rows with an unknown time status while still counting them in the total", async () => {
    resolveQueryRaw([
      {
        date: new Date("2024-01-01T05:00:00.000Z"),
        bookingsCount: 4,
        timeStatus: "pending",
        noShowHost: false,
        noShowGuests: 0,
      },
    ]);

    const result = await userService().getEventTrendsStats({ timeZone: "UTC", dateRanges });

    expect(result[0]).toMatchObject({ Created: 4, Completed: 0, Cancelled: 0 });
  });
});

describe("InsightsBookingBaseService.getPopularEventsStats", () => {
  it("returns an empty array when no bookings have an event type", async () => {
    resolveQueryRaw([]);

    await expect(userService().getPopularEventsStats()).resolves.toEqual([]);
    expect(prismaMock.eventType.findMany).not.toHaveBeenCalled();
  });

  it("builds the slug from the team when the event type belongs to a team", async () => {
    resolveQueryRaw([{ eventTypeId: 1, count: 4 }]);
    vi.mocked(prismaMock.eventType.findMany).mockResolvedValue([
      { id: 1, title: "T", slug: "intro", userId: null, teamId: 3, users: [], team: { slug: "acme" } },
    ] as never);

    await expect(userService().getPopularEventsStats()).resolves.toEqual([
      { eventTypeId: 1, eventTypeName: "acme/intro", count: 4 },
    ]);
  });

  it("builds the slug from the owner for a personal event type", async () => {
    resolveQueryRaw([{ eventTypeId: 1, count: 2 }]);
    vi.mocked(prismaMock.eventType.findMany).mockResolvedValue([
      {
        id: 1,
        title: "T",
        slug: "intro",
        userId: 7,
        teamId: null,
        users: [{ username: "ada" }],
        team: null,
      },
    ] as never);

    await expect(userService().getPopularEventsStats()).resolves.toEqual([
      { eventTypeId: 1, eventTypeName: "ada/intro", count: 2 },
    ]);
  });

  it("drops bookings whose event type could not be loaded", async () => {
    resolveQueryRaw([
      { eventTypeId: 1, count: 2 },
      { eventTypeId: 2, count: 1 },
    ]);
    vi.mocked(prismaMock.eventType.findMany).mockResolvedValue([
      { id: 2, title: "T", slug: "s", userId: null, teamId: null, users: [], team: null },
    ] as never);

    const result = await userService().getPopularEventsStats();

    expect(result).toEqual([{ eventTypeId: 2, eventTypeName: "", count: 1 }]);
  });
});

describe("InsightsBookingBaseService.getMembersStatsWithCount", () => {
  const users = [{ id: 3, name: "Ada", email: "ada@example.com", username: "ada", avatarUrl: null }];

  it("returns an empty array when nobody has bookings", async () => {
    resolveQueryRaw([]);

    await expect(userService().getMembersStatsWithCount()).resolves.toEqual([]);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("hashes the member email and resolves the avatar fallback", async () => {
    resolveQueryRaw([{ userId: 3, count: 6 }]);
    vi.mocked(prismaMock.user.findMany).mockResolvedValue(users as never);

    const result = await userService().getMembersStatsWithCount();

    expect(result[0]).toMatchObject({ userId: 3, count: 6 });
    expect(result[0].emailMd5).toMatch(/^[a-f0-9]{32}$/);
    expect(result[0].user.avatarUrl).toBe("/ada/avatar.png");
  });

  it.each([
    ["cancelled", "status = 'cancelled'"],
    ["noShow", '"noShowHost" = true'],
    ["accepted", "status = 'accepted'"],
  ] as const)("adds the %s condition", async (type, expected) => {
    resolveQueryRaw([]);

    await userService().getMembersStatsWithCount({ type });

    expect(lastQuery().sql).toContain(expected);
  });

  it("adds an end-time condition when only completed bookings are requested", async () => {
    resolveQueryRaw([]);

    await userService().getMembersStatsWithCount({ type: "all", completed: true });

    expect(lastQuery().sql).toContain('"endTime" <= NOW()');
  });

  it("respects the requested sort order", async () => {
    resolveQueryRaw([]);
    await userService().getMembersStatsWithCount({ sortOrder: "ASC" });
    expect(lastQuery().sql).toContain("ORDER BY count ASC");

    resolveQueryRaw([]);
    await userService().getMembersStatsWithCount({ sortOrder: "DESC" });
    expect(lastQuery().sql).toContain("ORDER BY count DESC");
  });

  it("drops rows whose user cannot be loaded", async () => {
    resolveQueryRaw([{ userId: 99, count: 1 }]);
    vi.mocked(prismaMock.user.findMany).mockResolvedValue([] as never);

    await expect(userService().getMembersStatsWithCount()).resolves.toEqual([]);
  });
});

describe("InsightsBookingBaseService.getMembersRatingStats", () => {
  it("returns an empty array when nobody has ratings", async () => {
    resolveQueryRaw([]);

    await expect(userService().getMembersRatingStats()).resolves.toEqual([]);
  });

  it("sorts ascending when requested and returns the average rating as the count", async () => {
    resolveQueryRaw([{ userId: 3, count: 4.5 }]);
    vi.mocked(prismaMock.user.findMany).mockResolvedValue([
      { id: 3, name: "Ada", email: "ada@example.com", username: "ada", avatarUrl: null },
    ] as never);

    const result = await userService().getMembersRatingStats("ASC");

    expect(lastQuery().sql).toContain('ORDER BY "count" ASC');
    expect(result[0]).toMatchObject({ userId: 3, count: 4.5 });
  });

  it("drops rows whose user cannot be loaded", async () => {
    resolveQueryRaw([{ userId: 3, count: 4.5 }]);
    vi.mocked(prismaMock.user.findMany).mockResolvedValue([] as never);

    await expect(userService().getMembersRatingStats()).resolves.toEqual([]);
  });
});

describe("InsightsBookingBaseService.getRecentRatingsStats", () => {
  it("returns an empty array when there is no feedback", async () => {
    resolveQueryRaw([]);

    await expect(userService().getRecentRatingsStats()).resolves.toEqual([]);
  });

  it("returns an empty array when every rating is unassigned", async () => {
    resolveQueryRaw([{ userId: null, rating: 4, ratingFeedback: "ok" }]);

    await expect(userService().getRecentRatingsStats()).resolves.toEqual([]);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("de-duplicates user ids and keeps the feedback of each rating", async () => {
    resolveQueryRaw([
      { userId: 3, rating: 5, ratingFeedback: "great" },
      { userId: 3, rating: 2, ratingFeedback: "meh" },
      { userId: null, rating: 1, ratingFeedback: "anonymous" },
      { userId: 4, rating: 3, ratingFeedback: "unknown user" },
    ]);
    vi.mocked(prismaMock.user.findMany).mockResolvedValue([
      { id: 3, name: "Ada", email: "ada@example.com", username: "ada", avatarUrl: null },
    ] as never);

    const result = await userService().getRecentRatingsStats();

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [3, 4] } } })
    );
    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.feedback)).toEqual(["great", "meh"]);
  });
});

describe("InsightsBookingBaseService.getBookingStats", () => {
  it("converts bigint counters to numbers", async () => {
    resolveQueryRaw([
      {
        total_bookings: 10n,
        completed_bookings: 4n,
        rescheduled_bookings: 2n,
        cancelled_bookings: 1n,
        no_show_host_bookings: 3n,
        avg_rating: 4.5,
        total_ratings: 5n,
        ratings_above_3: 4n,
        no_show_guests: 2n,
      },
    ]);

    await expect(userService().getBookingStats()).resolves.toEqual({
      total_bookings: 10,
      completed_bookings: 4,
      rescheduled_bookings: 2,
      cancelled_bookings: 1,
      no_show_host_bookings: 3,
      avg_rating: 4.5,
      total_ratings: 5,
      ratings_above_3: 4,
      no_show_guests: 2,
    });
  });

  it("falls back to zeroed stats when the query returns no row", async () => {
    resolveQueryRaw([]);

    const stats = await userService().getBookingStats();

    expect(Object.values(stats).every((value) => value === 0)).toBe(true);
  });
});

describe("InsightsBookingBaseService.getRecentNoShowGuests", () => {
  it("returns the rows as provided by the query", async () => {
    const rows = [
      {
        bookingId: 1,
        startTime: new Date("2024-01-01T00:00:00.000Z"),
        eventTypeName: "Intro",
        guestName: "Ada",
        guestEmail: "ada@example.com",
      },
    ];
    resolveQueryRaw(rows);

    await expect(userService().getRecentNoShowGuests()).resolves.toEqual(rows);
  });
});

describe("InsightsBookingBaseService.calculatePreviousPeriodDates", () => {
  it("shifts the range backwards by its own length", () => {
    const service = userService({
      columnFilters: [dateRangeFilter("2024-01-11T00:00:00.000Z", "2024-01-21T00:00:00.000Z")],
    });

    const result = service.calculatePreviousPeriodDates();

    expect(result.formattedStartDate).toBe("2024-01-01");
    expect(result.formattedEndDate).toBe("2024-01-11");
    expect(result.startDate).toBe("2024-01-01T00:00:00.000Z");
  });

  it("throws when no date range filter is present", () => {
    expect(() => userService({ columnFilters: [] }).calculatePreviousPeriodDates()).toThrow(
      "No date range filter found"
    );
  });
});

describe("InsightsBookingBaseService.getNoShowHostsOverTimeStats", () => {
  it("returns an empty array without querying when there are no date ranges", async () => {
    await expect(
      userService().getNoShowHostsOverTimeStats({ timeZone: "UTC", dateRanges: [] })
    ).resolves.toEqual([]);
  });

  it("buckets counts into the matching date range and ignores the rest", async () => {
    resolveQueryRaw([
      { date: new Date("2024-01-01T10:00:00.000Z"), count: 2 },
      { date: new Date("2024-01-02T10:00:00.000Z"), count: 1 },
      { date: new Date("2025-06-01T10:00:00.000Z"), count: 8 },
    ]);

    const result = await userService().getNoShowHostsOverTimeStats({
      timeZone: "America/New_York",
      dateRanges,
    });

    expect(result).toEqual([
      { formattedDateFull: "Jan 1, 2024", Month: "Jan 1", Count: 2 },
      { formattedDateFull: "Jan 2, 2024", Month: "Jan 2", Count: 1 },
    ]);
    expect(lastQuery().values).toContain("America/New_York");
  });
});

describe("InsightsBookingBaseService.getCSATOverTimeStats", () => {
  it("returns an empty array when there are no date ranges", async () => {
    await expect(userService().getCSATOverTimeStats({ timeZone: "UTC", dateRanges: [] })).resolves.toEqual(
      []
    );
  });

  it("computes the CSAT percentage per range and rounds to one decimal", async () => {
    resolveQueryRaw([
      { date: new Date("2024-01-01T10:00:00.000Z"), ratings_above_3: 2, total_ratings: 3 },
      { date: new Date("2025-01-01T10:00:00.000Z"), ratings_above_3: 5, total_ratings: 5 },
    ]);

    const result = await userService().getCSATOverTimeStats({ timeZone: "UTC", dateRanges });

    expect(result[0].CSAT).toBe(66.7);
    // the second range received no ratings, so CSAT stays at 0 instead of dividing by zero
    expect(result[1].CSAT).toBe(0);
  });
});
