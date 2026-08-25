import type { PrismaClient } from "@calcom/prisma";
import { OAuthClientStatus } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import { OAuthClientRepository } from "./OAuthClientRepository";

const prismaMock = mockDeep<PrismaClient>();

const buildClient = (overrides: Record<string, unknown> = {}) => ({
  clientId: "client-1",
  clientSecret: "hashed-secret",
  name: "My app",
  purpose: "Testing",
  redirectUri: "https://example.com/callback",
  logo: null,
  websiteUrl: null,
  rejectionReason: null,
  clientType: "CONFIDENTIAL",
  isTrusted: false,
  status: OAuthClientStatus.APPROVED,
  userId: 1,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  ...overrides,
});

describe("OAuthClientRepository", () => {
  let repository: OAuthClientRepository;

  beforeEach(() => {
    mockReset(prismaMock);
    repository = new OAuthClientRepository(prismaMock);
  });

  describe("findByClientId", () => {
    it("queries by clientId without exposing the client secret", async () => {
      const client = buildClient();
      prismaMock.oAuthClient.findFirst.mockResolvedValue(client);

      const result = await repository.findByClientId("client-1");

      expect(result).toBe(client);
      const args = prismaMock.oAuthClient.findFirst.mock.calls[0][0];
      expect(args?.where).toEqual({ clientId: "client-1" });
      expect(args?.select).not.toHaveProperty("clientSecret");
    });

    it("returns null for an unknown client", async () => {
      prismaMock.oAuthClient.findFirst.mockResolvedValue(null);

      await expect(repository.findByClientId("nope")).resolves.toBeNull();
    });
  });

  describe("findByClientIdWithSecret", () => {
    it("selects the client secret for credential validation", async () => {
      prismaMock.oAuthClient.findUnique.mockResolvedValue(buildClient());

      await repository.findByClientIdWithSecret("client-1");

      const args = prismaMock.oAuthClient.findUnique.mock.calls[0][0];
      expect(args?.where).toEqual({ clientId: "client-1" });
      expect(args?.select).toMatchObject({ clientSecret: true });
    });
  });

  describe("findByClientIdIncludeUser", () => {
    it("selects a limited set of user fields", async () => {
      prismaMock.oAuthClient.findUnique.mockResolvedValue(buildClient());

      await repository.findByClientIdIncludeUser("client-1");

      const args = prismaMock.oAuthClient.findUnique.mock.calls[0][0];
      expect(args?.select?.user).toEqual({ select: { id: true, email: true, name: true } });
      expect(args?.select).not.toHaveProperty("clientSecret");
    });
  });

  describe("list queries", () => {
    beforeEach(() => {
      prismaMock.oAuthClient.findMany.mockResolvedValue([]);
    });

    it("findByUserId filters by user and orders by newest first", async () => {
      await repository.findByUserId(5);

      const args = prismaMock.oAuthClient.findMany.mock.calls[0][0];
      expect(args?.where).toEqual({ userId: 5 });
      expect(args?.orderBy).toEqual({ createdAt: "desc" });
    });

    it("findByUserIdAndStatus filters by user and status", async () => {
      await repository.findByUserIdAndStatus(5, OAuthClientStatus.PENDING);

      const args = prismaMock.oAuthClient.findMany.mock.calls[0][0];
      expect(args?.where).toEqual({ userId: 5, status: OAuthClientStatus.PENDING });
    });

    it("findAll returns every client with its owner", async () => {
      await repository.findAll();

      const args = prismaMock.oAuthClient.findMany.mock.calls[0][0];
      expect(args?.where).toBeUndefined();
      expect(args?.select?.user).toEqual({ select: { id: true, email: true, name: true } });
    });

    it("findByStatus filters by status", async () => {
      await repository.findByStatus(OAuthClientStatus.REJECTED);

      const args = prismaMock.oAuthClient.findMany.mock.calls[0][0];
      expect(args?.where).toEqual({ status: OAuthClientStatus.REJECTED });
    });
  });

  describe("create", () => {
    it("generates a 32 byte hex clientId and marks pkce clients as PUBLIC", async () => {
      prismaMock.oAuthClient.create.mockImplementation(
        // biome-ignore lint/suspicious/noExplicitAny: prisma mock passthrough
        (async ({ data }: any) => buildClient({ ...data, clientType: data.clientType })) as never
      );

      const result = await repository.create({
        name: "My app",
        purpose: "Testing",
        redirectUri: "https://example.com/callback",
        enablePkce: true,
        userId: 3,
        status: OAuthClientStatus.PENDING,
      });

      const args = prismaMock.oAuthClient.create.mock.calls[0][0];
      expect(args?.data.clientId).toMatch(/^[0-9a-f]{64}$/);
      expect(args?.data.clientType).toBe("PUBLIC");
      expect(args?.data.user).toEqual({ connect: { id: 3 } });
      expect(result).toMatchObject({ isPkceEnabled: true, name: "My app" });
    });

    it("creates a CONFIDENTIAL client without a user connection when userId is absent", async () => {
      prismaMock.oAuthClient.create.mockResolvedValue(buildClient());

      const result = await repository.create({
        name: "My app",
        purpose: "Testing",
        redirectUri: "https://example.com/callback",
        clientSecret: "hashed-secret",
        status: OAuthClientStatus.APPROVED,
      });

      const args = prismaMock.oAuthClient.create.mock.calls[0][0];
      expect(args?.data.clientType).toBe("CONFIDENTIAL");
      expect(args?.data).not.toHaveProperty("user");
      expect(result.isPkceEnabled).toBeUndefined();
      expect(result.clientSecret).toBe("hashed-secret");
    });
  });

  describe("mutations", () => {
    it("updateStatus updates only the status", async () => {
      prismaMock.oAuthClient.update.mockResolvedValue(buildClient());

      await repository.updateStatus("client-1", OAuthClientStatus.APPROVED);

      expect(prismaMock.oAuthClient.update).toHaveBeenCalledWith({
        where: { clientId: "client-1" },
        data: { status: OAuthClientStatus.APPROVED },
      });
    });

    it("update passes through the provided fields", async () => {
      prismaMock.oAuthClient.update.mockResolvedValue(buildClient());

      await repository.update("client-1", { name: "Renamed" });

      expect(prismaMock.oAuthClient.update).toHaveBeenCalledWith({
        where: { clientId: "client-1" },
        data: { name: "Renamed" },
      });
    });

    it("delete removes the client", async () => {
      prismaMock.oAuthClient.delete.mockResolvedValue(buildClient());

      await repository.delete("client-1");

      expect(prismaMock.oAuthClient.delete).toHaveBeenCalledWith({ where: { clientId: "client-1" } });
    });
  });
});
