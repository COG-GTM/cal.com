import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it } from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { RoutingFormResponseRepository } from "./RoutingFormResponseRepository";

describe("RoutingFormResponseRepository", () => {
  let prismaMock: DeepMockProxy<PrismaClient>;
  let repository: RoutingFormResponseRepository;

  beforeEach(() => {
    prismaMock = mockDeep<PrismaClient>();
    repository = new RoutingFormResponseRepository(prismaMock);
  });

  describe("recordFormResponse", () => {
    it("creates the response without connecting a queued response", async () => {
      prismaMock.app_RoutingForms_FormResponse.create.mockResolvedValue({ id: 1 } as never);

      const result = await repository.recordFormResponse({
        formId: "form-1",
        response: { "field-1": { value: "a" } },
        chosenRouteId: "route-1",
      });

      expect(result).toEqual({ id: 1 });
      expect(prismaMock.app_RoutingForms_FormResponse.create).toHaveBeenCalledWith({
        data: {
          formId: "form-1",
          response: { "field-1": { value: "a" } },
          chosenRouteId: "route-1",
        },
      });
    });

    it("connects the queued response when its id is provided", async () => {
      prismaMock.app_RoutingForms_FormResponse.create.mockResolvedValue({ id: 2 } as never);

      await repository.recordFormResponse({
        formId: "form-1",
        response: {},
        chosenRouteId: null,
        queuedFormResponseId: "queued-1",
      });

      expect(prismaMock.app_RoutingForms_FormResponse.create).toHaveBeenCalledWith({
        data: {
          formId: "form-1",
          response: {},
          chosenRouteId: null,
          queuedFormResponse: { connect: { id: "queued-1" } },
        },
      });
    });

    it("ignores a null queued response id", async () => {
      prismaMock.app_RoutingForms_FormResponse.create.mockResolvedValue({ id: 3 } as never);

      await repository.recordFormResponse({
        formId: "form-1",
        response: {},
        chosenRouteId: null,
        queuedFormResponseId: null,
      });

      expect(prismaMock.app_RoutingForms_FormResponse.create).toHaveBeenCalledWith({
        data: { formId: "form-1", response: {}, chosenRouteId: null },
      });
    });
  });

  describe("recordQueuedFormResponse", () => {
    it("stores the fallback action when it is provided", async () => {
      prismaMock.app_RoutingForms_QueuedFormResponse.create.mockResolvedValue({ id: "queued-1" } as never);

      const result = await repository.recordQueuedFormResponse({
        formId: "form-1",
        response: { "field-1": { value: "a" } },
        chosenRouteId: "route-1",
        fallbackAction: { type: "customPageMessage" },
      });

      expect(result).toEqual({ id: "queued-1" });
      expect(prismaMock.app_RoutingForms_QueuedFormResponse.create).toHaveBeenCalledWith({
        data: {
          formId: "form-1",
          response: { "field-1": { value: "a" } },
          chosenRouteId: "route-1",
          fallbackAction: { type: "customPageMessage" },
        },
      });
    });

    it("omits the fallback action when it is null", async () => {
      prismaMock.app_RoutingForms_QueuedFormResponse.create.mockResolvedValue({ id: "queued-2" } as never);

      await repository.recordQueuedFormResponse({
        formId: "form-1",
        response: {},
        chosenRouteId: null,
        fallbackAction: null,
      });

      expect(prismaMock.app_RoutingForms_QueuedFormResponse.create).toHaveBeenCalledWith({
        data: { formId: "form-1", response: {}, chosenRouteId: null },
      });
    });
  });

  describe("findFormResponseIncludeForm", () => {
    it("selects the response with the routes and fields of its form", async () => {
      const found = { response: {}, form: { routes: [], fields: [] }, chosenRouteId: null };
      prismaMock.app_RoutingForms_FormResponse.findUnique.mockResolvedValue(found as never);

      await expect(repository.findFormResponseIncludeForm({ routingFormResponseId: 5 })).resolves.toEqual(
        found
      );

      expect(prismaMock.app_RoutingForms_FormResponse.findUnique).toHaveBeenCalledWith({
        where: { id: 5 },
        select: {
          response: true,
          form: { select: { routes: true, fields: true } },
          chosenRouteId: true,
        },
      });
    });
  });

  describe("findQueuedFormResponseIncludeForm", () => {
    it("looks the queued response up by its string id", async () => {
      prismaMock.app_RoutingForms_QueuedFormResponse.findUnique.mockResolvedValue(null as never);

      await expect(
        repository.findQueuedFormResponseIncludeForm({ queuedFormResponseId: "queued-1" })
      ).resolves.toBeNull();

      expect(prismaMock.app_RoutingForms_QueuedFormResponse.findUnique).toHaveBeenCalledWith({
        where: { id: "queued-1" },
        select: {
          response: true,
          form: { select: { routes: true, fields: true } },
          chosenRouteId: true,
        },
      });
    });
  });

  describe("getQueuedFormResponseFromId", () => {
    it("selects the queued response together with the form owner details", async () => {
      prismaMock.app_RoutingForms_QueuedFormResponse.findUnique.mockResolvedValue({
        id: "queued-1",
      } as never);

      await expect(repository.getQueuedFormResponseFromId("queued-1")).resolves.toEqual({ id: "queued-1" });

      const callArgs = prismaMock.app_RoutingForms_QueuedFormResponse.findUnique.mock.calls[0][0];
      expect(callArgs.where).toEqual({ id: "queued-1" });
      expect(callArgs.select).toMatchObject({
        id: true,
        formId: true,
        response: true,
        chosenRouteId: true,
        fallbackAction: true,
        actualResponseId: true,
        form: {
          select: {
            team: { select: { parentId: true } },
            user: { select: { id: true, email: true, timeFormat: true, locale: true } },
          },
        },
      });
    });
  });

  describe("findAllResponsesWithBooking", () => {
    it("excludes the given response and only returns responses that routed to a booking", async () => {
      prismaMock.app_RoutingForms_FormResponse.findMany.mockResolvedValue([{ id: 2, response: {} }] as never);

      const createdAfter = new Date("2024-01-01T00:00:00.000Z");
      const createdBefore = new Date("2024-01-02T00:00:00.000Z");

      const result = await repository.findAllResponsesWithBooking({
        formId: "form-1",
        responseId: 1,
        createdAfter,
        createdBefore,
      });

      expect(result).toEqual([{ id: 2, response: {} }]);
      expect(prismaMock.app_RoutingForms_FormResponse.findMany).toHaveBeenCalledWith({
        where: {
          formId: "form-1",
          createdAt: { gte: createdAfter, lt: createdBefore },
          routedToBookingUid: { not: null },
          NOT: { id: 1 },
        },
        select: { id: true, response: true },
      });
    });
  });
});
