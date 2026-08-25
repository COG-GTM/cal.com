import type { PrismaClient } from "@calcom/prisma";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import { AccessCodeRepository } from "./AccessCodeRepository";

const prismaMock = mockDeep<PrismaClient>();

describe("AccessCodeRepository", () => {
  let repository: AccessCodeRepository;

  beforeEach(() => {
    mockReset(prismaMock);
    repository = new AccessCodeRepository(prismaMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("create", () => {
    it("persists the code with a 10 minute expiry", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));

      await repository.create({
        code: "code-1",
        clientId: "client-1",
        userId: 7,
        scopes: ["READ_BOOKING"],
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
      });

      expect(prismaMock.accessCode.create).toHaveBeenCalledWith({
        data: {
          code: "code-1",
          clientId: "client-1",
          userId: 7,
          teamId: undefined,
          expiresAt: new Date("2024-01-01T00:10:00.000Z"),
          scopes: ["READ_BOOKING"],
          codeChallenge: "challenge",
          codeChallengeMethod: "S256",
        },
      });
    });

    it("supports team scoped codes without pkce", async () => {
      await repository.create({
        code: "code-2",
        clientId: "client-1",
        teamId: 42,
        scopes: ["READ_PROFILE"],
      });

      expect(prismaMock.accessCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            teamId: 42,
            userId: undefined,
            codeChallenge: undefined,
            codeChallengeMethod: undefined,
          }),
        })
      );
    });
  });

  describe("findValidCode", () => {
    it("only looks up unexpired codes for the client and returns the match", async () => {
      const accessCode = {
        userId: 7,
        teamId: null,
        scopes: ["READ_BOOKING"],
        codeChallenge: null,
        codeChallengeMethod: null,
      };
      prismaMock.accessCode.findFirst.mockResolvedValue(accessCode);

      const result = await repository.findValidCode("code-1", "client-1");

      expect(result).toBe(accessCode);
      const args = prismaMock.accessCode.findFirst.mock.calls[0][0];
      expect(args?.where).toMatchObject({ code: "code-1", clientId: "client-1" });
      expect(args?.where?.expiresAt).toEqual({ gt: expect.any(Date) });
      expect(args?.select).toEqual({
        userId: true,
        teamId: true,
        scopes: true,
        codeChallenge: true,
        codeChallengeMethod: true,
      });
    });

    it("returns null when there is no valid code", async () => {
      prismaMock.accessCode.findFirst.mockResolvedValue(null);

      await expect(repository.findValidCode("code-1", "client-1")).resolves.toBeNull();
    });
  });

  describe("deleteExpiredAndUsedCodes", () => {
    it("deletes expired codes and the used code", async () => {
      await repository.deleteExpiredAndUsedCodes("code-1", "client-1");

      const args = prismaMock.accessCode.deleteMany.mock.calls[0][0];
      expect(args?.where?.OR?.[0]).toEqual({ expiresAt: { lt: expect.any(Date) } });
      expect(args?.where?.OR?.[1]).toEqual({ code: "code-1", clientId: "client-1" });
    });
  });
});
