import type { PrismaClient } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import { PhoneNumberSubscriptionStatus } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPhoneNumberRepository } from "./PrismaPhoneNumberRepository";

const mockPrisma = {
  membership: { findMany: vi.fn() },
  agent: { findFirst: vi.fn() },
  calAiPhoneNumber: {
    findFirstOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
};

function sqlOf(call: unknown[]): { text: string; values: unknown[] } {
  const first = call[0];
  if (first instanceof Prisma.Sql) return { text: first.sql, values: first.values };
  const strings = first as ReadonlyArray<string>;
  return { text: strings.join("?"), values: call.slice(1) };
}

const phoneNumberSelect = {
  id: true,
  phoneNumber: true,
  userId: true,
  teamId: true,
  subscriptionStatus: true,
  stripeSubscriptionId: true,
  stripeCustomerId: true,
  provider: true,
  inboundAgentId: true,
  outboundAgentId: true,
  createdAt: true,
  updatedAt: true,
};

const rawPhoneNumber = {
  id: 1,
  phoneNumber: "+1000",
  provider: "retell",
  userId: 1,
  teamId: null,
  subscriptionStatus: "ACTIVE",
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-02T00:00:00Z"),
  inboundAgentId: "in-1",
  outboundAgentId: "out-1",
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
};

const expectedPhoneNumber = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  phoneNumber: "+1000",
  provider: "retell",
  userId: 1,
  teamId: null,
  subscriptionStatus: "ACTIVE",
  createdAt: rawPhoneNumber.createdAt,
  updatedAt: rawPhoneNumber.updatedAt,
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
  inboundAgent: null,
  outboundAgent: null,
  ...overrides,
});

