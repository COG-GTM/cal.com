import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it } from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { PrismaRoutingFormResponseRepository } from "./PrismaRoutingFormResponseRepository";

describe("PrismaRoutingFormResponseRepository", () => {
  let prismaMock: DeepMockProxy<PrismaClient>;
  let repository: PrismaRoutingFormResponseRepository;

  beforeEach(() => {
    prismaMock = mockDeep<PrismaClient>();
    repository = new PrismaRoutingFormResponseRepository(prismaMock);
  });

  describe("findByIdIncludeForm", () => {
    it("selects the response along with the form details", async () => {
      const response = { response: { "field-1": { value: "a" } }, form: { name: "Form" } };
      prismaMock.app_RoutingForms_FormResponse.findUnique.mockResolvedValue(response as never);

      await expect(repository.findByIdIncludeForm(1)).resolves.toEqual(response);

      expect(prismaMock.app_RoutingForms_FormResponse.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          response: true,
          form: {
            select: {
              fields: true,
              name: true,
              description: true,
              userId: true,
              teamId: true,
            },
          },
        },
      });
    });

    it("returns null when the response doesn't exist", async () => {
      prismaMock.app_RoutingForms_FormResponse.findUnique.mockResolvedValue(null as never);

      await expect(repository.findByIdIncludeForm(404)).resolves.toBeNull();
    });
  });

  describe("findByBookingUidIncludeForm", () => {
    it("looks the response up by the uid of the booking it routed to", async () => {
      const response = { id: 1, form: { fields: [] } };
      prismaMock.app_RoutingForms_FormResponse.findUnique.mockResolvedValue(response as never);

      await expect(repository.findByBookingUidIncludeForm("booking-uid")).resolves.toEqual(response);

      expect(prismaMock.app_RoutingForms_FormResponse.findUnique).toHaveBeenCalledWith({
        where: { routedToBookingUid: "booking-uid" },
        include: { form: { select: { fields: true } } },
      });
    });

    it("propagates prisma errors", async () => {
      prismaMock.app_RoutingForms_FormResponse.findUnique.mockRejectedValue(new Error("db down"));

      await expect(repository.findByBookingUidIncludeForm("booking-uid")).rejects.toThrow("db down");
    });
  });
});
