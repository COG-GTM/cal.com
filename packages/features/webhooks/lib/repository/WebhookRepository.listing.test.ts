import type { IEventTypesRepository } from "@calcom/features/eventtypes/eventtypes.repository.interface";
import type { IUsersRepository } from "@calcom/features/users/users.repository.interface";
import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole, UserPermissionRole, WebhookTriggerEvents } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookVersion } from "../interface/IWebhookRepository";
import { WebhookRepository } from "./WebhookRepository";

const { checkPermission } = vi.hoisted(() => ({ checkPermission: vi.fn() }));

vi.mock("@calcom/prisma", () => ({
  prisma: {},
}));

vi.mock("@calcom/features/pbac/services/permission-check.service", () => ({
  PermissionCheckService: class {
    checkPermission = checkPermission;
  },
}));

vi.mock("@calcom/lib/getAvatarUrl", () => ({
  getUserAvatarUrl: vi.fn(({ avatarUrl }: { avatarUrl: string | null }) => avatarUrl ?? "default-avatar"),
}));

vi.mock("@calcom/lib/defaultAvatarImage", () => ({
  getPlaceholderAvatar: vi.fn((url: string | null, name: string | null) => url ?? `placeholder-${name}`),
}));

type PrismaMock = {
  $queryRaw: ReturnType<typeof vi.fn>;
  webhook: { findMany: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

const prismaWebhook = (overrides: Record<string, unknown> = {}) => ({
  id: "wh-1",
  subscriberUrl: "https://example.com/hook",
  payloadTemplate: null,
  appId: null,
  secret: null,
  active: true,
  eventTriggers: [WebhookTriggerEvents.BOOKING_CREATED],
  eventTypeId: null,
  teamId: null,
  userId: 1,
  time: null,
  timeUnit: null,
  version: WebhookVersion.V_2021_10_20,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  platform: false,
  platformOAuthClientId: null,
  ...overrides,
});

describe("WebhookRepository listing", () => {
  let prisma: PrismaMock;
  let eventTypeRepository: IEventTypesRepository;
  let userRepository: IUsersRepository;
  let repository: WebhookRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    checkPermission.mockResolvedValue(true);
    prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      webhook: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findUnique: vi.fn() },
    };
    eventTypeRepository = {
      findParentEventTypeId: vi.fn().mockResolvedValue(null),
    } as unknown as IEventTypesRepository;
    userRepository = {
      findUserTeams: vi.fn().mockResolvedValue({ teams: [] }),
      updateLastActiveAt: vi.fn(),
    } as unknown as IUsersRepository;
    repository = new WebhookRepository(
      prisma as unknown as PrismaClient,
      eventTypeRepository,
      userRepository
    );
  });

  describe("getFilteredWebhooksForUser", () => {
    it("throws when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(repository.getFilteredWebhooksForUser({ userId: 1 })).rejects.toThrow("User not found");
    });

    it("excludes zapier and make webhooks from the personal group", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        username: "alice",
        name: "Alice",
        avatarUrl: null,
        webhooks: [
          prismaWebhook({ id: "own" }),
          prismaWebhook({ id: "zap", appId: "zapier" }),
          prismaWebhook({ id: "mk", appId: "make" }),
        ],
        teams: [],
      });

      const { webhookGroups, profiles } = await repository.getFilteredWebhooksForUser({ userId: 1 });

      expect(webhookGroups).toHaveLength(1);
      expect(webhookGroups[0].webhooks.map((webhook) => webhook.id)).toEqual(["own"]);
      expect(webhookGroups[0].metadata).toEqual({ canModify: true, canDelete: true });
      expect(profiles).toEqual([
        {
          teamId: null,
          slug: "alice",
          name: "Alice",
          image: "default-avatar",
          canModify: true,
          canDelete: true,
        },
      ]);
    });

    it("drops groups without webhooks but keeps their profile", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        username: "alice",
        name: "Alice",
        avatarUrl: "https://cdn/avatar.png",
        webhooks: [],
        teams: [],
      });

      const { webhookGroups, profiles } = await repository.getFilteredWebhooksForUser({ userId: 1 });

      expect(webhookGroups).toEqual([]);
      expect(profiles).toHaveLength(1);
      expect(profiles[0].image).toBe("https://cdn/avatar.png");
    });

    it("skips teams the user cannot read and maps permissions for the others", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        username: "alice",
        name: "Alice",
        avatarUrl: null,
        webhooks: [],
        teams: [
          {
            role: MembershipRole.MEMBER,
            team: {
              id: 10,
              name: "Readable",
              slug: "readable",
              logoUrl: null,
              webhooks: [prismaWebhook({ id: "team-wh", teamId: 10, userId: null })],
            },
          },
          {
            role: MembershipRole.MEMBER,
            team: { id: 20, name: "Hidden", slug: null, logoUrl: null, webhooks: [] },
          },
        ],
      });
      checkPermission.mockImplementation(({ teamId, permission }: { teamId: number; permission: string }) => {
        if (teamId === 20) return Promise.resolve(false);
        return Promise.resolve(permission !== "webhook.delete");
      });

      const { webhookGroups, profiles } = await repository.getFilteredWebhooksForUser({ userId: 1 });

      expect(webhookGroups).toHaveLength(1);
      expect(webhookGroups[0].teamId).toBe(10);
      expect(webhookGroups[0].profile).toEqual({
        name: "Readable",
        slug: "readable",
        image: "placeholder-Readable",
      });
      expect(webhookGroups[0].metadata).toEqual({ canModify: true, canDelete: false });
      expect(profiles.map((profile) => profile.teamId)).toEqual([null, 10]);
      expect(checkPermission).toHaveBeenCalledWith({
        userId: 1,
        teamId: 20,
        permission: "webhook.read",
        fallbackRoles: [MembershipRole.MEMBER, MembershipRole.ADMIN, MembershipRole.OWNER],
      });
      expect(checkPermission).toHaveBeenCalledWith({
        userId: 1,
        teamId: 10,
        permission: "webhook.update",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });
    });

    it("nulls out the team slug when the team has none", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        username: null,
        name: null,
        avatarUrl: null,
        webhooks: [],
        teams: [
          {
            role: MembershipRole.ADMIN,
            team: {
              id: 10,
              name: "No slug",
              slug: undefined,
              logoUrl: "https://cdn/logo.png",
              webhooks: [prismaWebhook({ id: "team-wh", teamId: 10, userId: null })],
            },
          },
        ],
      });

      const { webhookGroups } = await repository.getFilteredWebhooksForUser({ userId: 1 });

      expect(webhookGroups[0].profile.slug).toBeNull();
      expect(webhookGroups[0].profile.image).toBe("https://cdn/logo.png");
    });

    it("adds a platform group for instance admins only", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        username: "alice",
        name: "Alice",
        avatarUrl: null,
        webhooks: [],
        teams: [],
      });
      prisma.webhook.findMany.mockResolvedValue([prismaWebhook({ id: "platform-wh", platform: true })]);

      const asAdmin = await repository.getFilteredWebhooksForUser({
        userId: 1,
        userRole: UserPermissionRole.ADMIN,
      });

      expect(prisma.webhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { platform: true } })
      );
      expect(asAdmin.webhookGroups).toHaveLength(1);
      expect(asAdmin.webhookGroups[0].profile.name).toBe("Platform");
      expect(asAdmin.webhookGroups[0].webhooks[0].id).toBe("platform-wh");

      prisma.webhook.findMany.mockClear();
      const asUser = await repository.getFilteredWebhooksForUser({
        userId: 1,
        userRole: UserPermissionRole.USER,
      });

      expect(prisma.webhook.findMany).not.toHaveBeenCalled();
      expect(asUser.webhookGroups).toEqual([]);
    });
  });

  describe("listWebhooks", () => {
    const whereConditions = (): unknown[] => {
      const [{ where }] = prisma.webhook.findMany.mock.calls[0] as [{ where: { AND: unknown[] } }];
      return where.AND;
    };

    it("defaults the appId filter to null so zapier and make are excluded", async () => {
      await repository.listWebhooks({ userId: 1 });

      expect(whereConditions()).toContainEqual({ appId: null });
    });

    it("keeps an explicit appId filter", async () => {
      await repository.listWebhooks({ userId: 1, appId: "zapier" });

      expect(whereConditions()).toContainEqual({ appId: "zapier" });
    });

    it("includes the active parent event type webhooks for managed event types", async () => {
      vi.mocked(eventTypeRepository.findParentEventTypeId).mockResolvedValue(99);

      await repository.listWebhooks({ userId: 1, eventTypeId: 42 });

      expect(whereConditions()).toContainEqual({
        OR: [{ eventTypeId: 42 }, { eventTypeId: 99, active: true }],
      });
      expect(checkPermission).not.toHaveBeenCalled();
    });

    it("filters by the event type alone when it has no managed parent", async () => {
      await repository.listWebhooks({ userId: 1, eventTypeId: 42 });

      expect(whereConditions()).toContainEqual({ eventTypeId: 42 });
    });

    it("restricts to the user and the teams they may read", async () => {
      vi.mocked(userRepository.findUserTeams).mockResolvedValue({
        teams: [{ teamId: 10 }, { teamId: 20 }],
      });
      checkPermission.mockImplementation(({ teamId }: { teamId: number }) => Promise.resolve(teamId === 10));

      await repository.listWebhooks({ userId: 1 });

      expect(whereConditions()).toContainEqual({ OR: [{ userId: 1 }, { teamId: { in: [10] } }] });
      expect(checkPermission).toHaveBeenCalledWith({
        userId: 1,
        teamId: 10,
        permission: "webhook.read",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });
    });

    it("only matches personal webhooks when the user has no readable team", async () => {
      vi.mocked(userRepository.findUserTeams).mockResolvedValue(null);

      await repository.listWebhooks({ userId: 1 });

      expect(whereConditions()).toContainEqual({ OR: [{ userId: 1 }] });
      expect(checkPermission).not.toHaveBeenCalled();
    });

    it("requires every requested event trigger", async () => {
      await repository.listWebhooks({
        userId: 1,
        eventTriggers: [WebhookTriggerEvents.BOOKING_CREATED, WebhookTriggerEvents.BOOKING_CANCELLED],
      });

      expect(whereConditions()).toContainEqual({
        eventTriggers: {
          hasEvery: [WebhookTriggerEvents.BOOKING_CREATED, WebhookTriggerEvents.BOOKING_CANCELLED],
        },
      });
    });

    it("ignores an empty event trigger list", async () => {
      await repository.listWebhooks({ userId: 1, eventTriggers: [] });

      expect(whereConditions()).not.toContainEqual(
        expect.objectContaining({ eventTriggers: expect.anything() })
      );
    });

    it("maps prisma webhooks to domain webhooks", async () => {
      prisma.webhook.findMany.mockResolvedValue([prismaWebhook({ id: "wh-9" })]);

      const webhooks = await repository.listWebhooks({ userId: 1 });

      expect(webhooks).toHaveLength(1);
      expect(webhooks[0]).toMatchObject({
        id: "wh-9",
        active: true,
        version: WebhookVersion.V_2021_10_20,
      });
    });
  });
});
