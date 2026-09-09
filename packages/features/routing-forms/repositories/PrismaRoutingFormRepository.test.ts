import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaRoutingFormRepository } from "./PrismaRoutingFormRepository";

const { findUniqueMock, findManyMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {
    app_RoutingForms_Form: {
      findUnique: findUniqueMock,
      findMany: findManyMock,
    },
  },
}));

describe("PrismaRoutingFormRepository", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    findManyMock.mockReset();
  });

  describe("findById", () => {
    it("uses the default select when no select is provided", async () => {
      findUniqueMock.mockResolvedValue({ id: "form-1" });

      await expect(PrismaRoutingFormRepository.findById("form-1")).resolves.toEqual({ id: "form-1" });

      const args = findUniqueMock.mock.calls[0][0];
      expect(args.where).toEqual({ id: "form-1" });
      expect(args.select).toMatchObject({
        id: true,
        routes: true,
        fields: true,
        userId: true,
        teamId: true,
        disabled: true,
        settings: true,
      });
    });

    it("uses the provided select", async () => {
      findUniqueMock.mockResolvedValue({ id: "form-1" });

      await PrismaRoutingFormRepository.findById("form-1", { select: { id: true, name: true } });

      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { id: "form-1" },
        select: { id: true, name: true },
      });
    });

    it("returns null when the form doesn't exist", async () => {
      findUniqueMock.mockResolvedValue(null);

      await expect(PrismaRoutingFormRepository.findById("missing")).resolves.toBeNull();
    });
  });

  describe("findActiveFormsForUserOrTeam", () => {
    it("returns an empty list when neither a user nor a team is given", async () => {
      await expect(PrismaRoutingFormRepository.findActiveFormsForUserOrTeam({})).resolves.toEqual([]);

      expect(findManyMock).not.toHaveBeenCalled();
    });

    it("returns the enabled team forms the user is an accepted member of", async () => {
      findManyMock.mockResolvedValue([{ id: "form-1", name: "A" }]);

      await expect(
        PrismaRoutingFormRepository.findActiveFormsForUserOrTeam({ userId: 1, teamId: 2 })
      ).resolves.toEqual([{ id: "form-1", name: "A" }]);

      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          teamId: 2,
          disabled: false,
          team: { members: { some: { userId: 1, accepted: true } } },
        },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }],
      });
    });

    it("returns only the personal forms when just a user is given", async () => {
      findManyMock.mockResolvedValue([]);

      await PrismaRoutingFormRepository.findActiveFormsForUserOrTeam({ userId: 1 });

      expect(findManyMock).toHaveBeenCalledWith({
        where: { userId: 1, teamId: null, disabled: false },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }],
      });
    });

    it("queries the team forms even when no user is given", async () => {
      findManyMock.mockResolvedValue([]);

      await PrismaRoutingFormRepository.findActiveFormsForUserOrTeam({ teamId: 2 });

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ teamId: 2, disabled: false }),
        })
      );
    });
  });

  describe("findFormByIdIncludeUserTeamAndOrg", () => {
    it("includes the user, its organization and the team hierarchy", async () => {
      findUniqueMock.mockResolvedValue({ id: "form-1" });

      await expect(PrismaRoutingFormRepository.findFormByIdIncludeUserTeamAndOrg("form-1")).resolves.toEqual({
        id: "form-1",
      });

      const args = findUniqueMock.mock.calls[0][0];
      expect(args.where).toEqual({ id: "form-1" });
      expect(args.include.user.select).toMatchObject({
        id: true,
        username: true,
        email: true,
        movedToProfileId: true,
        organization: { select: { slug: true } },
      });
      expect(args.include.team.select).toMatchObject({
        parentId: true,
        parent: { select: { slug: true } },
        slug: true,
        metadata: true,
      });
    });

    it("returns null when the form doesn't exist", async () => {
      findUniqueMock.mockResolvedValue(null);

      await expect(
        PrismaRoutingFormRepository.findFormByIdIncludeUserTeamAndOrg("missing")
      ).resolves.toBeNull();
    });
  });
});
