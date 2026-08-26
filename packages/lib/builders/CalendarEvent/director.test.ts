import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEventBuilder } from "./builder";
import { CalendarEventDirector } from "./director";

const buildBooking = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  uid: "booking-uid",
  title: "Booking",
  startTime: new Date("2024-06-12T10:00:00.000Z"),
  endTime: new Date("2024-06-12T10:30:00.000Z"),
  eventTypeId: 10,
  userId: 1,
  dynamicEventSlugRef: null,
  dynamicGroupSlugRef: null,
  location: "Berlin",
  description: "notes",
  ...overrides,
});

describe("CalendarEventDirector", () => {
  let director: CalendarEventDirector;
  let builder: {
    buildEventObjectFromInnerClass: ReturnType<typeof vi.fn>;
    buildUsersFromInnerClass: ReturnType<typeof vi.fn>;
    buildAttendeesList: ReturnType<typeof vi.fn>;
    setLocation: ReturnType<typeof vi.fn>;
    setUId: ReturnType<typeof vi.fn>;
    setCancellationReason: ReturnType<typeof vi.fn>;
    setDescription: ReturnType<typeof vi.fn>;
    setNotes: ReturnType<typeof vi.fn>;
    buildRescheduleLink: ReturnType<typeof vi.fn>;
    setUsersFromId: ReturnType<typeof vi.fn>;
    eventType: { description: string };
  };

  beforeEach(() => {
    builder = {
      buildEventObjectFromInnerClass: vi.fn(),
      buildUsersFromInnerClass: vi.fn(),
      buildAttendeesList: vi.fn(),
      setLocation: vi.fn(),
      setUId: vi.fn(),
      setCancellationReason: vi.fn(),
      setDescription: vi.fn(),
      setNotes: vi.fn(),
      buildRescheduleLink: vi.fn(),
      setUsersFromId: vi.fn(),
      eventType: { description: "event type description" },
    };
    director = new CalendarEventDirector();
    director.setBuilder(builder as unknown as CalendarEventBuilder);
    director.setCancellationReason("cancelled");
  });

  describe("buildForRescheduleEmail", () => {
    it("builds the event with event type data", async () => {
      director.setExistingBooking(buildBooking() as never);
      await director.buildForRescheduleEmail();

      expect(builder.buildEventObjectFromInnerClass).toHaveBeenCalledWith(10);
      expect(builder.buildUsersFromInnerClass).toHaveBeenCalled();
      expect(builder.buildAttendeesList).toHaveBeenCalled();
      expect(builder.setLocation).toHaveBeenCalledWith("Berlin");
      expect(builder.setUId).toHaveBeenCalledWith("booking-uid");
      expect(builder.setCancellationReason).toHaveBeenCalledWith("cancelled");
      expect(builder.setDescription).toHaveBeenCalledWith("event type description");
      expect(builder.buildRescheduleLink).toHaveBeenCalledWith({
        allowRescheduleForCancelledBooking: false,
      });
    });

    it("passes allowRescheduleForCancelledBooking through", async () => {
      director.setExistingBooking(buildBooking() as never);
      await director.buildForRescheduleEmail({ allowRescheduleForCancelledBooking: true });
      expect(builder.buildRescheduleLink).toHaveBeenCalledWith({
        allowRescheduleForCancelledBooking: true,
      });
    });

    it("throws when required params are missing", async () => {
      director.setExistingBooking(buildBooking({ eventTypeId: null }) as never);
      await expect(director.buildForRescheduleEmail()).rejects.toThrow(
        "buildForRescheduleEmail.missing.params.required"
      );
    });
  });

  describe("buildWithoutEventTypeForRescheduleEmail", () => {
    it("builds the event from the booking owner", async () => {
      director.setExistingBooking(buildBooking() as never);
      await director.buildWithoutEventTypeForRescheduleEmail();

      expect(builder.setUsersFromId).toHaveBeenCalledWith(1);
      expect(builder.buildAttendeesList).toHaveBeenCalled();
      expect(builder.setLocation).toHaveBeenCalledWith("Berlin");
      expect(builder.setUId).toHaveBeenCalledWith("booking-uid");
      expect(builder.setCancellationReason).toHaveBeenCalledWith("cancelled");
      expect(builder.buildRescheduleLink).toHaveBeenCalled();
    });

    it("throws when required params are missing", async () => {
      director.setExistingBooking(buildBooking({ userId: null }) as never);
      await expect(director.buildWithoutEventTypeForRescheduleEmail()).rejects.toThrow(
        "buildWithoutEventTypeForRescheduleEmail.missing.params.required"
      );
    });
  });
});
