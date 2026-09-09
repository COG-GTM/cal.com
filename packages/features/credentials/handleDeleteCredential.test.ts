import prismock from "@calcom/testing/lib/__mocks__/prisma";
import { getCalendar } from "@calcom/app-store/_utils/getCalendar";
import { sendCancelledEmailsAndSMS } from "@calcom/emails/email-manager";
import { deletePayment } from "@calcom/features/bookings/lib/payment/deletePayment";
import { deleteWebhookScheduledTriggers } from "@calcom/features/webhooks/lib/scheduleTrigger";
import { BookingStatus } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import handleDeleteCredential from "./handleDeleteCredential";

vi.mock("@calcom/app-store/_utils/getCalendar", () => ({
  getCalendar: vi.fn(),
}));

vi.mock("@calcom/emails/email-manager", () => ({
  sendCancelledEmailsAndSMS: vi.fn(),
}));

vi.mock("@calcom/features/bookings/lib/payment/deletePayment", () => ({
  deletePayment: vi.fn(),
}));

vi.mock("@calcom/features/webhooks/lib/scheduleTrigger", () => ({
  deleteWebhookScheduledTriggers: vi.fn(),
}));

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn().mockResolvedValue((key: string) => key),
}));

const mockGetCalendar = vi.mocked(getCalendar);
const mockSendCancelledEmailsAndSMS = vi.mocked(sendCancelledEmailsAndSMS);
const mockDeletePayment = vi.mocked(deletePayment);
const mockDeleteWebhookScheduledTriggers = vi.mocked(deleteWebhookScheduledTriggers);

const USER_ID = 1;
const TEAM_ID = 2;
const CREDENTIAL_ID = 10;

const createApp = (slug: string, categories: string[], dirName = slug) =>
  prismock.app.create({ data: { slug, dirName, categories, keys: {} } });

const createCredential = (
  overrides: Partial<{
    id: number;
    type: string;
    appId: string;
    userId: number | null;
    teamId: number | null;
  }> = {}
) =>
  prismock.credential.create({
    data: {
      id: CREDENTIAL_ID,
      type: "stripe_payment",
      key: { placeholder: true },
      userId: USER_ID,
      appId: "stripe",
      ...overrides,
    },
  });

const createEventType = (
  overrides: Partial<{
    id: number;
    userId: number | null;
    teamId: number | null;
    locations: unknown;
    metadata: unknown;
    hidden: boolean;
  }> = {}
) =>
  prismock.eventType.create({
    data: {
      id: 100,
      title: "Event",
      slug: "event",
      length: 30,
      userId: USER_ID,
      ...overrides,
    },
  });

