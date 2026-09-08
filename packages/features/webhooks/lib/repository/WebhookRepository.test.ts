import type { IEventTypesRepository } from "@calcom/features/eventtypes/eventtypes.repository.interface";
import type { IUsersRepository } from "@calcom/features/users/users.repository.interface";
import type { PrismaClient } from "@calcom/prisma";
import { WebhookTriggerEvents } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookVersion } from "../interface/IWebhookRepository";
import { WebhookRepository } from "./WebhookRepository";

vi.mock("@calcom/prisma", () => ({
  prisma: {},
}));

vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: vi.fn(),
}));

vi.mock("@calcom/features/users/users.repository", () => ({
  UsersRepository: vi.fn(),
}));

vi.mock("@calcom/features/pbac/services/permission-check.service", () => ({
  PermissionCheckService: class {
    checkPermission = vi.fn().mockResolvedValue(true);
  },
}));

type PrismaMock = {
  $queryRaw: ReturnType<typeof vi.fn>;
  webhook: {
    findUnique: ReturnType<typeof vi.fn>;
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

const buildPrismaMock = (): PrismaMock => ({
  $queryRaw: vi.fn().mockResolvedValue([]),
  webhook: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
  },
  user: { findUnique: vi.fn() },
});

const rawWebhook = (overrides: Record<string, unknown> = {}) => ({
  id: "wh-1",
  subscriberUrl: "https://example.com/hook",
  payloadTemplate: null,
  appId: null,
  secret: "secret",
  time: 10,
  timeUnit: "MINUTE",
  eventTriggers: [WebhookTriggerEvents.BOOKING_CREATED],
  version: WebhookVersion.V_2021_10_20,
  priority: 1,
  ...overrides,
});

/** Values interpolated into the tagged `$queryRaw` template, in order. */
const queryRawValues = (prisma: PrismaMock): unknown[] => {
  const [, ...values] = prisma.$queryRaw.mock.calls[0] as unknown[];
  return values;
};

describe("WebhookRepository", () => {
  let prisma: PrismaMock;
  let eventTypeRepository: IEventTypesRepository;
  let userRepository: IUsersRepository;
  let repository: WebhookRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = buildPrismaMock();
    eventTypeRepository = {
      findParentEventTypeId: vi.fn().mockResolvedValue(null),
    } as unknown as IEventTypesRepository;
    userRepository = {
      findUserTeams: vi.fn().mockResolvedValue(null),
      updateLastActiveAt: vi.fn(),
    } as unknown as IUsersRepository;
    repository = new WebhookRepository(
      prisma as unknown as PrismaClient,
      eventTypeRepository,
      userRepository
    );
  });

  describe("getSubscribers", () => {
    it("maps raw rows to subscribers without the internal priority field", async () => {
      prisma.$queryRaw.mockResolvedValue([rawWebhook()]);

      const subscribers = await repository.getSubscribers({
        userId: 1,
        triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
      });

      expect(subscribers).toEqual([
        {
          id: "wh-1",
          subscriberUrl: "https://example.com/hook",
          payloadTemplate: null,
          appId: null,
          secret: "secret",
          time: 10,
          timeUnit: "MINUTE",
          eventTriggers: [WebhookTriggerEvents.BOOKING_CREATED],
          version: WebhookVersion.V_2021_10_20,
        },
      ]);
      expect(subscribers[0]).not.toHaveProperty("priority");
    });

    it("deduplicates webhooks keeping the highest priority row", async () => {
      prisma.$queryRaw.mockResolvedValue([
        rawWebhook({ priority: 1, secret: "platform" }),
        rawWebhook({ priority: 2, secret: "user" }),
        rawWebhook({ id: "wh-2", priority: 5 }),
      ]);

      const subscribers = await repository.getSubscribers({
        teamId: 3,
        triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
      });

      expect(subscribers.map((webhook) => webhook.id)).toEqual(["wh-1", "wh-2"]);
      expect(subscribers[0].secret).toBe("platform");
    });

    it("returns an empty array when no webhook matches", async () => {
      expect(
        await repository.getSubscribers({ triggerEvent: WebhookTriggerEvents.BOOKING_CANCELLED })
      ).toEqual([]);
      expect(eventTypeRepository.findParentEventTypeId).not.toHaveBeenCalled();
    });

    it("resolves the managed parent event type when an eventTypeId is given", async () => {
      vi.mocked(eventTypeRepository.findParentEventTypeId).mockResolvedValue(99);

      await repository.getSubscribers({
        eventTypeId: 42,
        triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
      });

      expect(eventTypeRepository.findParentEventTypeId).toHaveBeenCalledWith(42);
      const values = queryRawValues(prisma);
      expect(values).toContain(42);
      expect(values).toContain(99);
    });

    it("passes undefined as the managed parent when the event type has none", async () => {
      await repository.getSubscribers({
        eventTypeId: 42,
        triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
      });

      const values = queryRawValues(prisma);
      expect(values).toContain(undefined);
      expect(values).not.toContain(null);
    });

    it("merges the orgId into the team ids", async () => {
      await repository.getSubscribers({
        teamId: [1, 2],
        orgId: 7,
        triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
      });

      expect(queryRawValues(prisma)).toContainEqual([1, 2, 7]);
    });

    it("wraps a single teamId in an array", async () => {
      await repository.getSubscribers({
        teamId: 5,
        triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
      });

      expect(queryRawValues(prisma)).toContainEqual([5]);
    });

    it("uses only the orgId when no teamId is provided", async () => {
      await repository.getSubscribers({
        orgId: 7,
        triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
      });

      expect(queryRawValues(prisma)).toContainEqual([7]);
    });

    it("forwards the oAuthClientId and trigger event to the query", async () => {
      await repository.getSubscribers({
        oAuthClientId: "oauth-client",
        triggerEvent: WebhookTriggerEvents.MEETING_ENDED,
      });

      const values = queryRawValues(prisma);
      expect(values).toContain("oauth-client");
      expect(values).toContain(WebhookTriggerEvents.MEETING_ENDED);
    });

    it("propagates database errors", async () => {
      prisma.$queryRaw.mockRejectedValue(new Error("db down"));

      await expect(
        repository.getSubscribers({ triggerEvent: WebhookTriggerEvents.BOOKING_CREATED })
      ).rejects.toThrow("db down");
    });
  });

  describe("getWebhookById", () => {
    it("returns null when the webhook does not exist", async () => {
      prisma.webhook.findUnique.mockResolvedValue(null);

      expect(await repository.getWebhookById("missing")).toBeNull();
    });

    it("selects only the delivery fields and parses the version", async () => {
      const { priority: _priority, ...webhook } = rawWebhook();
      prisma.webhook.findUnique.mockResolvedValue(webhook);

      const result = await repository.getWebhookById("wh-1");

      expect(result).toEqual({ ...webhook, version: WebhookVersion.V_2021_10_20 });
      expect(prisma.webhook.findUnique).toHaveBeenCalledWith({
        where: { id: "wh-1" },
        select: {
          id: true,
          subscriberUrl: true,
          payloadTemplate: true,
          appId: true,
          secret: true,
          time: true,
          timeUnit: true,
          eventTriggers: true,
          version: true,
        },
      });
    });

    it("throws for an unknown stored version", async () => {
      const { priority: _priority, ...webhook } = rawWebhook({ version: "1999-01-01" });
      prisma.webhook.findUnique.mockResolvedValue(webhook);

      await expect(repository.getWebhookById("wh-1")).rejects.toThrow(
        'Invalid webhook version: "1999-01-01"'
      );
    });
  });

  describe("findByWebhookId", () => {
    it("returns the webhook with a parsed version", async () => {
      prisma.webhook.findUniqueOrThrow.mockResolvedValue({
        id: "wh-1",
        subscriberUrl: "https://example.com/hook",
        payloadTemplate: null,
        active: true,
        eventTriggers: [WebhookTriggerEvents.BOOKING_CREATED],
        secret: null,
        teamId: null,
        userId: 1,
        platform: false,
        time: null,
        timeUnit: null,
        version: WebhookVersion.V_2021_10_20,
      });

      const webhook = await repository.findByWebhookId("wh-1");

      expect(webhook.version).toBe(WebhookVersion.V_2021_10_20);
      expect(webhook.userId).toBe(1);
      expect(prisma.webhook.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "wh-1" } })
      );
    });

    it("propagates the prisma error when no webhook matches", async () => {
      prisma.webhook.findUniqueOrThrow.mockRejectedValue(new Error("No Webhook found"));

      await expect(repository.findByWebhookId("nope")).rejects.toThrow("No Webhook found");
    });

    it("queries with an undefined id when none is given", async () => {
      prisma.webhook.findUniqueOrThrow.mockRejectedValue(new Error("No Webhook found"));

      await expect(repository.findByWebhookId()).rejects.toThrow("No Webhook found");
      expect(prisma.webhook.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: undefined } })
      );
    });
  });

  describe("findByOrgIdAndTrigger", () => {
    it("only queries active, non-platform webhooks of the org team", async () => {
      prisma.webhook.findMany.mockResolvedValue([]);

      await repository.findByOrgIdAndTrigger({
        orgId: 11,
        triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
      });

      expect(prisma.webhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            teamId: 11,
            platform: false,
            eventTriggers: { has: WebhookTriggerEvents.BOOKING_CREATED },
            active: true,
          },
        })
      );
      const [{ select }] = prisma.webhook.findMany.mock.calls[0] as [{ select: Record<string, true> }];
      expect(select).toMatchObject({ id: true, secret: true, version: true });
    });

    it("parses the version of every returned webhook", async () => {
      prisma.webhook.findMany.mockResolvedValue([
        {
          id: "wh-1",
          subscriberUrl: "https://example.com/hook",
          payloadTemplate: null,
          active: true,
          eventTriggers: [WebhookTriggerEvents.BOOKING_CREATED],
          secret: null,
          teamId: 11,
          userId: null,
          platform: false,
          time: null,
          timeUnit: null,
          appId: null,
          version: WebhookVersion.V_2021_10_20,
        },
      ]);

      const webhooks = await repository.findByOrgIdAndTrigger({
        orgId: 11,
        triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
      });

      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].version).toBe(WebhookVersion.V_2021_10_20);
    });

    it("throws when a stored version is invalid", async () => {
      prisma.webhook.findMany.mockResolvedValue([
        {
          id: "wh-1",
          subscriberUrl: "https://example.com/hook",
          payloadTemplate: null,
          active: true,
          eventTriggers: [],
          secret: null,
          teamId: 11,
          userId: null,
          platform: false,
          time: null,
          timeUnit: null,
          appId: null,
          version: "bogus",
        },
      ]);

      await expect(
        repository.findByOrgIdAndTrigger({
          orgId: 11,
          triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
        })
      ).rejects.toThrow('Invalid webhook version: "bogus"');
    });
  });

  describe("getInstance", () => {
    it("returns the same singleton instance", () => {
      const instance = WebhookRepository.getInstance();

      expect(instance).toBeInstanceOf(WebhookRepository);
      expect(WebhookRepository.getInstance()).toBe(instance);
    });
  });
});