describe("PrismaPhoneNumberRepository", () => {
  let repository: PrismaPhoneNumberRepository;

  const setMemberships = (teamIds: number[]) =>
    mockPrisma.membership.findMany.mockResolvedValue(teamIds.map((teamId) => ({ teamId })));

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaPhoneNumberRepository(mockPrisma as unknown as PrismaClient);
  });

  describe("findByPhoneNumberAndUserId", () => {
    it("uses findFirstOrThrow with the expected select", async () => {
      mockPrisma.calAiPhoneNumber.findFirstOrThrow.mockResolvedValue(rawPhoneNumber);

      const result = await repository.findByPhoneNumberAndUserId({ phoneNumber: "+1000", userId: 1 });

      expect(result).toEqual(rawPhoneNumber);
      expect(mockPrisma.calAiPhoneNumber.findFirstOrThrow).toHaveBeenCalledWith({
        where: { phoneNumber: "+1000", userId: 1 },
        select: phoneNumberSelect,
      });
    });

    it("propagates the not-found error", async () => {
      mockPrisma.calAiPhoneNumber.findFirstOrThrow.mockRejectedValue(new Error("No CalAiPhoneNumber found"));

      await expect(
        repository.findByPhoneNumberAndUserId({ phoneNumber: "+1000", userId: 1 })
      ).rejects.toThrow("No CalAiPhoneNumber found");
    });
  });

  describe("findPhoneNumbersFromUserId", () => {
    it("filters by user and active/null status and maps inbound/outbound agents", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([rawPhoneNumber, { ...rawPhoneNumber, id: 2 }])
        .mockResolvedValueOnce([
          { id: "in-1", name: "In", providerAgentId: "p-in", phoneNumberId: 1, agentType: "inbound" },
          { id: "out-1", name: "Out", providerAgentId: "p-out", phoneNumberId: 1, agentType: "outbound" },
          { id: "x", name: "X", providerAgentId: "p-x", phoneNumberId: 2, agentType: "unknown" },
        ]);

      const result = await repository.findPhoneNumbersFromUserId({ userId: 1 });

      const first = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(first.text).toContain('pn."userId" = ?');
      expect(first.values).toEqual([1, PhoneNumberSubscriptionStatus.ACTIVE]);
      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[1]).values).toEqual([Prisma.join([1, 2])]);
      expect(result).toEqual([
        expectedPhoneNumber({
          inboundAgent: { id: "in-1", name: "In", providerAgentId: "p-in" },
          outboundAgent: { id: "out-1", name: "Out", providerAgentId: "p-out" },
        }),
        expectedPhoneNumber({ id: 2 }),
      ]);
    });

    it("skips the agent query when no phone numbers exist", async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await repository.findPhoneNumbersFromUserId({ userId: 1 });

      expect(result).toEqual([]);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe("createPhoneNumber", () => {
    it("creates with all provided fields and select", async () => {
      mockPrisma.calAiPhoneNumber.create.mockResolvedValue(rawPhoneNumber);

      const result = await repository.createPhoneNumber({
        phoneNumber: "+1000",
        provider: "retell",
        userId: 1,
        teamId: 5,
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        subscriptionStatus: PhoneNumberSubscriptionStatus.ACTIVE,
        providerPhoneNumberId: "prov-1",
      });

      expect(result).toEqual(rawPhoneNumber);
      expect(mockPrisma.calAiPhoneNumber.create).toHaveBeenCalledWith({
        select: expect.objectContaining({ id: true, phoneNumber: true, providerPhoneNumberId: true }),
        data: {
          provider: "retell",
          userId: 1,
          teamId: 5,
          phoneNumber: "+1000",
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
          subscriptionStatus: PhoneNumberSubscriptionStatus.ACTIVE,
          providerPhoneNumberId: "prov-1",
        },
      });
    });
  });

  describe("simple lookups and deletes", () => {
    it("deletePhoneNumber deletes by phoneNumber", async () => {
      mockPrisma.calAiPhoneNumber.delete.mockResolvedValue(rawPhoneNumber);

      await repository.deletePhoneNumber({ phoneNumber: "+1000" });

      expect(mockPrisma.calAiPhoneNumber.delete).toHaveBeenCalledWith({ where: { phoneNumber: "+1000" } });
    });

    it("findByStripeSubscriptionId selects billing fields", async () => {
      mockPrisma.calAiPhoneNumber.findFirst.mockResolvedValue(null);

      const result = await repository.findByStripeSubscriptionId({ stripeSubscriptionId: "sub_1" });

      expect(result).toBeNull();
      expect(mockPrisma.calAiPhoneNumber.findFirst).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: "sub_1" },
        select: {
          id: true,
          phoneNumber: true,
          provider: true,
          userId: true,
          teamId: true,
          subscriptionStatus: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
        },
      });
    });

    it("findByIdAndUserId filters by id and userId", async () => {
      mockPrisma.calAiPhoneNumber.findFirst.mockResolvedValue(rawPhoneNumber);

      const result = await repository.findByIdAndUserId({ id: 1, userId: 1 });

      expect(result).toEqual(rawPhoneNumber);
      expect(mockPrisma.calAiPhoneNumber.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: 1 },
        select: phoneNumberSelect,
      });
    });

    it("findInboundAgentIdByPhoneNumberId selects only inboundAgentId", async () => {
      mockPrisma.calAiPhoneNumber.findUnique.mockResolvedValue({ inboundAgentId: "in-1" });

      const result = await repository.findInboundAgentIdByPhoneNumberId({ phoneNumberId: 1 });

      expect(result).toEqual({ inboundAgentId: "in-1" });
      expect(mockPrisma.calAiPhoneNumber.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { inboundAgentId: true },
      });
    });

    it("findByPhoneNumber selects user and team relations", async () => {
      mockPrisma.calAiPhoneNumber.findFirst.mockResolvedValue(null);

      await repository.findByPhoneNumber({ phoneNumber: "+1000" });

      expect(mockPrisma.calAiPhoneNumber.findFirst).toHaveBeenCalledWith({
        where: { phoneNumber: "+1000" },
        select: {
          id: true,
          phoneNumber: true,
          userId: true,
          teamId: true,
          user: { select: { id: true, email: true, name: true } },
          team: { select: { id: true, name: true, parentId: true } },
        },
      });
    });
  });

  describe("findByIdWithTeamAccess", () => {
    it("returns null without querying when user lacks team access", async () => {
      setMemberships([20]);

      const result = await repository.findByIdWithTeamAccess({ id: 1, teamId: 10, userId: 1 });

      expect(result).toBeNull();
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { userId: 1, accepted: true },
        select: { teamId: true },
      });
      expect(mockPrisma.calAiPhoneNumber.findFirst).not.toHaveBeenCalled();
    });

    it("queries by id and teamId when user has access", async () => {
      setMemberships([10]);
      mockPrisma.calAiPhoneNumber.findFirst.mockResolvedValue(rawPhoneNumber);

      const result = await repository.findByIdWithTeamAccess({ id: 1, teamId: 10, userId: 1 });

      expect(result).toEqual(rawPhoneNumber);
      expect(mockPrisma.calAiPhoneNumber.findFirst).toHaveBeenCalledWith({
        where: { id: 1, teamId: 10 },
        select: phoneNumberSelect,
      });
    });
  });

  describe("findByPhoneNumberAndTeamId", () => {
    it("returns null without querying when user lacks team access", async () => {
      setMemberships([]);

      const result = await repository.findByPhoneNumberAndTeamId({
        phoneNumber: "+1000",
        teamId: 10,
        userId: 1,
      });

      expect(result).toBeNull();
      expect(mockPrisma.calAiPhoneNumber.findFirst).not.toHaveBeenCalled();
    });

    it("queries by phoneNumber and teamId when user has access", async () => {
      setMemberships([10]);
      mockPrisma.calAiPhoneNumber.findFirst.mockResolvedValue(rawPhoneNumber);

      const result = await repository.findByPhoneNumberAndTeamId({
        phoneNumber: "+1000",
        teamId: 10,
        userId: 1,
      });

      expect(result).toEqual(rawPhoneNumber);
      expect(mockPrisma.calAiPhoneNumber.findFirst).toHaveBeenCalledWith({
        where: { phoneNumber: "+1000", teamId: 10 },
        select: phoneNumberSelect,
      });
    });
  });

  describe("findManyWithUserAccess", () => {
    it("personal scope skips membership lookup and maps agents", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([rawPhoneNumber, { ...rawPhoneNumber, id: 2 }])
        .mockResolvedValueOnce([
          { id: "in-1", name: "In", providerAgentId: "p-in", phoneNumberId: 1, agentType: "inbound" },
          { id: "out-1", name: "Out", providerAgentId: "p-out", phoneNumberId: 1, agentType: "outbound" },
          { id: "x", name: "X", providerAgentId: "p-x", phoneNumberId: 1, agentType: "unknown" },
        ]);

      const result = await repository.findManyWithUserAccess({ userId: 1, scope: "personal" });

      expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('pn."userId" = ');
      expect(text).toContain('ORDER BY pn."createdAt" DESC');
      expect(values).toEqual([1]);
      expect(result).toEqual([
        expectedPhoneNumber({
          inboundAgent: { id: "in-1", name: "In", providerAgentId: "p-in" },
          outboundAgent: { id: "out-1", name: "Out", providerAgentId: "p-out" },
        }),
        expectedPhoneNumber({ id: 2 }),
      ]);
    });

    it("returns [] with no query when no phone numbers match", async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await repository.findManyWithUserAccess({ userId: 1, scope: "personal" });

      expect(result).toEqual([]);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("team scope returns [] when user has no teams", async () => {
      setMemberships([]);

      expect(await repository.findManyWithUserAccess({ userId: 1, scope: "team" })).toEqual([]);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("team scope returns [] when requested team is inaccessible", async () => {
      setMemberships([20]);

      expect(await repository.findManyWithUserAccess({ userId: 1, scope: "team", teamId: 10 })).toEqual([]);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("team scope filters by requested team when accessible", async () => {
      setMemberships([10]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await repository.findManyWithUserAccess({ userId: 1, scope: "team", teamId: 10 });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('pn."teamId" = ');
      expect(values).toEqual([10]);
    });

    it("team scope filters by all accessible teams without teamId", async () => {
      setMemberships([10, 20]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await repository.findManyWithUserAccess({ userId: 1, scope: "team" });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('pn."teamId" IN (');
      expect(values).toEqual([10, 20]);
    });

    it("all scope with accessible teamId matches personal or team", async () => {
      setMemberships([10]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await repository.findManyWithUserAccess({ userId: 1, teamId: 10 });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('OR pn."teamId" = ');
      expect(values).toEqual([1, 10]);
    });

    it("all scope with inaccessible teamId matches personal only", async () => {
      setMemberships([20]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await repository.findManyWithUserAccess({ userId: 1, teamId: 10 });

      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual([1]);
    });

    it("all scope without teamId includes accessible teams", async () => {
      setMemberships([10, 20]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await repository.findManyWithUserAccess({ userId: 1 });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('OR pn."teamId" IN (');
      expect(values).toEqual([1, 10, 20]);
    });

    it("all scope without teams matches personal only", async () => {
      setMemberships([]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await repository.findManyWithUserAccess({ userId: 1 });

      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual([1]);
    });
  });

  describe("updateSubscriptionStatus", () => {
    it("updates only the status by default", async () => {
      mockPrisma.calAiPhoneNumber.update.mockResolvedValue(rawPhoneNumber);

      await repository.updateSubscriptionStatus({
        id: 1,
        subscriptionStatus: PhoneNumberSubscriptionStatus.CANCELLED,
      });

      expect(mockPrisma.calAiPhoneNumber.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { subscriptionStatus: PhoneNumberSubscriptionStatus.CANCELLED },
      });
    });

    it("disconnects both agents when requested", async () => {
      mockPrisma.calAiPhoneNumber.update.mockResolvedValue(rawPhoneNumber);

      await repository.updateSubscriptionStatus({
        id: 1,
        subscriptionStatus: PhoneNumberSubscriptionStatus.CANCELLED,
        disconnectAgents: true,
      });

      expect(mockPrisma.calAiPhoneNumber.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          subscriptionStatus: PhoneNumberSubscriptionStatus.CANCELLED,
          outboundAgent: { disconnect: true },
          inboundAgent: { disconnect: true },
        },
      });
    });
  });

  describe("updateAgents", () => {
    beforeEach(() => {
      mockPrisma.calAiPhoneNumber.update.mockResolvedValue(rawPhoneNumber);
    });

    it("leaves data empty when neither agent is provided", async () => {
      await repository.updateAgents({ id: 1 });

      expect(mockPrisma.agent.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.calAiPhoneNumber.update).toHaveBeenCalledWith({ where: { id: 1 }, data: {} });
    });

    it("connects agents found by providerAgentId", async () => {
      mockPrisma.agent.findFirst.mockResolvedValueOnce({ id: "in-1" }).mockResolvedValueOnce({ id: "out-1" });

      await repository.updateAgents({
        id: 1,
        inboundProviderAgentId: "p-in",
        outboundProviderAgentId: "p-out",
      });

      expect(mockPrisma.agent.findFirst).toHaveBeenNthCalledWith(1, { where: { providerAgentId: "p-in" } });
      expect(mockPrisma.agent.findFirst).toHaveBeenNthCalledWith(2, { where: { providerAgentId: "p-out" } });
      expect(mockPrisma.calAiPhoneNumber.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          inboundAgent: { connect: { id: "in-1" } },
          outboundAgent: { connect: { id: "out-1" } },
        },
      });
    });

    it("disconnects agents when providerAgentId does not resolve to an agent", async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      await repository.updateAgents({
        id: 1,
        inboundProviderAgentId: "missing",
        outboundProviderAgentId: "missing",
      });

      expect(mockPrisma.calAiPhoneNumber.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          inboundAgent: { disconnect: true },
          outboundAgent: { disconnect: true },
        },
      });
    });

    it("disconnects agents when null is passed explicitly", async () => {
      await repository.updateAgents({ id: 1, inboundProviderAgentId: null, outboundProviderAgentId: null });

      expect(mockPrisma.agent.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.calAiPhoneNumber.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          inboundAgent: { disconnect: true },
          outboundAgent: { disconnect: true },
        },
      });
    });

    it("only touches the agent that was provided", async () => {
      mockPrisma.agent.findFirst.mockResolvedValueOnce({ id: "out-1" });

      await repository.updateAgents({ id: 1, outboundProviderAgentId: "p-out" });

      expect(mockPrisma.agent.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.calAiPhoneNumber.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { outboundAgent: { connect: { id: "out-1" } } },
      });
    });
  });

  describe("updateInboundAgentId", () => {
    it("only sets inboundAgentId when currently null", async () => {
      mockPrisma.calAiPhoneNumber.updateMany.mockResolvedValue({ count: 1 });

      const result = await repository.updateInboundAgentId({ id: 1, agentId: "in-1" });

      expect(result).toEqual({ count: 1 });
      expect(mockPrisma.calAiPhoneNumber.updateMany).toHaveBeenCalledWith({
        where: { id: 1, inboundAgentId: null },
        data: { inboundAgentId: "in-1" },
      });
    });
  });
});
