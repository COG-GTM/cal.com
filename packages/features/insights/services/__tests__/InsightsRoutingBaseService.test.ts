import { ColumnFilterType } from "@calcom/features/data-table/lib/types";
import type { PrismaClient } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type {
  InsightsRoutingServiceFilterOptions,
  InsightsRoutingServicePublicOptions,
} from "../InsightsRoutingBaseService";
import { InsightsRoutingBaseService } from "../InsightsRoutingBaseService";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  findAllByParentId: vi.fn(),
  findByIdAndParentId: vi.fn(),
  findById: vi.fn(),
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

const prismaMock = mockDeep<PrismaClient>();

const defaultFilters: InsightsRoutingServiceFilterOptions = {
  startDate: "2024-01-01T00:00:00.000Z",
  endDate: "2024-01-31T23:59:59.999Z",
};

const buildService = (
  options: InsightsRoutingServicePublicOptions,
  filters: InsightsRoutingServiceFilterOptions = defaultFilters
) => new InsightsRoutingBaseService({ prisma: prismaMock, options, filters });

const userService = (filters?: InsightsRoutingServiceFilterOptions) =>
  buildService({ scope: "user", userId: 1, orgId: null }, filters);

const columnFilter = (id: string, value: unknown) =>
  ({ id, value }) as InsightsRoutingServiceFilterOptions["columnFilters"] extends (infer T)[] | undefined
    ? T
    : never;

const queryRawMock = () => vi.mocked(prismaMock.$queryRaw);

const queryAt = (index: number): Prisma.Sql => queryRawMock().mock.calls[index][0] as unknown as Prisma.Sql;

const lastQuery = (): Prisma.Sql => queryAt(queryRawMock().mock.calls.length - 1);

const resolveQueryRaw = (...results: unknown[]) => {
  const mock = queryRawMock();
  mock.mockReset();
  results.forEach((result) => {
    mock.mockResolvedValueOnce(result);
  });
  mock.mockResolvedValue([]);
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
  mocks.checkPermission.mockResolvedValue(true);
  mocks.findAllByParentId.mockResolvedValue([]);
});

describe("InsightsRoutingBaseService authorization", () => {
  it("returns a nothing-condition when the options fail validation", async () => {
    const service = buildService({ scope: "team", userId: 1, orgId: null });

    expect((await service.getAuthorizationConditions()).sql).toBe("1=0");
  });

  it("scopes to personal forms for the user scope", async () => {
    const conditions = await userService().getAuthorizationConditions();

    expect(conditions.sql).toContain('rfrd."formUserId" = ');
    expect(conditions.sql).toContain('rfrd."formTeamId" IS NULL');
    expect(mocks.checkPermission).not.toHaveBeenCalled();
  });

  it("includes the org and all its teams plus the user's personal forms", async () => {
    mocks.findAllByParentId.mockResolvedValue([{ id: 20 }, { id: 21 }]);

    const conditions = await buildService({
      scope: "org",
      userId: 1,
      orgId: 10,
    }).getAuthorizationConditions();

    expect(conditions.values).toEqual([[10, 20, 21], 1]);
    expect(conditions.sql).toContain('rfrd."formTeamId" = ANY(');
  });

  it("denies access when the permission check fails", async () => {
    mocks.checkPermission.mockResolvedValue(false);

    const conditions = await buildService({
      scope: "org",
      userId: 1,
      orgId: 10,
    }).getAuthorizationConditions();

    expect(conditions.sql).toBe("1=0");
    expect(mocks.findAllByParentId).not.toHaveBeenCalled();
  });

  it("restricts a team scope to the team's forms", async () => {
    mocks.findByIdAndParentId.mockResolvedValue({ id: 5 });

    const conditions = await buildService({
      scope: "team",
      userId: 1,
      orgId: 10,
      teamId: 5,
    }).getAuthorizationConditions();

    expect(conditions.sql).toContain('rfrd."formTeamId" = ');
    expect(conditions.values).toEqual([5]);
  });

  it("rejects a team that is not a child of the given organization", async () => {
    mocks.findByIdAndParentId.mockResolvedValue(null);

    const conditions = await buildService({
      scope: "team",
      userId: 1,
      orgId: 10,
      teamId: 5,
    }).getAuthorizationConditions();

    expect(conditions.sql).toBe("1=0");
  });

  it("rejects a standalone team that has a parent", async () => {
    mocks.findById.mockResolvedValue({ id: 5, parentId: 10 });

    const conditions = await buildService({
      scope: "team",
      userId: 1,
      orgId: null,
      teamId: 5,
    }).getAuthorizationConditions();

    expect(conditions.sql).toBe("1=0");
    expect(mocks.findByIdAndParentId).not.toHaveBeenCalled();
  });

  it("accepts a standalone team without a parent", async () => {
    mocks.findById.mockResolvedValue({ id: 5, parentId: null });

    const conditions = await buildService({
      scope: "team",
      userId: 1,
      orgId: null,
      teamId: 5,
    }).getAuthorizationConditions();

    expect(conditions.values).toEqual([5]);
  });
});