describe("handleDeleteCredential", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await prismock.user.create({
      data: { id: USER_ID, email: "owner@example.com", username: "owner", locale: "en", timeZone: "UTC" },
    });
  });

  it("throws when the credential does not belong to the user", async () => {
    await createApp("stripe", ["payment"], "stripepayment");
    await createCredential({ userId: 999 });

    await expect(
      handleDeleteCredential({ userId: USER_ID, userMetadata: null, credentialId: CREDENTIAL_ID })
    ).rejects.toThrow("Credential not found");
    expect(await prismock.credential.count()).toBe(1);
  });

  it("throws when a team credential is requested with a mismatching teamId", async () => {
    await createApp("stripe", ["payment"], "stripepayment");
    await createCredential({ userId: null, teamId: TEAM_ID });

    await expect(
      handleDeleteCredential({
        userId: USER_ID,
        userMetadata: null,
        credentialId: CREDENTIAL_ID,
        teamId: 999,
      })
    ).rejects.toThrow("Credential not found");
  });

  it("deletes the credential when there is nothing else to clean up", async () => {
    await createApp("giphy", ["other"]);
    await createCredential({ type: "giphy_other", appId: "giphy" });

    await handleDeleteCredential({ userId: USER_ID, userMetadata: null, credentialId: CREDENTIAL_ID });

    expect(await prismock.credential.findUnique({ where: { id: CREDENTIAL_ID } })).toBeNull();
  });

  describe("conferencing apps", () => {
    it("keeps the existing Cal Video location instead of adding a duplicate", async () => {
      await createApp("zoom", ["video"], "zoomvideo");
      await createCredential({ type: "zoom_video", appId: "zoom" });
      await createEventType({
        locations: [{ type: "integrations:daily" }, { type: "integrations:zoom" }],
      });

      await handleDeleteCredential({ userId: USER_ID, userMetadata: null, credentialId: CREDENTIAL_ID });

      const eventType = await prismock.eventType.findUnique({ where: { id: 100 } });
      expect(eventType?.locations).toEqual([{ type: "integrations:daily" }]);
    });

    it("maps the msteams slug to its office365_video location", async () => {
      await createApp("msteams", ["conferencing"], "office365video");
      await createCredential({ type: "office365_video", appId: "msteams" });
      await createEventType({ locations: [{ type: "integrations:office365_video" }] });

      await handleDeleteCredential({ userId: USER_ID, userMetadata: null, credentialId: CREDENTIAL_ID });

      const eventType = await prismock.eventType.findUnique({ where: { id: 100 } });
      expect(eventType?.locations).toEqual([{ type: "integrations:daily" }]);
    });
  });

  describe("CRM apps", () => {
    it("hides the event type and removes only the deleted app from its metadata", async () => {
      await createApp("salesforce", ["crm"]);
      await createCredential({ type: "salesforce_crm", appId: "salesforce" });
      await createEventType({
        metadata: {
          apps: {
            salesforce: { enabled: true, credentialId: CREDENTIAL_ID },
            giphy: { enabled: true, credentialId: 11 },
          },
        },
      });

      const update = vi.spyOn(prismock.eventType, "update");

      await handleDeleteCredential({ userId: USER_ID, userMetadata: null, credentialId: CREDENTIAL_ID });

      const writtenData = update.mock.calls[0][0].data as {
        hidden: boolean;
        metadata: { apps: Record<string, unknown> };
      };
      update.mockRestore();

      expect(writtenData.hidden).toBe(true);
      expect(writtenData.metadata.apps).not.toHaveProperty("salesforce");
      expect(writtenData.metadata.apps).toHaveProperty("giphy");
    });
  });

  describe("apps that extend event types", () => {
    it("hides the event type and unsets the app metadata entry", async () => {
      await createApp("umami", ["analytics"]);
      await createCredential({ type: "umami_analytics", appId: "umami" });
      await createEventType({
        metadata: { apps: { umami: { enabled: true, credentialId: CREDENTIAL_ID } } },
      });

      const update = vi.spyOn(prismock.eventType, "update");

      await handleDeleteCredential({ userId: USER_ID, userMetadata: null, credentialId: CREDENTIAL_ID });

      const writtenData = update.mock.calls[0][0].data as {
        hidden: boolean;
        metadata: { apps: Record<string, unknown> };
      };
      update.mockRestore();

      expect(writtenData.hidden).toBe(true);
      expect(writtenData.metadata.apps.umami).toBeUndefined();
    });
  });

  describe("payment apps", () => {
    const createPendingBooking = async () => {
      const booking = await prismock.booking.create({
        data: {
          id: 500,
          uid: "booking-uid",
          title: "Paid booking",
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
          status: BookingStatus.PENDING,
          paid: false,
          userId: USER_ID,
          eventTypeId: 100,
        },
      });
      await prismock.attendee.create({
        data: {
          id: 600,
          bookingId: booking.id,
          email: "attendee@example.com",
          name: "Attendee",
          timeZone: "UTC",
          locale: "en",
        },
      });
      await prismock.payment.create({
        data: {
          id: 700,
          uid: "payment-uid",
          externalId: "external-id",
          bookingId: booking.id,
          appId: "stripe",
          amount: 100,
          fee: 0,
          currency: "usd",
          success: false,
          refunded: false,
          data: {},
        },
      });
      await prismock.bookingReference.create({
        data: { id: 800, type: "stripe_payment", uid: "reference-uid", bookingId: booking.id },
      });
      return booking;
    };

    beforeEach(async () => {
      await createApp("stripe", ["payment"], "stripepayment");
      await createCredential();
      await createEventType({
        metadata: {
          apps: {
            stripe: {
              enabled: true,
              credentialId: CREDENTIAL_ID,
              price: 100,
              currency: "usd",
              paymentOption: "ON_BOOKING",
            },
          },
        },
      });
    });

    it("cancels the unpaid pending booking and cleans up its payments", async () => {
      await createPendingBooking();

      await handleDeleteCredential({ userId: USER_ID, userMetadata: null, credentialId: CREDENTIAL_ID });

      const booking = await prismock.booking.findUnique({ where: { id: 500 } });
      expect(booking?.status).toBe(BookingStatus.CANCELLED);
      expect(booking?.cancellationReason).toBe("Payment method removed");

      expect(mockDeletePayment).toHaveBeenCalledWith(700, expect.objectContaining({ id: CREDENTIAL_ID }));
      expect(await prismock.payment.count()).toBe(0);
      expect(await prismock.attendee.count()).toBe(0);

      const reference = await prismock.bookingReference.findUnique({ where: { id: 800 } });
      expect(reference?.deleted).toBe(true);

      const eventType = await prismock.eventType.findUnique({ where: { id: 100 } });
      expect(eventType?.hidden).toBe(true);
    });

    it("notifies the attendees that the booking was cancelled", async () => {
      await createPendingBooking();

      await handleDeleteCredential({ userId: USER_ID, userMetadata: null, credentialId: CREDENTIAL_ID });

      expect(mockSendCancelledEmailsAndSMS).toHaveBeenCalledTimes(1);
      const [calEvent] = mockSendCancelledEmailsAndSMS.mock.calls[0];
      expect(calEvent).toMatchObject({
        uid: "booking-uid",
        cancellationReason: "Payment method removed by organizer",
        organizer: expect.objectContaining({ email: "owner@example.com" }),
      });
      expect(calEvent.attendees).toEqual([
        expect.objectContaining({ email: "attendee@example.com", timeZone: "UTC" }),
      ]);
    });

    it("leaves already paid bookings untouched", async () => {
      const booking = await createPendingBooking();
      await prismock.booking.update({ where: { id: booking.id }, data: { paid: true } });

      await handleDeleteCredential({ userId: USER_ID, userMetadata: null, credentialId: CREDENTIAL_ID });

      const untouched = await prismock.booking.findUnique({ where: { id: 500 } });
      expect(untouched?.status).toBe(BookingStatus.PENDING);
      expect(mockDeletePayment).not.toHaveBeenCalled();
      expect(mockSendCancelledEmailsAndSMS).not.toHaveBeenCalled();
    });
  });

  describe("zapier and make", () => {
    it("removes the api keys, webhooks and scheduled triggers of the user", async () => {
      await createApp("zapier", ["automation"]);
      await createCredential({ type: "zapier_automation", appId: "zapier" });
      await prismock.apiKey.create({
        data: { id: "api-key-1", userId: USER_ID, appId: "zapier", hashedKey: "hashed" },
      });
      await prismock.apiKey.create({
        data: { id: "api-key-2", userId: USER_ID, appId: "make", hashedKey: "hashed" },
      });
      await prismock.webhook.create({
        data: {
          id: "webhook-1",
          userId: USER_ID,
          appId: "zapier",
          subscriberUrl: "https://example.com",
          eventTriggers: [],
          active: true,
        },
      });

      await handleDeleteCredential({ userId: USER_ID, userMetadata: null, credentialId: CREDENTIAL_ID });

      expect(await prismock.apiKey.findMany({ where: { appId: "zapier" } })).toEqual([]);
      expect(await prismock.apiKey.findMany({ where: { appId: "make" } })).toHaveLength(1);
      expect(await prismock.webhook.count()).toBe(0);
      expect(mockDeleteWebhookScheduledTriggers).toHaveBeenCalledWith({
        appId: "zapier",
        userId: USER_ID,
        teamId: undefined,
      });
    });

    it("scopes the cleanup to the team when a teamId is given", async () => {
      await createApp("make", ["automation"]);
      await createCredential({ type: "make_automation", appId: "make", userId: null, teamId: TEAM_ID });

      await handleDeleteCredential({
        userId: USER_ID,
        userMetadata: null,
        credentialId: CREDENTIAL_ID,
        teamId: TEAM_ID,
      });

      expect(mockDeleteWebhookScheduledTriggers).toHaveBeenCalledWith({
        appId: "make",
        userId: undefined,
        teamId: TEAM_ID,
      });
    });
  });

  describe("default conferencing app", () => {
    it("unsets the default conferencing app when it is the deleted app", async () => {
      await createApp("zoom", ["video"], "zoomvideo");
      await createCredential({ type: "zoom_video", appId: "zoom" });

      await handleDeleteCredential({
        userId: USER_ID,
        userMetadata: { defaultConferencingApp: { appSlug: "zoom" } },
        credentialId: CREDENTIAL_ID,
      });

      const user = await prismock.user.findUnique({ where: { id: USER_ID } });
      expect((user?.metadata as { defaultConferencingApp?: unknown }).defaultConferencingApp).toBeUndefined();
    });

    it("keeps a default conferencing app that belongs to another credential", async () => {
      await createApp("zoom", ["video"], "zoomvideo");
      await createCredential({ type: "zoom_video", appId: "zoom" });
      await prismock.user.update({
        where: { id: USER_ID },
        data: { metadata: { defaultConferencingApp: { appSlug: "google-meet" } } },
      });

      await handleDeleteCredential({
        userId: USER_ID,
        userMetadata: { defaultConferencingApp: { appSlug: "google-meet" } },
        credentialId: CREDENTIAL_ID,
      });

      const user = await prismock.user.findUnique({ where: { id: USER_ID } });
      expect(
        (user?.metadata as { defaultConferencingApp: { appSlug: string } }).defaultConferencingApp
      ).toEqual({ appSlug: "google-meet" });
    });
  });

  describe("calendar apps", () => {
    beforeEach(async () => {
      await createApp("google-calendar", ["calendar"], "googlecalendar");
      await createCredential({ type: "google_calendar", appId: "google-calendar" });
    });

    it("removes the destination calendar of the event type and the selected calendars", async () => {
      const destinationCalendar = await prismock.destinationCalendar.create({
        data: {
          id: 900,
          integration: "google_calendar",
          externalId: "primary@example.com",
          credentialId: CREDENTIAL_ID,
        },
      });
      await createEventType({ destinationCalendar: { connect: { id: destinationCalendar.id } } });
      await prismock.selectedCalendar.create({
        data: {
          id: "selected-1",
          userId: USER_ID,
          integration: "google_calendar",
          externalId: "primary@example.com",
        },
      });
      await prismock.selectedCalendar.create({
        data: {
          id: "selected-2",
          userId: USER_ID,
          integration: "google_calendar",
          externalId: "other@example.com",
        },
      });
      mockGetCalendar.mockResolvedValue({
        listCalendars: vi.fn().mockResolvedValue([{ externalId: "primary@example.com" }]),
      } as unknown as Awaited<ReturnType<typeof getCalendar>>);

      await handleDeleteCredential({ userId: USER_ID, userMetadata: null, credentialId: CREDENTIAL_ID });

      expect(await prismock.destinationCalendar.findUnique({ where: { id: 900 } })).toBeNull();
      const remaining = await prismock.selectedCalendar.findMany({ where: { userId: USER_ID } });
      expect(remaining.map((calendar) => calendar.id)).toEqual(["selected-2"]);
    });

    it("still deletes the credential when the calendar service throws", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      mockGetCalendar.mockRejectedValue(new Error("calendar unreachable"));

      await handleDeleteCredential({ userId: USER_ID, userMetadata: null, credentialId: CREDENTIAL_ID });

      expect(warnSpy).toHaveBeenCalled();
      expect(await prismock.credential.findUnique({ where: { id: CREDENTIAL_ID } })).toBeNull();
    });
  });
});
