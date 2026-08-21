import { describe, expect, it } from "vitest";
import {
  bookingRepositoryBaseInputSchema,
  insightsRoutingServiceInputSchema,
  insightsRoutingServicePaginatedInputSchema,
  rawDataInputSchema,
  routedToPerPeriodCsvInputSchema,
  routedToPerPeriodInputSchema,
  routingFormStatsInputSchema,
  routingRepositoryBaseInputSchema,
} from "../raw-data.schema";

const dates = { startDate: "2024-01-01", endDate: "2024-01-31" };

describe("rawDataInputSchema", () => {
  it("coerces numeric strings for ids and accepts nulls", () => {
    const parsed = rawDataInputSchema.parse({
      ...dates,
      teamId: "5",
      userId: null,
      memberUserId: "7",
      eventTypeId: "9",
    });

    expect(parsed).toMatchObject({ teamId: 5, userId: null, memberUserId: 7, eventTypeId: 9 });
  });

  it("requires start and end date", () => {
    expect(rawDataInputSchema.safeParse({ startDate: "2024-01-01" }).success).toBe(false);
  });

  it("rejects a limit above 100 but allows exactly 100", () => {
    expect(rawDataInputSchema.safeParse({ ...dates, limit: 101 }).success).toBe(false);
    expect(rawDataInputSchema.safeParse({ ...dates, limit: 100 }).success).toBe(true);
  });

  it("rejects a non-numeric team id", () => {
    expect(rawDataInputSchema.safeParse({ ...dates, teamId: "not-a-number" }).success).toBe(false);
  });
});

describe("routingFormStatsInputSchema", () => {
  it("coerces isAll and requires columnFilters", () => {
    const parsed = routingFormStatsInputSchema.parse({
      ...dates,
      isAll: "yes",
      columnFilters: [],
    });

    expect(parsed.isAll).toBe(true);
    expect(parsed.columnFilters).toEqual([]);
  });

  it("rejects input without columnFilters", () => {
    expect(routingFormStatsInputSchema.safeParse({ ...dates, isAll: false }).success).toBe(false);
  });

  it("accepts an array of member user ids", () => {
    const parsed = routingFormStatsInputSchema.parse({
      ...dates,
      isAll: false,
      memberUserIds: [1, 2],
      columnFilters: [],
    });

    expect(parsed.memberUserIds).toEqual([1, 2]);
  });
});

describe("insightsRoutingServiceInputSchema", () => {
  it.each(["user", "team", "org"] as const)("accepts the %s scope", (scope) => {
    expect(insightsRoutingServiceInputSchema.parse({ ...dates, scope }).scope).toBe(scope);
  });

  it("rejects an unknown scope", () => {
    expect(insightsRoutingServiceInputSchema.safeParse({ ...dates, scope: "global" }).success).toBe(false);
  });
});

describe("insightsRoutingServicePaginatedInputSchema", () => {
  it("requires offset and limit", () => {
    expect(
      insightsRoutingServicePaginatedInputSchema.safeParse({ ...dates, scope: "user", offset: 0 }).success
    ).toBe(false);
  });

  it("caps limit at 100", () => {
    expect(
      insightsRoutingServicePaginatedInputSchema.safeParse({
        ...dates,
        scope: "user",
        offset: 0,
        limit: 200,
      }).success
    ).toBe(false);
  });

  it("parses a valid paginated input", () => {
    const parsed = insightsRoutingServicePaginatedInputSchema.parse({
      ...dates,
      scope: "team",
      selectedTeamId: 3,
      offset: 10,
      limit: 20,
    });

    expect(parsed).toMatchObject({ scope: "team", selectedTeamId: 3, offset: 10, limit: 20 });
  });
});

describe("routingRepositoryBaseInputSchema and its extensions", () => {
  it("parses the base input", () => {
    expect(routingRepositoryBaseInputSchema.parse({ ...dates, scope: "org" }).scope).toBe("org");
  });

  it("defaults the routedToPerPeriod limit to 10 and trims the search query", () => {
    const parsed = routedToPerPeriodInputSchema.parse({
      ...dates,
      scope: "user",
      period: "perWeek",
      searchQuery: "  alice  ",
    });

    expect(parsed.limit).toBe(10);
    expect(parsed.searchQuery).toBe("alice");
  });

  it("rejects an unknown period and an empty search query", () => {
    expect(
      routedToPerPeriodInputSchema.safeParse({ ...dates, scope: "user", period: "perYear" }).success
    ).toBe(false);
    expect(
      routedToPerPeriodInputSchema.safeParse({ ...dates, scope: "user", period: "perDay", searchQuery: " " })
        .success
    ).toBe(false);
  });

  it("rejects a non-integer or out-of-range limit", () => {
    expect(
      routedToPerPeriodInputSchema.safeParse({ ...dates, scope: "user", period: "perDay", limit: 1.5 })
        .success
    ).toBe(false);
    expect(
      routedToPerPeriodInputSchema.safeParse({ ...dates, scope: "user", period: "perDay", limit: 0 }).success
    ).toBe(false);
  });

  it("does not accept a limit on the csv input", () => {
    const parsed = routedToPerPeriodCsvInputSchema.parse({
      ...dates,
      scope: "user",
      period: "perMonth",
    });

    expect(parsed).not.toHaveProperty("limit");
  });
});

describe("bookingRepositoryBaseInputSchema", () => {
  it("requires a timeZone", () => {
    expect(bookingRepositoryBaseInputSchema.safeParse({ scope: "user" }).success).toBe(false);
    expect(bookingRepositoryBaseInputSchema.parse({ scope: "user", timeZone: "Asia/Kolkata" }).timeZone).toBe(
      "Asia/Kolkata"
    );
  });
});
