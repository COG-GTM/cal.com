import { WEBAPP_URL } from "@calcom/lib/constants";
import { BookingStatus } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import type { InsightsRoutingTableItem } from "../../services/InsightsRoutingBaseService";
import { RoutingEventsInsights } from "../routing-events";

type Header = {
  id: string;
  label: string;
  type: string;
  options?: { label: string; id: string | null }[];
};

const headers: Header[] = [
  { id: "text-field", label: "Text field", type: "text" },
  {
    id: "select-field",
    label: "Select field",
    type: "select",
    options: [
      { id: "opt-a", label: "Option A" },
      { id: "opt-b", label: "Option B" },
    ],
  },
  {
    id: "multi-field",
    label: "Multi field",
    type: "multiselect",
    options: [
      { id: "opt-a", label: "Zeta" },
      { id: "opt-b", label: "Alpha" },
    ],
  },
  { id: "number-field", label: "Number field", type: "number" },
  { id: "absent-field", label: "Absent field", type: "text" },
];

const baseItem: InsightsRoutingTableItem = {
  id: 1,
  uuid: "uuid-1",
  formId: "form-1",
  formName: "Form 1",
  formTeamId: 10,
  formUserId: 2,
  bookingUid: "booking-uid",
  bookingId: 5,
  bookingStatus: BookingStatus.ACCEPTED,
  bookingStatusOrder: 1,
  bookingCreatedAt: new Date("2024-03-01T23:30:00.000Z"),
  bookingUserId: 3,
  bookingUserName: "Router User",
  bookingUserEmail: "router@example.com",
  bookingUserAvatarUrl: null,
  bookingAssignmentReason: "Round robin",
  bookingStartTime: new Date("2024-03-02T10:15:00.000Z"),
  bookingEndTime: new Date("2024-03-02T10:45:00.000Z"),
  eventTypeId: 7,
  eventTypeParentId: null,
  eventTypeSchedulingType: "roundRobin",
  createdAt: new Date("2024-03-01T22:00:00.000Z"),
  utm_source: "google",
  utm_medium: null,
  utm_campaign: null,
  utm_term: null,
  utm_content: null,
  bookingAttendees: [
    { name: "Attendee One", timeZone: "UTC", email: "one@example.com", phoneNumber: null },
    { name: "Attendee Two", timeZone: "UTC", email: "two@example.com", phoneNumber: "+123" },
  ],
  fields: [
    { fieldId: "text-field", valueString: "hello", valueNumber: null, valueStringArray: null },
    { fieldId: "select-field", valueString: "opt-b", valueNumber: null, valueStringArray: null },
    {
      fieldId: "multi-field",
      valueString: null,
      valueNumber: null,
      valueStringArray: ["opt-a", "opt-b", "unknown-option"],
    },
    { fieldId: "number-field", valueString: null, valueNumber: 12, valueStringArray: null },
  ],
};

const download = (item: InsightsRoutingTableItem, timeZone: string, total = 1) =>
  RoutingEventsInsights.getRoutingFormPaginatedResponsesForDownload({
    headersPromise: Promise.resolve(headers),
    dataPromise: Promise.resolve({ total, data: [item] }),
    timeZone,
  });

describe("RoutingEventsInsights.getRoutingFormPaginatedResponsesForDownload", () => {
  it("maps each header type onto the flattened response", async () => {
    const { data, total } = await download(baseItem, "UTC", 42);

    expect(total).toBe(42);
    expect(data[0]).toMatchObject({
      "Text Field": "hello",
      "Select Field": "Option B",
      // multiselect labels are resolved, unknown ids dropped, and the result sorted alphabetically
      "Multi Field": "Alpha, Zeta",
      "Number Field": "12",
      "Absent Field": "",
    });
  });

  it("builds the booking link and flags the presence of a booking", async () => {
    const { data } = await download(baseItem, "UTC");

    expect(data[0]["Booking UID"]).toBe("booking-uid");
    expect(data[0]["Booking Link"]).toBe(`${WEBAPP_URL}/booking/booking-uid`);
    expect(data[0]["Has Booking"]).toBe(true);
    expect(data[0]["Booking Status"]).toBe(BookingStatus.ACCEPTED);
  });

  it("formats dates in UTC", async () => {
    const { data } = await download(baseItem, "UTC");

    expect(data[0]["Submitted At"]).toBe("2024-03-01T22:00:00.000Z");
    expect(data[0]["Submitted At_date"]).toBe("2024-03-01");
    expect(data[0]["Submitted At_time"]).toBe("22:00:00");
    expect(data[0]["Booking Start Time_date"]).toBe("2024-03-02");
    expect(data[0]["Booking Start Time_time"]).toBe("10:15:00");
  });

  it("formats dates in the requested non-UTC timezone, crossing the day boundary", async () => {
    const { data } = await download(baseItem, "Asia/Tokyo");

    expect(data[0]["Submitted At"]).toBe("2024-03-01T22:00:00.000Z");
    expect(data[0]["Submitted At_date"]).toBe("2024-03-02");
    expect(data[0]["Submitted At_time"]).toBe("07:00:00");
    expect(data[0]["Booking Created At_date"]).toBe("2024-03-02");
    expect(data[0]["Booking Created At_time"]).toBe("08:30:00");
  });

  it("emits empty strings for a response without a booking", async () => {
    const { data } = await download(
      {
        ...baseItem,
        bookingUid: null,
        bookingStatus: null,
        bookingCreatedAt: null,
        bookingStartTime: null,
        bookingEndTime: null,
        bookingAssignmentReason: null,
        bookingUserName: null,
        bookingUserEmail: null,
        bookingAttendees: [],
      },
      "UTC"
    );

    expect(data[0]).toMatchObject({
      "Booking Link": "",
      "Has Booking": false,
      "Booking Status": "NO_BOOKING",
      "Booking Created At": "",
      "Booking Created At_date": "",
      "Booking Start Time": "",
      "Booking Start Time_time": "",
      "Booking End Time": "",
      "Booking End Time_date": "",
      "Assignment Reason": "",
      "Routed To Name": "",
      "Routed To Email": "",
    });
    expect(data[0]).not.toHaveProperty("Attendee 1");
  });

  it("numbers attendees and skips malformed ones", async () => {
    const { data } = await download(
      {
        ...baseItem,
        bookingAttendees: [
          { name: "Valid", timeZone: "UTC", email: "valid@example.com", phoneNumber: null },
          {
            name: null,
            email: "no-name@example.com",
            timeZone: "UTC",
            phoneNumber: null,
          } as unknown as InsightsRoutingTableItem["bookingAttendees"][number],
        ],
      },
      "UTC"
    );

    expect(data[0]["Attendee 1"]).toBe("Valid (valid@example.com)");
    expect(data[0]).not.toHaveProperty("Attendee 2");
  });

  it("defaults missing utm parameters to empty strings", async () => {
    const { data } = await download(baseItem, "UTC");

    expect(data[0]).toMatchObject({
      utm_source: "google",
      utm_medium: "",
      utm_campaign: "",
      utm_term: "",
      utm_content: "",
    });
  });

  it("handles a response with no fields at all", async () => {
    const { data } = await download({ ...baseItem, fields: [] }, "UTC");

    expect(data[0]).toMatchObject({
      "Text Field": "",
      "Select Field": "",
      "Multi Field": "",
      "Number Field": "",
    });
  });
});
