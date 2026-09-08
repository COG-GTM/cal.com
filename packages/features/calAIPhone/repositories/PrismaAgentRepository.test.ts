import type { PrismaClient } from "@calcom/prisma/client";
import { Prisma } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaAgentRepository } from "./PrismaAgentRepository";

const mockPrisma = {
  membership: { findMany: vi.fn() },
  agent: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), update: vi.fn() },
  workflowStep: { update: vi.fn() },
  $queryRaw: vi.fn(),
};

function sqlOf(call: unknown[]): { text: string; values: unknown[] } {
  const first = call[0];
  if (first instanceof Prisma.Sql) return { text: first.sql, values: first.values };
  const strings = first as ReadonlyArray<string>;
  return { text: strings.join("?"), values: call.slice(1) };
}

const baseAgent = {
  id: "agent-1",
  name: "Agent One",
  providerAgentId: "provider-1",
  enabled: true,
  userId: 1,
  teamId: null,
  inboundEventTypeId: null,
  outboundEventTypeId: null,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-02T00:00:00Z"),
};

describe("PrismaAgentRepository", () => {
  let repository: PrismaAgentRepository;

  const setMemberships = (teamIds: number[]) =>
    mockPrisma.membership.findMany.mockResolvedValue(teamIds.map((teamId) => ({ teamId })));

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaAgentRepository(mockPrisma as unknown as PrismaClient);
  });

  describe("findByIdWithUserAccess", () => {
    it("scopes to the team when user has access to the requested team", async () => {
      setMemberships([10, 20]);
      mockPrisma.$queryRaw.mockResolvedValue([baseAgent]);

      const result = await repository.findByIdWithUserAccess({ agentId: "agent-1", userId: 1, teamId: 10 });

      expect(result).toEqual(baseAgent);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { userId: 1, accepted: true },
        select: { teamId: true },
      });
      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('"teamId" = ');
      expect(text).not.toContain('"userId"  = ');
      expect(values).toEqual(["agent-1", 10]);
    });

    it("falls back to personal agents when user lacks access to the requested team", async () => {
      setMemberships([20]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await repository.findByIdWithUserAccess({ agentId: "agent-1", userId: 1, teamId: 10 });

      expect(result).toBeNull();
      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('"userId" = ');
      expect(values).toEqual(["agent-1", 1]);
    });

    it("checks personal and team agents when no teamId is given and user has teams", async () => {
      setMemberships([10, 20]);
      mockPrisma.$queryRaw.mockResolvedValue([baseAgent]);

      await repository.findByIdWithUserAccess({ agentId: "agent-1", userId: 1 });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('"teamId" IN (');
      expect(values).toEqual(["agent-1", 1, 10, 20]);
    });

    it("checks only personal agents when user has no teams", async () => {
      setMemberships([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await repository.findByIdWithUserAccess({ agentId: "agent-1", userId: 1 });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).not.toContain("IN (");
      expect(values).toEqual(["agent-1", 1]);
    });
  });

  describe("findByProviderAgentIdWithUserAccess", () => {
    it("includes accessible team ids in the condition", async () => {
      setMemberships([3]);
      mockPrisma.$queryRaw.mockResolvedValue([baseAgent]);

      const result = await repository.findByProviderAgentIdWithUserAccess({
        providerAgentId: "provider-1",
        userId: 1,
      });

      expect(result).toEqual(baseAgent);
      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('"providerAgentId" = ');
      expect(text).toContain('"teamId" IN (');
      expect(values).toEqual(["provider-1", 1, 3]);
    });

    it("uses personal-only condition without teams and returns null on no match", async () => {
      setMemberships([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await repository.findByProviderAgentIdWithUserAccess({
        providerAgentId: "provider-1",
        userId: 1,
      });

      expect(result).toBeNull();
      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual(["provider-1", 1]);
    });
  });

  describe("findById / findByProviderAgentId", () => {
    it("findById selects agent fields by id", async () => {
      mockPrisma.agent.findUnique.mockResolvedValue(baseAgent);

      const result = await repository.findById({ id: "agent-1" });

      expect(result).toEqual(baseAgent);
      expect(mockPrisma.agent.findUnique).toHaveBeenCalledWith({
        select: expect.objectContaining({ id: true, providerAgentId: true, outboundEventTypeId: true }),
        where: { id: "agent-1" },
      });
    });

    it("findByProviderAgentId selects team parentId", async () => {
      mockPrisma.agent.findUnique.mockResolvedValue({ ...baseAgent, team: null });

      const result = await repository.findByProviderAgentId({ providerAgentId: "provider-1" });

      expect(result).toEqual({ ...baseAgent, team: null });
      expect(mockPrisma.agent.findUnique).toHaveBeenCalledWith({
        select: expect.objectContaining({ team: { select: { id: true, parentId: true } } }),
        where: { providerAgentId: "provider-1" },
      });
    });
  });

  describe("findManyWithUserAccess", () => {
    const rawAgent = {
      ...baseAgent,
      teamId: 10,
      user_id: 1,
      user_name: "User",
      user_email: "user@example.com",
      team_id: 10,
      team_name: "Team",
      team_slug: "team",
      team_logo_url: "logo.png",
    };

    it("personal scope does not look up memberships and maps phone numbers", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([rawAgent, { ...baseAgent, id: "agent-2" }])
        .mockResolvedValueOnce([
          {
            id: 1,
            phoneNumber: "+1",
            subscriptionStatus: "ACTIVE",
            provider: "retell",
            outboundAgentId: "agent-1",
          },
          {
            id: 2,
            phoneNumber: "+2",
            subscriptionStatus: "ACTIVE",
            provider: "retell",
            outboundAgentId: "agent-1",
          },
          {
            id: 3,
            phoneNumber: "+3",
            subscriptionStatus: "ACTIVE",
            provider: "retell",
            outboundAgentId: null,
          },
        ]);

      const result = await repository.findManyWithUserAccess({ userId: 1, scope: "personal" });

      expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual([1]);
      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[1]).values).toEqual([Prisma.join(["agent-1", "agent-2"])]);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        ...baseAgent,
        teamId: 10,
        user: { id: 1, name: "User", email: "user@example.com" },
        team: { id: 10, name: "Team", slug: "team", logoUrl: "logo.png" },
        outboundPhoneNumbers: [
          { id: 1, phoneNumber: "+1", subscriptionStatus: "ACTIVE", provider: "retell" },
          { id: 2, phoneNumber: "+2", subscriptionStatus: "ACTIVE", provider: "retell" },
        ],
      });
      expect(result[1]).toEqual({
        ...baseAgent,
        id: "agent-2",
        user: null,
        team: null,
        outboundPhoneNumbers: [],
      });
    });

    it("maps missing user/team names to null", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ ...baseAgent, user_id: 1, team_id: 10 }])
        .mockResolvedValueOnce([]);

      const [agent] = await repository.findManyWithUserAccess({ userId: 1, scope: "personal" });

      expect(agent.user).toEqual({ id: 1, name: null, email: null });
      expect(agent.team).toEqual({ id: 10, name: null, slug: null, logoUrl: null });
    });

    it("skips the phone number query when no agents match", async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await repository.findManyWithUserAccess({ userId: 1, scope: "personal" });

      expect(result).toEqual([]);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("team scope returns [] when user has no teams", async () => {
      setMemberships([]);

      const result = await repository.findManyWithUserAccess({ userId: 1, scope: "team" });

      expect(result).toEqual([]);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("team scope returns [] when user lacks access to requested team", async () => {
      setMemberships([20]);

      const result = await repository.findManyWithUserAccess({ userId: 1, scope: "team", teamId: 10 });

      expect(result).toEqual([]);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("team scope filters by the requested team when accessible", async () => {
      setMemberships([10]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await repository.findManyWithUserAccess({ userId: 1, scope: "team", teamId: 10 });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('a."teamId" = ');
      expect(values).toEqual([10]);
    });

    it("team scope filters by all accessible teams when no teamId given", async () => {
      setMemberships([10, 20]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await repository.findManyWithUserAccess({ userId: 1, scope: "team" });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('a."teamId" IN (');
      expect(values).toEqual([10, 20]);
    });

    it("all scope with accessible teamId matches personal or that team", async () => {
      setMemberships([10]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await repository.findManyWithUserAccess({ userId: 1, teamId: 10 });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('a."userId" = ');
      expect(text).toContain('OR a."teamId" = ');
      expect(values).toEqual([1, 10]);
    });

    it("all scope with inaccessible teamId matches personal only", async () => {
      setMemberships([20]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await repository.findManyWithUserAccess({ userId: 1, teamId: 10 });

      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual([1]);
    });

    it("all scope without teamId includes all accessible teams", async () => {
      setMemberships([10, 20]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await repository.findManyWithUserAccess({ userId: 1 });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('OR a."teamId" IN (');
      expect(values).toEqual([1, 10, 20]);
    });

    it("all scope without teams matches personal only", async () => {
      setMemberships([]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await repository.findManyWithUserAccess({ userId: 1 });

      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual([1]);
    });
  });

  describe("findByIdWithUserAccessAndDetails", () => {
    it("returns null when no agent matches", async () => {
      setMemberships([]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await repository.findByIdWithUserAccessAndDetails({ id: "agent-1", userId: 1 });

      expect(result).toBeNull();
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual(["agent-1", 1]);
    });

    it("returns agent with details and phone numbers for accessible team", async () => {
      setMemberships([10]);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            ...baseAgent,
            teamId: 10,
            user_id: 1,
            user_name: "U",
            user_email: "u@x",
            team_id: 10,
            team_name: "T",
            team_slug: "t",
          },
        ])
        .mockResolvedValueOnce([
          { id: 5, phoneNumber: "+5", subscriptionStatus: "ACTIVE", provider: "retell" },
        ]);

      const result = await repository.findByIdWithUserAccessAndDetails({
        id: "agent-1",
        userId: 1,
        teamId: 10,
      });

      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual(["agent-1", 10]);
      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[1]).values).toEqual(["agent-1"]);
      expect(result).toEqual({
        ...baseAgent,
        teamId: 10,
        user: { id: 1, name: "U", email: "u@x" },
        team: { id: 10, name: "T", slug: "t" },
        outboundPhoneNumbers: [
          { id: 5, phoneNumber: "+5", subscriptionStatus: "ACTIVE", provider: "retell" },
        ],
      });
    });

    it("falls back to personal condition for inaccessible team and nulls missing joins", async () => {
      setMemberships([20]);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ ...baseAgent, user_id: 1, team_id: 10 }])
        .mockResolvedValueOnce([]);

      const result = await repository.findByIdWithUserAccessAndDetails({
        id: "agent-1",
        userId: 1,
        teamId: 10,
      });

      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual(["agent-1", 1]);
      expect(result?.user).toEqual({ id: 1, name: null, email: null });
      expect(result?.team).toEqual({ id: 10, name: null, slug: null });
      expect(result?.outboundPhoneNumbers).toEqual([]);
    });

    it("uses team IN condition when no teamId is provided and user has teams", async () => {
      setMemberships([10, 20]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([baseAgent]).mockResolvedValueOnce([]);

      const result = await repository.findByIdWithUserAccessAndDetails({ id: "agent-1", userId: 1 });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('a."teamId" IN (');
      expect(values).toEqual(["agent-1", 1, 10, 20]);
      expect(result?.user).toBeNull();
      expect(result?.team).toBeNull();
    });
  });

  describe("create / delete / updates", () => {
    it("create passes data through", async () => {
      mockPrisma.agent.create.mockResolvedValue(baseAgent);

      const result = await repository.create({ name: "A", providerAgentId: "p", userId: 1, teamId: 2 });

      expect(result).toEqual(baseAgent);
      expect(mockPrisma.agent.create).toHaveBeenCalledWith({
        data: { name: "A", providerAgentId: "p", userId: 1, teamId: 2 },
      });
    });

    it("delete removes by id", async () => {
      mockPrisma.agent.delete.mockResolvedValue(baseAgent);

      await repository.delete({ id: "agent-1" });

      expect(mockPrisma.agent.delete).toHaveBeenCalledWith({ where: { id: "agent-1" } });
    });

    it("linkOutboundAgentToWorkflow sets agentId on workflow step", async () => {
      mockPrisma.workflowStep.update.mockResolvedValue({ id: 3 });

      await repository.linkOutboundAgentToWorkflow({ workflowStepId: 3, agentId: "agent-1" });

      expect(mockPrisma.workflowStep.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { agentId: "agent-1" },
      });
    });

    it("linkInboundAgentToWorkflow sets inboundAgentId on workflow step", async () => {
      mockPrisma.workflowStep.update.mockResolvedValue({ id: 3 });

      await repository.linkInboundAgentToWorkflow({ workflowStepId: 3, agentId: "agent-1" });

      expect(mockPrisma.workflowStep.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { inboundAgentId: "agent-1" },
      });
    });

    it("updateEventTypeId sets inboundEventTypeId", async () => {
      mockPrisma.agent.update.mockResolvedValue(baseAgent);

      await repository.updateEventTypeId({ agentId: "agent-1", eventTypeId: 9 });

      expect(mockPrisma.agent.update).toHaveBeenCalledWith({
        where: { id: "agent-1" },
        data: { inboundEventTypeId: 9 },
      });
    });

    it("updateOutboundEventTypeId sets outboundEventTypeId", async () => {
      mockPrisma.agent.update.mockResolvedValue(baseAgent);

      await repository.updateOutboundEventTypeId({ agentId: "agent-1", eventTypeId: 9 });

      expect(mockPrisma.agent.update).toHaveBeenCalledWith({
        where: { id: "agent-1" },
        data: { outboundEventTypeId: 9 },
      });
    });
  });

  describe("findByIdWithAdminAccess", () => {
    it("queries admin/owner memberships and scopes to the admin team", async () => {
      setMemberships([10]);
      mockPrisma.$queryRaw.mockResolvedValue([baseAgent]);

      const result = await repository.findByIdWithAdminAccess({ id: "agent-1", userId: 1, teamId: 10 });

      expect(result).toEqual(baseAgent);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: {
          userId: 1,
          accepted: true,
          role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
        },
        select: { teamId: true },
      });
      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual(["agent-1", 10]);
    });

    it("falls back to personal agents when not admin of requested team", async () => {
      setMemberships([20]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await repository.findByIdWithAdminAccess({ id: "agent-1", userId: 1, teamId: 10 });

      expect(result).toBeNull();
      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual(["agent-1", 1]);
    });

    it("includes all admin teams when no teamId given", async () => {
      setMemberships([10, 20]);
      mockPrisma.$queryRaw.mockResolvedValue([baseAgent]);

      await repository.findByIdWithAdminAccess({ id: "agent-1", userId: 1 });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('"teamId" IN (');
      expect(values).toEqual(["agent-1", 1, 10, 20]);
    });

    it("uses personal-only condition when user administers no teams", async () => {
      setMemberships([]);
      mockPrisma.$queryRaw.mockResolvedValue([baseAgent]);

      await repository.findByIdWithAdminAccess({ id: "agent-1", userId: 1 });

      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual(["agent-1", 1]);
    });
  });

  describe("findByIdWithCallAccess", () => {
    it("returns agent with phone numbers when accessible via team", async () => {
      setMemberships([10]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([baseAgent]).mockResolvedValueOnce([{ phoneNumber: "+1" }]);

      const result = await repository.findByIdWithCallAccess({ id: "agent-1", userId: 1 });

      const { text, values } = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('a."teamId" IN (');
      expect(values).toEqual(["agent-1", 1, 10]);
      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[1]).values).toEqual(["agent-1"]);
      expect(result).toEqual({ ...baseAgent, outboundPhoneNumbers: [{ phoneNumber: "+1" }] });
    });

    it("returns null and skips phone lookup when no agent found", async () => {
      setMemberships([]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await repository.findByIdWithCallAccess({ id: "agent-1", userId: 1 });

      expect(result).toBeNull();
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual(["agent-1", 1]);
    });
  });

  describe("canManageTeamResources", () => {
    it("returns true when an admin/owner membership exists", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(1) }]);

      const result = await repository.canManageTeamResources({ userId: 1, teamId: 10 });

      expect(result).toBe(true);
      expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0]).values).toEqual([1, 10]);
    });

    it("returns false when count is zero", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

      expect(await repository.canManageTeamResources({ userId: 1, teamId: 10 })).toBe(false);
    });
  });

  describe("findAgentWithPhoneNumbers / findProviderAgentIdById", () => {
    it("findAgentWithPhoneNumbers selects outbound phone numbers", async () => {
      const agent = { id: "agent-1", outboundPhoneNumbers: [] };
      mockPrisma.agent.findUnique.mockResolvedValue(agent);

      const result = await repository.findAgentWithPhoneNumbers("agent-1");

      expect(result).toEqual(agent);
      expect(mockPrisma.agent.findUnique).toHaveBeenCalledWith({
        where: { id: "agent-1" },
        select: {
          id: true,
          outboundPhoneNumbers: { select: { id: true, phoneNumber: true, subscriptionStatus: true } },
        },
      });
    });

    it("findProviderAgentIdById selects only providerAgentId", async () => {
      mockPrisma.agent.findUnique.mockResolvedValue({ providerAgentId: "p" });

      const result = await repository.findProviderAgentIdById("agent-1");

      expect(result).toEqual({ providerAgentId: "p" });
      expect(mockPrisma.agent.findUnique).toHaveBeenCalledWith({
        where: { id: "agent-1" },
        select: { providerAgentId: true },
      });
    });
  });
});
