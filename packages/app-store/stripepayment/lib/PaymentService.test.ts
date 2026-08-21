import process from "node:process";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { Booking, Payment, PaymentOption, Prisma } from "@calcom/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BuildPaymentService } from "./PaymentService";

const mocks = vi.hoisted(() => ({
  stripe: {
    paymentIntents: { create: vi.fn(), cancel: vi.fn() },
    setupIntents: { create: vi.fn() },
    customers: { retrieve: vi.fn() },
    paymentMethods: { retrieve: vi.fn() },
    refunds: { create: vi.fn() },
    checkout: {
      sessions: { list: vi.fn(), expire: vi.fn() },
    },
  },
  prisma: {
    payment: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  },
  retrieveOrCreateCustomer: vi.fn(),
  findBooking: vi.fn(),
  taskerCreate: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn(function StripeMock() {
    return mocks.stripe;
  }),
}));

vi.mock("@calcom/prisma", () => ({
  default: mocks.prisma,
}));

vi.mock("@calcom/features/bookings/repositories/BookingRepository", () => ({
  BookingRepository: class MockBookingRepository {
    findByIdIncludeUserAndAttendees = mocks.findBooking;
  },
}));

vi.mock("@calcom/features/tasker", () => ({
  default: { create: mocks.taskerCreate },
}));

vi.mock("./customer", () => ({
  retrieveOrCreateStripeCustomerByEmail: mocks.retrieveOrCreateCustomer,
}));

const credentials = {
  key: {
    stripe_user_id: "acct_123",
    default_currency: "usd",
    stripe_publishable_key: "pk_test_123",
  },
};

const paymentInput = { amount: 1050, currency: "usd" };

function createPayment(overrides: Partial<Payment> = {}) {
  return {
    id: 55,
    uid: "payment_uid",
    amount: 1050,
    currency: "usd",
    externalId: "pi_existing",
    data: { stripeAccount: "acct_123" },
    fee: 0,
    refunded: false,
    success: true,
    paymentOption: "ON_BOOKING",
    ...overrides,
  } as unknown as Payment;
}

function createBooking(overrides: Partial<Booking> = {}) {
  return {
    id: 123,
    title: "Booking title",
    user: { id: 99, username: "host" },
    attendees: [{ name: "Booker", email: "booker@example.com", phoneNumber: "+15550001111" }],
    eventType: { title: "Event title" },
    ...overrides,
  } as unknown as Booking;
}

function invalidPaymentOption(value: string) {
  return value as unknown as PaymentOption;
}