describe("InsightsRoutingBaseService filter conditions", () => {
  it("always filters on the createdAt range", async () => {
    const conditions = await userService().getFilterConditions();

    expect(conditions?.sql).toContain('rfrd."createdAt" >=');
    expect(conditions?.values).toEqual([defaultFilters.startDate, defaultFilters.endDate]);
  });

  it("can exclude the createdAt range", async () => {
    await expect(userService().getFilterConditions({ exclude: { createdAt: true } })).resolves.toBeNull();
  });

  it("can exclude specific column filters by id", async () => {
    const service = userService({
      ...defaultFilters,
      columnFilters: [
        columnFilter("bookingStatusOrder", { type: ColumnFilterType.MULTI_SELECT, data: ["1", "2"] }),
      ],
    });

    const conditions = await service.getFilterConditions({
      exclude: { createdAt: true, columnFilterIds: ["bookingStatusOrder"] },
    });

    expect(conditions).toBeNull();
  });

  it("converts booking status order and member ids to integers", async () => {
    const conditions = await userService({
      ...defaultFilters,
      columnFilters: [
        columnFilter("bookingStatusOrder", { type: ColumnFilterType.MULTI_SELECT, data: ["1", "2"] }),
        columnFilter("bookingUserId", { type: ColumnFilterType.MULTI_SELECT, data: ["7"] }),
      ],
    }).getFilterConditions({ exclude: { createdAt: true } });

    expect(conditions?.sql).toContain('rfrd."bookingStatusOrder"');
    expect(conditions?.sql).toContain('rfrd."bookingUserId"');
    expect(conditions?.values).toEqual([[1, 2], [7]]);
  });

  it("builds text conditions for assignment reason, booking uid and form id", async () => {
    const conditions = await userService({
      ...defaultFilters,
      columnFilters: [
        columnFilter("bookingAssignmentReason", {
          type: ColumnFilterType.TEXT,
          data: { operator: "contains", operand: "round" },
        }),
        columnFilter("bookingUid", {
          type: ColumnFilterType.TEXT,
          data: { operator: "equals", operand: "uid-1" },
        }),
        columnFilter("formId", { type: ColumnFilterType.SINGLE_SELECT, data: "form-1" }),
      ],
    }).getFilterConditions({ exclude: { createdAt: true } });

    expect(conditions?.sql).toContain('rfrd."bookingAssignmentReason"');
    expect(conditions?.sql).toContain('rfrd."bookingUid"');
    expect(conditions?.sql).toContain('rfrd."formId"');
    expect(conditions?.values).toEqual(["%round%", "uid-1", "form-1"]);
  });

  it.each([
    ["attendeeName", "a.name"],
    ["attendeeEmail", "a.email"],
    ["attendeePhone", 'a."phoneNumber"'],
  ])("builds an attendee subquery for %s", async (filterId, expectedColumn) => {
    const conditions = await userService({
      ...defaultFilters,
      columnFilters: [
        columnFilter(filterId, {
          type: ColumnFilterType.TEXT,
          data: { operator: "contains", operand: "ada" },
        }),
      ],
    }).getFilterConditions({ exclude: { createdAt: true } });

    expect(conditions?.sql).toContain('FROM "Booking" b');
    expect(conditions?.sql).toContain(expectedColumn);
  });

  it("ignores an attendee filter whose text condition cannot be built", async () => {
    await expect(
      userService({
        ...defaultFilters,
        columnFilters: [
          columnFilter("attendeeName", {
            type: ColumnFilterType.TEXT,
            data: { operator: "isEmpty", operand: "" },
          }),
        ],
      }).getFilterConditions({ exclude: { createdAt: true } })
    ).resolves.not.toBeNull();
  });

  it.each([
    ["multi-select", { type: ColumnFilterType.MULTI_SELECT, data: ["opt-a"] }, 'rrf."valueStringArray" @>'],
    ["single-select", { type: ColumnFilterType.SINGLE_SELECT, data: "opt-a" }, 'rrf."valueString" ='],
    [
      "text",
      { type: ColumnFilterType.TEXT, data: { operator: "contains", operand: "x" } },
      'rrf."valueString"',
    ],
    ["number", { type: ColumnFilterType.NUMBER, data: { operator: "gt", operand: 2 } }, 'rrf."valueNumber"'],
  ])("builds a form field condition for a %s field filter", async (_label, value, expectedSql) => {
    const fieldId = "0a4b3d1e-31a4-4d67-9a24-0a6f4b6a35a4";

    const conditions = await userService({
      ...defaultFilters,
      columnFilters: [columnFilter(fieldId, value)],
    }).getFilterConditions({ exclude: { createdAt: true } });

    expect(conditions?.sql).toContain('FROM "RoutingFormResponseField" rrf');
    expect(conditions?.sql).toContain(expectedSql);
  });

  it("combines multiple form field filters with AND", async () => {
    const conditions = await userService({
      ...defaultFilters,
      columnFilters: [
        columnFilter("0a4b3d1e-31a4-4d67-9a24-0a6f4b6a35a4", {
          type: ColumnFilterType.SINGLE_SELECT,
          data: "opt-a",
        }),
        columnFilter("1b4b3d1e-31a4-4d67-9a24-0a6f4b6a35a5", {
          type: ColumnFilterType.SINGLE_SELECT,
          data: "opt-b",
        }),
      ],
    }).getFilterConditions({ exclude: { createdAt: true } });

    expect(conditions?.values).toEqual([
      "0a4b3d1e-31a4-4d67-9a24-0a6f4b6a35a4",
      "opt-a",
      "1b4b3d1e-31a4-4d67-9a24-0a6f4b6a35a5",
      "opt-b",
    ]);
  });

  it("ignores a form field filter whose value type is not supported", async () => {
    await expect(
      userService({
        ...defaultFilters,
        columnFilters: [
          columnFilter("0a4b3d1e-31a4-4d67-9a24-0a6f4b6a35a4", {
            type: ColumnFilterType.DATE_RANGE,
            data: { startDate: "2024-01-01", endDate: "2024-01-02", preset: "custom" },
          }),
        ],
      }).getFilterConditions({ exclude: { createdAt: true } })
    ).resolves.toBeNull();
  });

  it("combines the createdAt range with column and form field filters", async () => {
    const conditions = await userService({
      ...defaultFilters,
      columnFilters: [
        columnFilter("formId", { type: ColumnFilterType.SINGLE_SELECT, data: "form-1" }),
        columnFilter("0a4b3d1e-31a4-4d67-9a24-0a6f4b6a35a4", {
          type: ColumnFilterType.SINGLE_SELECT,
          data: "opt-a",
        }),
      ],
    }).getFilterConditions();

    expect(conditions?.values).toEqual([
      defaultFilters.startDate,
      defaultFilters.endDate,
      "form-1",
      "0a4b3d1e-31a4-4d67-9a24-0a6f4b6a35a4",
      "opt-a",
    ]);
  });

  it("ignores non-uuid column ids that are not known filters", async () => {
    await expect(
      userService({
        ...defaultFilters,
        columnFilters: [
          columnFilter("somethingElse", { type: ColumnFilterType.SINGLE_SELECT, data: "value" }),
        ],
      }).getFilterConditions({ exclude: { createdAt: true } })
    ).resolves.toBeNull();
  });

  it("wraps authorization and filters together in the base conditions", async () => {
    const conditions = await userService().getBaseConditions();

    expect(conditions.sql).toContain('rfrd."formUserId"');
    expect(conditions.sql).toContain('rfrd."createdAt"');
    expect(conditions.sql).toContain("AND");
  });

  it("keeps only the authorization condition when filters are excluded", async () => {
    const conditions = await userService().getBaseConditions({ exclude: { createdAt: true } });

    expect(conditions.sql).toContain('rfrd."formUserId"');
    expect(conditions.sql).not.toContain('rfrd."createdAt"');
  });
});

