import type { PrismaClient } from "@calcom/prisma";
import { OAuthClientStatus } from "@calcom/prisma/enums";
import { describe, expect, it, vi } from "vitest";
import { OAuthClientRepository } from "./OAuthClientRepository";

const prismaMock = {
  oAuthClient: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
} as unknown as PrismaClient;

describe("OAuthClientRepository", () => {
  const repository = new OAuthClientRepository(prismaMock);

  it("finds a client by client ID", async () => {
    const result = { clientId: "client-id" };
    vi.mocked(prismaMock.oAuthClient.findFirst).mockResolvedValue(result);

    await expect(repository.findByClientId("client-id")).resolves.toBe(result);
    expect(prismaMock.oAuthClient.findFirst).toHaveBeenCalledWith({
      where: { clientId: "client-id" },
      select: {
        redirectUri: true,
        clientType: true,
        name: true,
        purpose: true,
        logo: true,
        clientId: true,
        isTrusted: true,
        websiteUrl: true,
        rejectionReason: true,
        status: true,
        userId: true,
        createdAt: true,
      },
    });
  });

  it("finds a client with its secret", async () => {
    const result = { clientId: "client-id", clientSecret: "secret" };
    vi.mocked(prismaMock.oAuthClient.findUnique).mockResolvedValue(result);

    await expect(repository.findByClientIdWithSecret("client-id")).resolves.toBe(result);
    expect(prismaMock.oAuthClient.findUnique).toHaveBeenCalledWith({
      where: { clientId: "client-id" },
      select: {
        clientId: true,
        redirectUri: true,
        clientSecret: true,
        clientType: true,
        status: true,
        userId: true,
      },
    });
  });

  it("finds a client with its user", async () => {
    const result = { clientId: "client-id", user: { id: 1 } };
    vi.mocked(prismaMock.oAuthClient.findUnique).mockResolvedValue(result);

    await expect(repository.findByClientIdIncludeUser("client-id")).resolves.toBe(result);
    expect(prismaMock.oAuthClient.findUnique).toHaveBeenCalledWith({
      where: { clientId: "client-id" },
      select: {
        clientId: true,
        redirectUri: true,
        clientType: true,
        name: true,
        purpose: true,
        logo: true,
        websiteUrl: true,
        rejectionReason: true,
        isTrusted: true,
        status: true,
        userId: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });
  });

  it("finds clients by user ID", async () => {
    const result = [{ clientId: "client-id" }];
    vi.mocked(prismaMock.oAuthClient.findMany).mockResolvedValue(result);

    await expect(repository.findByUserId(7)).resolves.toBe(result);
    expect(prismaMock.oAuthClient.findMany).toHaveBeenCalledWith({
      where: { userId: 7 },
      select: {
        clientId: true,
        redirectUri: true,
        name: true,
        purpose: true,
        logo: true,
        websiteUrl: true,
        rejectionReason: true,
        clientType: true,
        status: true,
        userId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });

  it("finds clients by user ID and status", async () => {
    const result = [{ clientId: "client-id" }];
    vi.mocked(prismaMock.oAuthClient.findMany).mockResolvedValue(result);

    await expect(repository.findByUserIdAndStatus(7, OAuthClientStatus.PENDING)).resolves.toBe(result);
    expect(prismaMock.oAuthClient.findMany).toHaveBeenCalledWith({
      where: { userId: 7, status: OAuthClientStatus.PENDING },
      orderBy: { createdAt: "desc" },
    });
  });

  it("finds all clients", async () => {
    const result = [{ clientId: "client-id" }];
    vi.mocked(prismaMock.oAuthClient.findMany).mockResolvedValue(result);

    await expect(repository.findAll()).resolves.toBe(result);
    expect(prismaMock.oAuthClient.findMany).toHaveBeenCalledWith({
      select: {
        clientId: true,
        redirectUri: true,
        name: true,
        purpose: true,
        logo: true,
        websiteUrl: true,
        rejectionReason: true,
        clientType: true,
        status: true,
        userId: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  it("finds clients by status", async () => {
    const result = [{ clientId: "client-id" }];
    vi.mocked(prismaMock.oAuthClient.findMany).mockResolvedValue(result);

    await expect(repository.findByStatus(OAuthClientStatus.APPROVED)).resolves.toBe(result);
    expect(prismaMock.oAuthClient.findMany).toHaveBeenCalledWith({
      where: { status: OAuthClientStatus.APPROVED },
      select: {
        clientId: true,
        redirectUri: true,
        name: true,
        purpose: true,
        logo: true,
        websiteUrl: true,
        rejectionReason: true,
        clientType: true,
        status: true,
        userId: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  it.each([
    { enablePkce: true, clientType: "PUBLIC" },
    { enablePkce: false, clientType: "CONFIDENTIAL" },
    { enablePkce: undefined, clientType: "CONFIDENTIAL" },
  ])("creates a $clientType client", async ({ enablePkce, clientType }) => {
    const result = {
      clientId: "created-client",
      name: "App",
      purpose: "Testing",
      redirectUri: "https://app.test/callback",
      logo: null,
      clientType,
      clientSecret: "hashed",
      status: OAuthClientStatus.PENDING,
    };
    vi.mocked(prismaMock.oAuthClient.create).mockResolvedValue(result);

    await expect(
      repository.create({
        name: "App",
        purpose: "Testing",
        redirectUri: "https://app.test/callback",
        clientSecret: "hashed",
        logo: "logo",
        websiteUrl: "https://app.test",
        enablePkce,
        status: OAuthClientStatus.PENDING,
      })
    ).resolves.toEqual({ ...result, isPkceEnabled: enablePkce });

    expect(prismaMock.oAuthClient.create).toHaveBeenCalledWith({
      data: {
        name: "App",
        purpose: "Testing",
        redirectUri: "https://app.test/callback",
        clientId: expect.stringMatching(/^[0-9a-f]{64}$/),
        clientType,
        logo: "logo",
        websiteUrl: "https://app.test",
        status: OAuthClientStatus.PENDING,
        clientSecret: "hashed",
      },
    });
  });

  it("connects a user when creating a client for one", async () => {
    vi.mocked(prismaMock.oAuthClient.create).mockResolvedValue({
      clientId: "created-client",
      name: "App",
      purpose: "Testing",
      redirectUri: "https://app.test/callback",
      logo: null,
      clientType: "CONFIDENTIAL",
      clientSecret: null,
      status: OAuthClientStatus.APPROVED,
    });

    await repository.create({
      name: "App",
      purpose: "Testing",
      redirectUri: "https://app.test/callback",
      userId: 7,
      status: OAuthClientStatus.APPROVED,
    });

    expect(prismaMock.oAuthClient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ user: { connect: { id: 7 } } }),
    });
  });

  it("does not add a user relation without a user ID", async () => {
    vi.mocked(prismaMock.oAuthClient.create).mockResolvedValue({
      clientId: "created-client",
      name: "App",
      purpose: "Testing",
      redirectUri: "https://app.test/callback",
      logo: null,
      clientType: "CONFIDENTIAL",
      clientSecret: null,
      status: OAuthClientStatus.APPROVED,
    });

    await repository.create({
      name: "App",
      purpose: "Testing",
      redirectUri: "https://app.test/callback",
      status: OAuthClientStatus.APPROVED,
    });

    const data = vi.mocked(prismaMock.oAuthClient.create).mock.calls[0][0].data;
    expect("user" in data).toBe(false);
  });

  it("updates a client status", async () => {
    const result = { clientId: "client-id", status: OAuthClientStatus.APPROVED };
    vi.mocked(prismaMock.oAuthClient.update).mockResolvedValue(result);

    await expect(repository.updateStatus("client-id", OAuthClientStatus.APPROVED)).resolves.toBe(result);
    expect(prismaMock.oAuthClient.update).toHaveBeenCalledWith({
      where: { clientId: "client-id" },
      data: { status: OAuthClientStatus.APPROVED },
    });
  });

  it("updates client details", async () => {
    const data = { name: "Updated", logo: "new-logo" };
    const result = { clientId: "client-id", ...data };
    vi.mocked(prismaMock.oAuthClient.update).mockResolvedValue(result);

    await expect(repository.update("client-id", data)).resolves.toBe(result);
    expect(prismaMock.oAuthClient.update).toHaveBeenCalledWith({
      where: { clientId: "client-id" },
      data,
    });
  });

  it("deletes a client", async () => {
    const result = { clientId: "client-id" };
    vi.mocked(prismaMock.oAuthClient.delete).mockResolvedValue(result);

    await expect(repository.delete("client-id")).resolves.toBe(result);
    expect(prismaMock.oAuthClient.delete).toHaveBeenCalledWith({ where: { clientId: "client-id" } });
  });
});
