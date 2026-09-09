import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import type { User } from "@calcom/prisma/client";
import { captureException } from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsersRepository } from "./users.repository";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const captureExceptionMock = vi.mocked(captureException);

describe("UsersRepository", () => {
  const repository = new UsersRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("updateLastActiveAt", () => {
    it("stamps the current time on the user", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-05-01T12:00:00.000Z"));
      const user = { id: 1 } as User;
      prismaMock.user.update.mockResolvedValue(user);

      const result = await repository.updateLastActiveAt(1);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { lastActiveAt: new Date("2024-05-01T12:00:00.000Z") },
      });
      expect(result).toBe(user);
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it("reports the error to sentry and rethrows it", async () => {
      const error = new Error("db down");
      prismaMock.user.update.mockRejectedValue(error);

      await expect(repository.updateLastActiveAt(1)).rejects.toThrow(error);
      expect(captureExceptionMock).toHaveBeenCalledWith(error);
    });
  });

  describe("findUserTeams", () => {
    it("selects only the team ids of the user", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ teams: [{ teamId: 3 }] } as unknown as User);

      const result = await repository.findUserTeams(1);

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { teams: { select: { teamId: true } } },
      });
      expect(result).toEqual({ teams: [{ teamId: 3 }] });
    });

    it("returns null when the user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      expect(await repository.findUserTeams(1)).toBeNull();
    });

    it("reports the error to sentry and rethrows it", async () => {
      const error = new Error("db down");
      prismaMock.user.findUnique.mockRejectedValue(error);

      await expect(repository.findUserTeams(1)).rejects.toThrow(error);
      expect(captureExceptionMock).toHaveBeenCalledWith(error);
    });
  });
});