describe("InsightsRoutingBaseService.getRoutingFunnelData", () => {
  it("returns an empty array for no date ranges", async () => {
    await expect(userService().getRoutingFunnelData([])).resolves.toEqual([]);
  });

  it("throws on an invalid date range", async () => {
    await expect(
      userService().getRoutingFunnelData([
        { startDate: "nope", endDate: "2024-01-01", formattedDate: "x", formattedDateFull: "x" },
      ])
    ).rejects.toThrow("Invalid date format in range");
  });

  it("fills missing buckets with zeroes and converts bigints", async () => {
    resolveQueryRaw([
      { dateRange: "Jan 1", totalSubmissions: 5n, successfulRoutings: 3n, acceptedBookings: 2n },
      { dateRange: null, totalSubmissions: 9n, successfulRoutings: 9n, acceptedBookings: 9n },
    ]);

    const result = await userService().getRoutingFunnelData(dateRanges);

    expect(result).toEqual([
      {
        name: "Jan 1",
        totalSubmissions: 5,
        successfulRoutings: 3,
        acceptedBookings: 2,
        formattedDateFull: "Jan 1, 2024",
      },
      {
        name: "Jan 2",
        totalSubmissions: 0,
        successfulRoutings: 0,
        acceptedBookings: 0,
        formattedDateFull: "Jan 2, 2024",
      },
    ]);
  });
});

