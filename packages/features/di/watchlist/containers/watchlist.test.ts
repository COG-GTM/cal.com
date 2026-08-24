import { AdminWatchlistOperationsService } from "@calcom/features/watchlist/lib/service/AdminWatchlistOperationsService";
import { AdminWatchlistQueryService } from "@calcom/features/watchlist/lib/service/AdminWatchlistQueryService";
import { GlobalBlockingService } from "@calcom/features/watchlist/lib/service/GlobalBlockingService";
import { OrganizationBlockingService } from "@calcom/features/watchlist/lib/service/OrganizationBlockingService";
import { OrganizationWatchlistOperationsService } from "@calcom/features/watchlist/lib/service/OrganizationWatchlistOperationsService";
import { OrganizationWatchlistQueryService } from "@calcom/features/watchlist/lib/service/OrganizationWatchlistQueryService";
import { SpamCheckService } from "@calcom/features/watchlist/lib/service/SpamCheckService";
import { describe, expect, it, vi } from "vitest";
import { getSpamCheckService } from "./SpamCheckService.container";
import {
  getAdminWatchlistOperationsService,
  getAdminWatchlistQueryService,
  getAuditService,
  getGlobalBlockingService,
  getGlobalWatchlistRepository,
  getOrganizationBlockingService,
  getOrganizationWatchlistOperationsService,
  getOrganizationWatchlistQueryService,
  getOrganizationWatchlistRepository,
  getWatchlistFeature,
  getWatchlistService,
} from "./watchlist";

vi.mock("@calcom/prisma", () => {
  const client = { $connect: vi.fn() };
  return { default: client, prisma: client, readonlyPrisma: client };
});

vi.mock("@calcom/features/tasker", () => ({
  default: { create: vi.fn(), cleanup: vi.fn(), processQueue: vi.fn() },
}));

describe("watchlist container", () => {
  it("resolves the blocking services from the shared container", () => {
    expect(getGlobalBlockingService()).toBeInstanceOf(GlobalBlockingService);
    expect(getOrganizationBlockingService()).toBeInstanceOf(OrganizationBlockingService);
  });

  it("has no container binding for the watchlist and audit services", () => {
    // Watchlist.module only binds the repositories and blocking services; the
    // watchlist and audit services are assembled by the feature facade instead.
    expect(() => getWatchlistService()).toThrow();
    expect(() => getAuditService()).toThrow();
  });

  it("resolves the watchlist repositories", () => {
    expect(getGlobalWatchlistRepository()).toBeDefined();
    expect(getOrganizationWatchlistRepository()).toBeDefined();
  });

  it("reuses the singleton container between calls", () => {
    expect(getGlobalBlockingService()).toBe(getGlobalBlockingService());
  });

  it("builds the watchlist feature facade", async () => {
    await expect(getWatchlistFeature()).resolves.toBeDefined();
  });

  it("constructs the admin services directly from prisma", () => {
    expect(getAdminWatchlistOperationsService()).toBeInstanceOf(AdminWatchlistOperationsService);
    expect(getAdminWatchlistQueryService()).toBeInstanceOf(AdminWatchlistQueryService);
  });

  it("constructs the organization services scoped to an organization", () => {
    expect(getOrganizationWatchlistOperationsService(1)).toBeInstanceOf(
      OrganizationWatchlistOperationsService
    );
    expect(getOrganizationWatchlistQueryService()).toBeInstanceOf(OrganizationWatchlistQueryService);
  });

  it("composes the spam check service from both blocking services", () => {
    expect(getSpamCheckService()).toBeInstanceOf(SpamCheckService);
  });
});