describe("StripePaymentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.retrieveOrCreateCustomer.mockResolvedValue({ id: "cus_123" });
    mocks.stripe.paymentIntents.create.mockResolvedValue({ id: "pi_123", status: "requires_payment_method" });
    mocks.stripe.setupIntents.create.mockResolvedValue({
      id: "seti_123",
      customer: "cus_123",
      payment_method: "pm_123",
    });
    mocks.stripe.customers.retrieve.mockResolvedValue({ id: "cus_123" });
    mocks.stripe.paymentMethods.retrieve.mockResolvedValue({ id: "pm_123" });
    mocks.prisma.payment.create.mockResolvedValue(createPayment());
    mocks.prisma.payment.update.mockResolvedValue(createPayment());
    mocks.taskerCreate.mockResolvedValue(undefined);
  });

  describe("constructor and isSetupAlready", () => {
    it("accepts valid Stripe credentials", () => {
      expect(BuildPaymentService(credentials).isSetupAlready()).toBe(true);
    });

    it.each([
      { key: { stripe_user_id: "acct_123", default_currency: "usd" } },
      { key: "not-an-object" },
    ])("rejects malformed credentials: $key", (invalidCredentials) => {
      expect(
        BuildPaymentService(invalidCredentials as unknown as { key: Prisma.JsonValue }).isSetupAlready()
      ).toBe(false);
    });
  });

  describe("create", () => {
    it("creates an ON_BOOKING payment with metadata and Stripe account", async () => {
      const service = BuildPaymentService(credentials);

      const result = await service.create(
        paymentInput,
        123,
        99,
        "host",
        "Booker",
        "ON_BOOKING",
        "booker@example.com",
        "+15550001111",
        "Event title",
        "Booking title"
      );

      expect(mocks.retrieveOrCreateCustomer).toHaveBeenCalledWith(
        "acct_123",
        "booker@example.com",
        "+15550001111"
      );
      expect(mocks.stripe.paymentIntents.create).toHaveBeenCalledWith(
        {
          amount: 1050,
          currency: "usd",
          customer: "cus_123",
          automatic_payment_methods: { enabled: true },
          metadata: {
            identifier: "cal.com",
            bookingId: 123,
            calAccountId: 99,
            calUsername: "host",
            bookerName: "Booker",
            bookerEmail: "booker@example.com",
            bookerPhoneNumber: "+15550001111",
            eventTitle: "Event title",
            bookingTitle: "Booking title",
          },
        },
        { stripeAccount: "acct_123" }
      );
      expect(mocks.prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          uid: expect.any(String),
          externalId: "pi_123",
          amount: 1050,
          currency: "usd",
          fee: 0,
          refunded: false,
          success: false,
          paymentOption: "ON_BOOKING",
          data: expect.objectContaining({
            id: "pi_123",
            stripe_publishable_key: "pk_test_123",
            stripeAccount: "acct_123",
          }),
        }),
      });
      expect(result).toEqual(expect.objectContaining({ id: 55, externalId: "pi_existing" }));
    });

    it("uses null and empty-string metadata defaults", async () => {
      const service = BuildPaymentService(credentials);

      await service.create(
        paymentInput,
        123,
        null,
        null,
        "Booker",
        "ON_BOOKING",
        "booker@example.com",
        undefined,
        undefined,
        undefined
      );

      expect(mocks.stripe.paymentIntents.create.mock.calls[0][0].metadata).toEqual({
        identifier: "cal.com",
        bookingId: 123,
        calAccountId: null,
        calUsername: null,
        bookerName: "Booker",
        bookerEmail: "booker@example.com",
        bookerPhoneNumber: null,
        eventTitle: "",
        bookingTitle: "",
      });
    });

    it.each([
      { currency: "jpy", amount: 5000 },
      { currency: "usd", amount: 1050 },
    ])("forwards $currency amounts without scaling", async ({ currency, amount }) => {
      const service = BuildPaymentService(credentials);

      await service.create(
        { currency, amount },
        123,
        99,
        "host",
        "Booker",
        "ON_BOOKING",
        "booker@example.com"
      );

      expect(mocks.stripe.paymentIntents.create.mock.calls[0][0].amount).toBe(amount);
      expect(mocks.prisma.payment.create.mock.calls[0][0].data.amount).toBe(amount);
    });

    it.each([
      ["HOLD", "payment_not_created_error"],
      ["INVALID", "payment_not_created_error"],
    ])("rejects unsupported payment option %s", async (option, message) => {
      await expect(
        BuildPaymentService(credentials).create(
          paymentInput,
          123,
          99,
          "host",
          "Booker",
          invalidPaymentOption(option),
          "booker@example.com"
        )
      ).rejects.toThrow(message);
    });

    it("rejects when credentials are missing", async () => {
      await expect(
        BuildPaymentService({ key: null }).create(
          paymentInput,
          123,
          99,
          "host",
          "Booker",
          "ON_BOOKING",
          "booker@example.com"
        )
      ).rejects.toThrow("payment_not_created_error");
    });

    it("maps Stripe and persistence failures to payment_not_created_error", async () => {
      mocks.stripe.paymentIntents.create.mockRejectedValue(new Error("Stripe failed"));
      await expect(
        BuildPaymentService(credentials).create(
          paymentInput,
          123,
          99,
          "host",
          "Booker",
          "ON_BOOKING",
          "booker@example.com"
        )
      ).rejects.toThrow("payment_not_created_error");

      mocks.stripe.paymentIntents.create.mockResolvedValue({ id: "pi_123" });
      mocks.prisma.payment.create.mockResolvedValueOnce(null);
      await expect(
        BuildPaymentService(credentials).create(
          paymentInput,
          123,
          99,
          "host",
          "Booker",
          "ON_BOOKING",
          "booker@example.com"
        )
      ).rejects.toThrow("payment_not_created_error");
    });
  });

  describe("collectCard", () => {
    it("collects a HOLD payment method and stores the setup intent", async () => {
      const service = BuildPaymentService(credentials);

      await service.collectCard(paymentInput, 123, "HOLD", "booker@example.com", "+15550001111");

      expect(mocks.stripe.setupIntents.create).toHaveBeenCalledWith(
        {
          customer: "cus_123",
          payment_method_types: ["card"],
          metadata: { bookingId: 123, bookerPhoneNumber: "+15550001111" },
        },
        { stripeAccount: "acct_123" }
      );
      expect(mocks.prisma.payment.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          externalId: "seti_123",
          paymentOption: "HOLD",
          data: expect.objectContaining({
            setupIntent: expect.objectContaining({ id: "seti_123" }),
            stripeAccount: "acct_123",
          }),
        })
      );
    });

    it("rejects collecting an ON_BOOKING payment", async () => {
      await expect(
        BuildPaymentService(credentials).collectCard(paymentInput, 123, "ON_BOOKING", "booker@example.com")
      ).rejects.toMatchObject({ code: ErrorCode.CollectCardFailure });
    });

    it("rejects collecting without credentials or when Stripe fails", async () => {
      await expect(
        BuildPaymentService({ key: null }).collectCard(paymentInput, 123, "HOLD", "booker@example.com")
      ).rejects.toMatchObject({ code: ErrorCode.CollectCardFailure });

      mocks.stripe.setupIntents.create.mockRejectedValue(new Error("Stripe failed"));
      await expect(
        BuildPaymentService(credentials).collectCard(paymentInput, 123, "HOLD", "booker@example.com")
      ).rejects.toMatchObject({ code: ErrorCode.CollectCardFailure });
    });
  });

  describe("chargeCard", () => {
    const setupPayment = createPayment({
      data: {
        setupIntent: {
          id: "seti_123",
          customer: "cus_123",
          payment_method: "pm_123",
        },
        stripeAccount: "acct_123",
      },
    });

    beforeEach(() => {
      mocks.findBooking.mockResolvedValue(createBooking());
      mocks.stripe.paymentIntents.create.mockResolvedValue({ id: "pi_charged", status: "succeeded" });
    });

    it("charges a setup intent using booking metadata", async () => {
      const service = BuildPaymentService(credentials);

      await service.chargeCard(setupPayment, 123);

      expect(mocks.stripe.customers.retrieve).toHaveBeenCalledWith("cus_123", { stripeAccount: "acct_123" });
      expect(mocks.stripe.paymentMethods.retrieve).toHaveBeenCalledWith("pm_123", {
        stripeAccount: "acct_123",
      });
      expect(mocks.stripe.paymentIntents.create).toHaveBeenCalledWith(
        {
          amount: 1050,
          currency: "usd",
          customer: "cus_123",
          payment_method: "pm_123",
          off_session: true,
          confirm: true,
          metadata: {
            identifier: "cal.com",
            bookingId: 123,
            calAccountId: 99,
            calUsername: "host",
            bookerName: "Booker",
            bookerEmail: "booker@example.com",
            bookerPhoneNumber: "+15550001111",
            eventTitle: "Event title",
            bookingTitle: "Booking title",
          },
        },
        { stripeAccount: "acct_123" }
      );
      expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 55 },
        data: {
          success: true,
          data: expect.objectContaining({
            setupIntent: expect.objectContaining({ id: "seti_123" }),
            paymentIntent: expect.objectContaining({ id: "pi_charged" }),
          }),
        },
      });
    });

    it("uses empty event metadata and null attendee phone numbers", async () => {
      mocks.findBooking.mockResolvedValue(
        createBooking({
          attendees: [{ name: "Booker", email: "booker@example.com", phoneNumber: null }],
          eventType: null,
        })
      );

      await BuildPaymentService(credentials).chargeCard(setupPayment, 123);

      expect(mocks.stripe.paymentIntents.create.mock.calls[0][0].metadata).toEqual(
        expect.objectContaining({ eventTitle: "", bookerPhoneNumber: null })
      );
    });

    it("rejects without credentials, a missing booking, or empty attendees", async () => {
      await expect(BuildPaymentService({ key: null }).chargeCard(setupPayment, 123)).rejects.toMatchObject({
        code: ErrorCode.ChargeCardFailure,
        message: "could_not_charge_card",
      });

      mocks.findBooking.mockResolvedValueOnce(null);
      await expect(BuildPaymentService(credentials).chargeCard(setupPayment, 123)).rejects.toMatchObject({
        code: ErrorCode.ChargeCardFailure,
      });

      mocks.findBooking.mockResolvedValueOnce(createBooking({ attendees: [] }));
      await expect(BuildPaymentService(credentials).chargeCard(setupPayment, 123)).rejects.toMatchObject({
        code: ErrorCode.ChargeCardFailure,
      });
    });

    it.each([
      ["Your card was declined", "your_card_was_declined"],
      [
        "Your card does not support this type of purchase",
        "your_card_does_not_support_this_type_of_purchase",
      ],
      ["Amount must convert to at least $0.50", "amount_must_convert_to_at_least"],
      ["Unrelated Stripe error", "could_not_charge_card"],
    ])("maps Stripe error %s to %s", async (stripeMessage, userMessage) => {
      mocks.stripe.paymentIntents.create.mockRejectedValue(new Error(stripeMessage));

      await expect(BuildPaymentService(credentials).chargeCard(setupPayment, 123)).rejects.toMatchObject({
        code: ErrorCode.ChargeCardFailure,
        message: userMessage,
      });
    });

    it("maps non-Error throws to could_not_charge_card", async () => {
      mocks.stripe.paymentIntents.create.mockRejectedValue("Stripe failed");

      await expect(BuildPaymentService(credentials).chargeCard(setupPayment, 123)).rejects.toMatchObject({
        code: ErrorCode.ChargeCardFailure,
        message: "could_not_charge_card",
      });
    });

    it("rejects when Stripe resources or the updated payment are missing", async () => {
      mocks.stripe.customers.retrieve.mockResolvedValue(null);
      await expect(BuildPaymentService(credentials).chargeCard(setupPayment, 123)).rejects.toMatchObject({
        code: ErrorCode.ChargeCardFailure,
      });

      mocks.stripe.customers.retrieve.mockResolvedValue({ id: "cus_123" });
      mocks.stripe.paymentMethods.retrieve.mockResolvedValue(null);
      await expect(BuildPaymentService(credentials).chargeCard(setupPayment, 123)).rejects.toMatchObject({
        code: ErrorCode.ChargeCardFailure,
      });

      mocks.stripe.paymentMethods.retrieve.mockResolvedValue({ id: "pm_123" });
      mocks.prisma.payment.update.mockResolvedValueOnce(null);
      await expect(BuildPaymentService(credentials).chargeCard(setupPayment, 123)).rejects.toMatchObject({
        code: ErrorCode.ChargeCardFailure,
      });
    });
  });

  describe("refund", () => {
    it("returns null when the payment does not exist", async () => {
      mocks.prisma.payment.findFirst.mockResolvedValue(null);

      await expect(BuildPaymentService(credentials).refund(55)).resolves.toBeNull();
      expect(mocks.stripe.refunds.create).not.toHaveBeenCalled();
    });

    it("rejects invalid payment state", async () => {
      mocks.prisma.payment.findFirst.mockResolvedValueOnce({ externalId: null });
      await expect(BuildPaymentService(credentials).refund(55)).rejects.toThrow(
        "Payment externalId not found"
      );

      mocks.prisma.payment.findFirst.mockResolvedValueOnce(createPayment({ success: false }));
      await expect(BuildPaymentService(credentials).refund(55)).rejects.toThrow(
        "Unable to refund failed payment"
      );
    });

    it("returns an already-refunded payment without calling Stripe", async () => {
      const payment = createPayment({ refunded: true });
      mocks.prisma.payment.findFirst.mockResolvedValue(payment);

      await expect(BuildPaymentService(credentials).refund(55)).resolves.toEqual(payment);
      expect(mocks.stripe.refunds.create).not.toHaveBeenCalled();
    });

    it("refunds a successful payment and marks it refunded", async () => {
      const payment = createPayment();
      mocks.prisma.payment.findFirst.mockResolvedValue(payment);
      mocks.stripe.refunds.create.mockResolvedValue({ id: "re_123", status: "succeeded" });

      await BuildPaymentService(credentials).refund(55);

      expect(mocks.stripe.refunds.create).toHaveBeenCalledWith(
        { payment_intent: "pi_existing" },
        { stripeAccount: "acct_123" }
      );
      expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 55 },
        data: { refunded: true },
      });
    });

    it("rejects failed or missing refunds and surfaces Stripe errors", async () => {
      const payment = createPayment();
      mocks.prisma.payment.findFirst.mockResolvedValue(payment);

      for (const refund of [{ status: "failed" }, null]) {
        mocks.stripe.refunds.create.mockResolvedValueOnce(refund);
        await expect(BuildPaymentService(credentials).refund(55)).rejects.toThrow();
      }

      mocks.stripe.refunds.create.mockRejectedValue(new Error("Stripe refund failed"));
      await expect(BuildPaymentService(credentials).refund(55)).rejects.toThrow("Stripe refund failed");
    });
  });

  describe("afterPayment", () => {
    const booking = {
      id: 123,
      uid: "booking_uid",
      startTime: { toISOString: () => "2025-01-01T00:00:00.000Z" },
      user: { email: "host@example.com", name: "Host", timeZone: "UTC" },
    };

    it("schedules the awaiting payment task in fifteen minutes", async () => {
      const before = Date.now();

      await BuildPaymentService(credentials).afterPayment(
        { attendeeSeatId: 7 } as never,
        booking,
        createPayment({ id: 77 })
      );

      const scheduledAt = mocks.taskerCreate.mock.calls[0][2].scheduledAt.getTime();
      expect(scheduledAt).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 100);
      expect(scheduledAt).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 100);
      expect(mocks.taskerCreate).toHaveBeenCalledWith(
        "sendAwaitingPaymentEmail",
        { bookingId: 123, paymentId: 77, attendeeSeatId: 7 },
        expect.objectContaining({ referenceUid: "booking_uid", scheduledAt: expect.any(Date) })
      );
    });

    it("uses the configured delay and null attendee seat", async () => {
      const previousDelay = process.env.AWAITING_PAYMENT_EMAIL_DELAY_MINUTES;
      process.env.AWAITING_PAYMENT_EMAIL_DELAY_MINUTES = "30";
      const before = Date.now();

      await BuildPaymentService(credentials).afterPayment({} as never, booking, createPayment({ id: 77 }));

      const scheduledAt = mocks.taskerCreate.mock.calls[0][2].scheduledAt.getTime();
      expect(scheduledAt).toBeGreaterThanOrEqual(before + 30 * 60 * 1000 - 100);
      expect(mocks.taskerCreate.mock.calls[0][1]).toEqual({
        bookingId: 123,
        paymentId: 77,
        attendeeSeatId: null,
      });
      if (previousDelay === undefined) delete process.env.AWAITING_PAYMENT_EMAIL_DELAY_MINUTES;
      else process.env.AWAITING_PAYMENT_EMAIL_DELAY_MINUTES = previousDelay;
    });
  });

  describe("deletePayment", () => {
    it("returns false when payment or Stripe account is missing", async () => {
      mocks.prisma.payment.findFirst.mockResolvedValueOnce(null);
      await expect(BuildPaymentService(credentials).deletePayment(55)).resolves.toBe(false);

      mocks.prisma.payment.findFirst.mockResolvedValueOnce(createPayment({ data: {} }));
      await expect(BuildPaymentService(credentials).deletePayment(55)).resolves.toBe(false);
    });

    it("expires open checkout sessions and cancels the payment intent", async () => {
      mocks.prisma.payment.findFirst.mockResolvedValue(createPayment());
      mocks.stripe.checkout.sessions.list.mockResolvedValue({
        data: [{ id: "cs_1" }, { id: "cs_2" }],
      });

      await expect(BuildPaymentService(credentials).deletePayment(55)).resolves.toBe(true);
      expect(mocks.stripe.checkout.sessions.list).toHaveBeenCalledWith(
        { payment_intent: "pi_existing" },
        { stripeAccount: "acct_123" }
      );
      expect(mocks.stripe.checkout.sessions.expire).toHaveBeenNthCalledWith(1, "cs_1", {
        stripeAccount: "acct_123",
      });
      expect(mocks.stripe.checkout.sessions.expire).toHaveBeenNthCalledWith(2, "cs_2", {
        stripeAccount: "acct_123",
      });
      expect(mocks.stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_existing", {
        stripeAccount: "acct_123",
      });

      mocks.stripe.checkout.sessions.list.mockResolvedValue({ data: [] });
      await expect(BuildPaymentService(credentials).deletePayment(55)).resolves.toBe(true);
    });

    it("returns false when Stripe deletion fails", async () => {
      mocks.prisma.payment.findFirst.mockResolvedValue(createPayment());
      mocks.stripe.checkout.sessions.list.mockRejectedValue(new Error("Stripe failed"));

      await expect(BuildPaymentService(credentials).deletePayment(55)).resolves.toBe(false);
    });
  });

  it("rejects unimplemented methods", async () => {
    const service = BuildPaymentService(credentials);

    await expect(service.update()).rejects.toThrow("Method not implemented.");
    expect(() => service.getPaymentPaidStatus()).toThrow("Method not implemented.");
    expect(() => service.getPaymentDetails()).toThrow("Method not implemented.");
  });
});