describe("InsightsRoutingBaseService.getTableData", () => {
  it("returns the total count and rows, defaulting to createdAt DESC ordering", async () => {
    resolveQueryRaw([{ count: 7n }], [{ id: 1 }]);

    const result = await userService().getTableData({ limit: 10, offset: 0 });

    expect(result).toEqual({ total: 7, data: [{ id: 1 }] });
    expect(lastQuery().sql).toContain('ORDER BY "createdAt" DESC');
  });

  it("treats a missing count row as zero", async () => {
    resolveQueryRaw([], []);

    await expect(userService().getTableData({ limit: 10, offset: 0 })).resolves.toMatchObject({ total: 0 });
  });

  it("orders by the requested allowed columns", async () => {
    resolveQueryRaw([{ count: 0n }], []);

    await userService().getTableData({
      limit: 5,
      offset: 10,
      sorting: [
        { id: "bookingCreatedAt", desc: true },
        { id: "formName", desc: false },
      ],
    });

    const sql = lastQuery().sql;
    expect(sql).toContain('"bookingCreatedAt" DESC');
    expect(sql).toContain('"formName" ASC');
    expect(lastQuery().values).toEqual(expect.arrayContaining([5, 10]));
  });

  it("falls back to the default ordering when every sort column is disallowed", async () => {
    resolveQueryRaw([{ count: 0n }], []);

    await userService().getTableData({
      limit: 5,
      offset: 0,
      sorting: [{ id: "dropTable", desc: true }],
    });

    expect(lastQuery().sql).toContain('ORDER BY "createdAt" DESC');
  });
});

describe("InsightsRoutingBaseService.getRoutingFormStats", () => {
  it("splits the totals into with/without booking", async () => {
    resolveQueryRaw([{ count: 10n }], [{ count: 4n }]);

    await expect(userService().getRoutingFormStats()).resolves.toEqual({
      total: 10,
      totalWithoutBooking: 4,
      totalWithBooking: 6,
    });
  });

  it("returns null when a bookingUid filter makes the metrics meaningless", async () => {
    const service = userService({
      ...defaultFilters,
      columnFilters: [
        columnFilter("bookingUid", {
          type: ColumnFilterType.TEXT,
          data: { operator: "equals", operand: "uid-1" },
        }),
      ],
    });

    await expect(service.getRoutingFormStats()).resolves.toBeNull();
    expect(queryRawMock()).not.toHaveBeenCalled();
  });
});

