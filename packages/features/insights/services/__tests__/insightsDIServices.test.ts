import type { PrismaClient } from "@calcom/prisma";
import { describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { InsightsBookingBaseService } from "../InsightsBookingBaseService";
import { InsightsBookingService } from "../InsightsBookingDIService";
import { InsightsRoutingBaseService } from "../InsightsRoutingBaseService";
import { InsightsRoutingService } from "../InsightsRoutingDIService";

const prismaMock = mockDeep<PrismaClient>();

describe("InsightsBookingService", () => {
  it("creates a base service bound to the injected prisma client", async () => {
    const service = new InsightsBookingService({ prisma: prismaMock }).create({
      options: { scope: "user", userId: 1, orgId: null },
    });

    expect(service).toBeInstanceOf(InsightsBookingBaseService);
    expect((await service.getAuthorizationConditions()).values).toEqual([1]);
  });
});

describe("InsightsRoutingService", () => {
  it("creates a base service bound to the injected prisma client", async () => {
    const service = new InsightsRoutingService({ prisma: prismaMock }).create({
      options: { scope: "user", userId: 2, orgId: null },
      filters: { startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-01-31T00:00:00.000Z" },
    });

    expect(service).toBeInstanceOf(InsightsRoutingBaseService);
    expect((await service.getAuthorizationConditions()).values).toEqual([2]);
  });
});
