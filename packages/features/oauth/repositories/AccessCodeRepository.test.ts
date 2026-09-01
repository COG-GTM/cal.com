import type { PrismaClient } from "@calcom/prisma";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessCodeRepository } from "./AccessCodeRepository";

const prismaMock = {
  accessCode: {
    create: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
} as unknown as PrismaClient;

describe("AccessCodeRepository", () => {
  const repository = new AccessCodeRepository(prismaMock);
  const now = new Date("2024-01-01T00:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an access code with a ten-minute expiry", async () => {
    await repository.create({
      code: "auth-code",
      clientId: "client-id",
      userId: 7,
      teamId: 3,
      scopes: ["READ_BOOKING"],
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
    });

    expect(prismaMock.accessCode.create).toHaveBeenCalledWith({
      data: {
        code: "auth-code",
        clientId: "client-id",
        userId: 7,
        teamId: 3,
        expiresAt: new Date("2024-01-01T00:10:00.000Z"),
        scopes: ["READ_BOOKING"],
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
      },
    });
  });

  it("finds a valid access code", async () => {
    const accessCode = {
      userId: 7,
      teamId: null,
      scopes: ["READ_PROFILE"],
      codeChallenge: null,
      codeChallengeMethod: null,
    };
    vi.mocked(prismaMock.accessCode.findFirst).mockResolvedValue(accessCode);

    await expect(repository.findValidCode("auth-code", "client-id")).resolves.toBe(accessCode);
    expect(prismaMock.accessCode.findFirst).toHaveBeenCalledWith({
      where: {
        code: "auth-code",
        clientId: "client-id",
        expiresAt: { gt: now },
      },
      select: {
        userId: true,
        teamId: true,
        scopes: true,
        codeChallenge: true,
        codeChallengeMethod: true,
      },
    });
  });

  it("deletes expired and used access codes", async () => {
    await repository.deleteExpiredAndUsedCodes("auth-code", "client-id");

    expect(prismaMock.accessCode.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ expiresAt: { lt: now } }, { code: "auth-code", clientId: "client-id" }],
      },
    });
  });
});