describe("InsightsRoutingBaseService.getRoutedToPerPeriodData", () => {
  it("returns empty data sets when nobody was routed to", async () => {
    resolveQueryRaw([]);

    await expect(userService().getRoutedToPerPeriodData({ period: "perDay" })).resolves.toEqual({
      users: { data: [], nextCursor: undefined },
      periodStats: { data: [], nextCursor: undefined },
    });
  });

  it("applies the search query and the limit to the users query", async () => {
    resolveQueryRaw([]);

    await userService().getRoutedToPerPeriodData({ period: "perWeek", limit: 5, searchQuery: "ada" });

    const sql = queryAt(0).sql;
    expect(sql).toContain('"bookingUserName" ILIKE');
    expect(sql).toContain("LIMIT");
    expect(queryAt(0).values).toEqual(expect.arrayContaining(["%ada%", 5]));
  });

  it("omits the search condition and the limit when they are not given", async () => {
    resolveQueryRaw([]);

    await userService().getRoutedToPerPeriodData({ period: "perMonth" });

    const sql = queryAt(0).sql;
    expect(sql).toContain("1 = 1");
    expect(sql).not.toContain("LIMIT");
  });

  it("classifies each user's performance against the average and the median", async () => {
    const users = [
      { id: 1, name: "Low", email: "low@example.com", avatarUrl: null },
      { id: 2, name: "Mid", email: "mid@example.com", avatarUrl: null },
      { id: 3, name: "High", email: "high@example.com", avatarUrl: null },
      { id: 4, name: "Absent", email: "absent@example.com", avatarUrl: null },
    ];
    const periodStats = [{ userId: 1, period_start: new Date("2024-01-01T00:00:00.000Z"), total: 1 }];
    const stats = [
      { userId: 1, total_bookings: 1 },
      { userId: 2, total_bookings: 4 },
      { userId: 3, total_bookings: 10 },
    ];
    resolveQueryRaw(users, periodStats, stats);

    const result = await userService().getRoutedToPerPeriodData({ period: "perDay" });

    // average is 5, median is the middle row (4)
    expect(result.users.data).toEqual([
      { ...users[0], performance: "below_average", totalBookings: 1 },
      { ...users[1], performance: "median", totalBookings: 4 },
      { ...users[2], performance: "above_average", totalBookings: 10 },
      { ...users[3], performance: "no_data", totalBookings: 0 },
    ]);
    expect(result.periodStats.data).toEqual(periodStats);
  });

  it("marks a user matching both the average and the median as median", async () => {
    resolveQueryRaw(
      [{ id: 1, name: "Only", email: "only@example.com", avatarUrl: null }],
      [],
      [{ userId: 1, total_bookings: 3 }]
    );

    const result = await userService().getRoutedToPerPeriodData({ period: "perDay" });

    expect(result.users.data[0]).toMatchObject({ performance: "median", totalBookings: 3 });
  });
});

describe("InsightsRoutingBaseService.getRoutedToPerPeriodCsvData", () => {
  it("returns an empty list when no users were routed to", async () => {
    resolveQueryRaw([]);

    await expect(userService().getRoutedToPerPeriodCsvData({ period: "perDay" })).resolves.toEqual([]);
  });

  it("pivots the per-period stats into one column per period", async () => {
    resolveQueryRaw(
      [
        { id: 1, name: "Ada", email: "ada@example.com", avatarUrl: null },
        { id: 2, name: null, email: null, avatarUrl: null },
      ],
      [
        { userId: 1, period_start: new Date("2024-01-01T00:00:00.000Z"), total: 2 },
        { userId: 1, period_start: new Date("2024-01-02T00:00:00.000Z"), total: 3 },
      ],
      [{ userId: 1, total_bookings: 5 }]
    );

    const rows = await userService().getRoutedToPerPeriodCsvData({ period: "perDay" });

    expect(rows[0]).toEqual({
      "User ID": "1",
      Name: "Ada",
      Email: "ada@example.com",
      "Total Bookings": "5",
      Performance: "median",
      "Responses 2024-01-01": "2",
      "Responses 2024-01-02": "3",
    });
    expect(rows[1]).toEqual({
      "User ID": "2",
      Name: "",
      Email: "",
      "Total Bookings": "0",
      Performance: "no_data",
    });
  });
});

describe("InsightsRoutingBaseService.getFailedBookingsByFieldData", () => {
  it("returns an empty object when there is no data", async () => {
    resolveQueryRaw([]);

    await expect(userService().getFailedBookingsByFieldData()).resolves.toEqual({});
  });

  it("groups options by form and field and sorts forms by total responses", async () => {
    resolveQueryRaw([
      {
        formId: "f1",
        formName: "Small form",
        fieldId: "fld-1",
        fieldLabel: "Company size",
        optionId: "opt-1",
        optionLabel: "1-10",
        count: 2,
      },
      {
        formId: "f2",
        formName: "Busy form",
        fieldId: "fld-2",
        fieldLabel: "Region",
        optionId: "opt-2",
        optionLabel: "EU",
        count: 5,
      },
      {
        formId: "f2",
        formName: "Busy form",
        fieldId: "fld-2",
        fieldLabel: "Region",
        optionId: "opt-3",
        optionLabel: "US",
        count: 4,
      },
    ]);

    const result = await userService().getFailedBookingsByFieldData();

    expect(Object.keys(result)).toEqual(["Busy form", "Small form"]);
    expect(result["Busy form"]["Region"]).toEqual([
      { optionId: "opt-2", optionLabel: "EU", count: 5 },
      { optionId: "opt-3", optionLabel: "US", count: 4 },
    ]);
    expect(result["Small form"]["Company size"]).toHaveLength(1);
  });
});
