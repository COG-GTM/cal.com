import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalAiPhoneNumberRepository } from "./CalAiPhoneNumberRepository";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@calcom/prisma", () => ({
  prisma: {
    calAiPhoneNumber: {
      findMany,
    },
  },
}));

describe("CalAiPhoneNumberRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserPhoneNumbers", () => {
    it("queries phone numbers by userId selecting only phoneNumber", async () => {
      findMany.mockResolvedValue([{ phoneNumber: "+111" }]);

      const result = await CalAiPhoneNumberRepository.getUserPhoneNumbers(7);

      expect(result).toEqual([{ phoneNumber: "+111" }]);
      expect(findMany).toHaveBeenCalledWith({
        where: { userId: 7 },
        select: { phoneNumber: true },
      });
    });
  });

  describe("getOrganizationTeamPhoneNumbers", () => {
    it("queries phone numbers of teams whose parent is the organization", async () => {
      findMany.mockResolvedValue([{ phoneNumber: "+222" }]);

      const result = await CalAiPhoneNumberRepository.getOrganizationTeamPhoneNumbers(42);

      expect(result).toEqual([{ phoneNumber: "+222" }]);
      expect(findMany).toHaveBeenCalledWith({
        where: { team: { parentId: 42 } },
        select: { phoneNumber: true },
      });
    });
  });

  describe("getTeamPhoneNumbers", () => {
    it("queries phone numbers for the given team ids", async () => {
      findMany.mockResolvedValue([{ phoneNumber: "+333" }]);

      const result = await CalAiPhoneNumberRepository.getTeamPhoneNumbers([1, 2]);

      expect(result).toEqual([{ phoneNumber: "+333" }]);
      expect(findMany).toHaveBeenCalledWith({
        where: { teamId: { in: [1, 2] } },
        select: { phoneNumber: true },
      });
    });
  });

  describe("getAccessiblePhoneNumbers", () => {
    it("returns only personal numbers when user is not org owner and has no admin teams", async () => {
      findMany.mockResolvedValueOnce([{ phoneNumber: "+111" }, { phoneNumber: "+112" }]);

      const result = await CalAiPhoneNumberRepository.getAccessiblePhoneNumbers({
        userId: 1,
        isOrgOwner: false,
        adminTeamIds: [],
      });

      expect(result).toEqual(["+111", "+112"]);
      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany).toHaveBeenCalledWith({ where: { userId: 1 }, select: { phoneNumber: true } });
    });

    it("includes organization team numbers when user is org owner with an organizationId", async () => {
      findMany
        .mockResolvedValueOnce([{ phoneNumber: "+111" }])
        .mockResolvedValueOnce([{ phoneNumber: "+222" }, { phoneNumber: "+111" }]);

      const result = await CalAiPhoneNumberRepository.getAccessiblePhoneNumbers({
        userId: 1,
        organizationId: 99,
        isOrgOwner: true,
        adminTeamIds: [5],
      });

      expect(result).toEqual(["+111", "+222"]);
      expect(findMany).toHaveBeenCalledTimes(2);
      expect(findMany).toHaveBeenNthCalledWith(2, {
        where: { team: { parentId: 99 } },
        select: { phoneNumber: true },
      });
    });

    it("falls back to admin team numbers when org owner has no organizationId", async () => {
      findMany
        .mockResolvedValueOnce([{ phoneNumber: "+111" }])
        .mockResolvedValueOnce([{ phoneNumber: "+333" }]);

      const result = await CalAiPhoneNumberRepository.getAccessiblePhoneNumbers({
        userId: 1,
        isOrgOwner: true,
        adminTeamIds: [5, 6],
      });

      expect(result).toEqual(["+111", "+333"]);
      expect(findMany).toHaveBeenNthCalledWith(2, {
        where: { teamId: { in: [5, 6] } },
        select: { phoneNumber: true },
      });
    });

    it("uses admin team numbers for non-owners with admin teams and dedupes results", async () => {
      findMany
        .mockResolvedValueOnce([{ phoneNumber: "+111" }])
        .mockResolvedValueOnce([{ phoneNumber: "+111" }, { phoneNumber: "+444" }]);

      const result = await CalAiPhoneNumberRepository.getAccessiblePhoneNumbers({
        userId: 1,
        organizationId: 99,
        isOrgOwner: false,
        adminTeamIds: [8],
      });

      expect(result).toEqual(["+111", "+444"]);
      expect(findMany).toHaveBeenNthCalledWith(2, {
        where: { teamId: { in: [8] } },
        select: { phoneNumber: true },
      });
    });
  });
});
