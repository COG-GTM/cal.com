import { prisma } from "@calcom/prisma/__mocks__/prisma";
import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DestinationCalendarRepository } from "./DestinationCalendarRepository";

vi.mock("@calcom/prisma", () => ({
  prisma,
  default: prisma,
}));

describe("DestinationCalendarRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("instance methods", () => {
    it("returns the custom reminder for a credential", async () => {
      prisma.destinationCalendar.findFirst.mockResolvedValue({ customCalendarReminder: 15 });

      const repository = new DestinationCalendarRepository(prisma as unknown as PrismaClient);

      await expect(repository.getCustomReminderByCredentialId(1)).resolves.toBe(15);
      expect(prisma.destinationCalendar.findFirst).toHaveBeenCalledWith({
        where: { credentialId: 1 },
        select: { customCalendarReminder: true },
      });
    });

    it("returns null when no destination calendar or reminder exists", async () => {
      prisma.destinationCalendar.findFirst.mockResolvedValue(null);
      const repository = new DestinationCalendarRepository(prisma as unknown as PrismaClient);

      await expect(repository.getCustomReminderByCredentialId(2)).resolves.toBeNull();

      prisma.destinationCalendar.findFirst.mockResolvedValue({ customCalendarReminder: null });
      await expect(repository.getCustomReminderByCredentialId(2)).resolves.toBeNull();
    });

    it("falls back to the default prisma client when none is injected", async () => {
      prisma.destinationCalendar.findFirst.mockResolvedValue({ customCalendarReminder: 5 });

      await expect(new DestinationCalendarRepository().getCustomReminderByCredentialId(3)).resolves.toBe(5);
    });

    it("updates the custom reminder scoped to user, credential and integration", async () => {
      prisma.destinationCalendar.updateMany.mockResolvedValue({ count: 1 });
      const repository = new DestinationCalendarRepository(prisma as unknown as PrismaClient);

      await repository.updateCustomReminder({
        userId: 1,
        credentialId: 2,
        integration: "google_calendar",
        customCalendarReminder: 30,
      });

      expect(prisma.destinationCalendar.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, credentialId: 2, integration: "google_calendar" },
        data: { customCalendarReminder: 30 },
      });
    });
  });

  describe("static queries", () => {
    it("creates a destination calendar", async () => {
      prisma.destinationCalendar.create.mockResolvedValue({ id: 1 });

      await DestinationCalendarRepository.create({ integration: "google_calendar", externalId: "a" });

      expect(prisma.destinationCalendar.create).toHaveBeenCalledWith({
        data: { integration: "google_calendar", externalId: "a" },
      });
    });

    it("looks up by user id, event type id and arbitrary where clauses", async () => {
      prisma.destinationCalendar.findFirst.mockResolvedValue(null);

      await DestinationCalendarRepository.getByUserId(1);
      expect(prisma.destinationCalendar.findFirst).toHaveBeenCalledWith({ where: { userId: 1 } });

      await DestinationCalendarRepository.getByEventTypeId(2);
      expect(prisma.destinationCalendar.findFirst).toHaveBeenCalledWith({ where: { eventTypeId: 2 } });

      await DestinationCalendarRepository.find({ where: { externalId: "a" } });
      expect(prisma.destinationCalendar.findFirst).toHaveBeenCalledWith({ where: { externalId: "a" } });
    });
  });

  describe("createIfNotExistsForUser", () => {
    const data = { userId: 1, integration: "google_calendar", externalId: "a@example.com" };

    it("returns the conflicting user level calendar without creating a new one", async () => {
      const conflicting = { id: 9, ...data };
      prisma.destinationCalendar.findFirst.mockResolvedValue(conflicting);

      await expect(DestinationCalendarRepository.createIfNotExistsForUser(data)).resolves.toBe(conflicting);
      expect(prisma.destinationCalendar.findFirst).toHaveBeenCalledWith({
        where: { ...data, eventTypeId: null },
      });
      expect(prisma.destinationCalendar.create).not.toHaveBeenCalled();
    });

    it("creates the calendar when there is no conflict", async () => {
      prisma.destinationCalendar.findFirst.mockResolvedValue(null);
      prisma.destinationCalendar.create.mockResolvedValue({ id: 10, ...data });

      await expect(DestinationCalendarRepository.createIfNotExistsForUser(data)).resolves.toEqual({
        id: 10,
        ...data,
      });
      expect(prisma.destinationCalendar.create).toHaveBeenCalledWith({ data });
    });
  });

  describe("upsert", () => {
    it("passes through credential ids for both update and create payloads", async () => {
      prisma.destinationCalendar.upsert.mockResolvedValue({ id: 1 });

      await DestinationCalendarRepository.upsert({
        where: { userId: 1 },
        update: { integration: "google_calendar", credentialId: 4, delegationCredentialId: null },
        create: {
          integration: "google_calendar",
          externalId: "a",
          credentialId: 4,
          delegationCredentialId: null,
        },
      });

      expect(prisma.destinationCalendar.upsert).toHaveBeenCalledWith({
        where: { userId: 1 },
        update: { integration: "google_calendar", credentialId: 4, delegationCredentialId: null },
        create: {
          integration: "google_calendar",
          externalId: "a",
          credentialId: 4,
          delegationCredentialId: null,
        },
      });
    });

    it("nulls out negative credential ids coming from delegation credentials", async () => {
      prisma.destinationCalendar.upsert.mockResolvedValue({ id: 1 });

      await DestinationCalendarRepository.upsert({
        where: { userId: 1 },
        update: { credentialId: -1, delegationCredentialId: "dc-1" },
        create: {
          integration: "google_calendar",
          externalId: "a",
          credentialId: -1,
          delegationCredentialId: "dc-1",
        },
      });

      expect(prisma.destinationCalendar.upsert).toHaveBeenCalledWith({
        where: { userId: 1 },
        update: { credentialId: null, delegationCredentialId: "dc-1" },
        create: {
          integration: "google_calendar",
          externalId: "a",
          credentialId: null,
          delegationCredentialId: "dc-1",
        },
      });
    });
  });
});
