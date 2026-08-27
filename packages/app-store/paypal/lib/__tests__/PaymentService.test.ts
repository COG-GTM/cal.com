import { ErrorCode } from "@calcom/lib/errorCodes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BuildPaymentService } from "../PaymentService";

const createOrder = vi.fn();

vi.mock("@calcom/app-store/paypal/lib/Paypal", () => ({
  default: class {
    createOrder = createOrder;
  },
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    booking: { findUnique: vi.fn() },
    payment: { create: vi.fn() },
  },
}));

vi.mock("uuid", () => ({ v4: () => "payment-uid" }));

// The shipped enum only allows ON_BOOKING, so the parse result is made controllable to also
// exercise the HOLD path of collectCard.
const parsedPaymentOption = { value: "ON_BOOKING" as string };
vi.mock("../../zod", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../zod")>();
  return {
    ...actual,
    paymentOptionEnum: { parse: () => parsedPaymentOption.value },
  };
});

const prismaMock = (await import("@calcom/prisma")).default as unknown as {
  booking: { findUnique: ReturnType<typeof vi.fn> };
  payment: { create: ReturnType<typeof vi.fn> };
};

const validKey = { client_id: "client-id", secret_key: "secret-key", webhook_id: "webhook-id" };
const payment = { amount: 2000, currency: "USD" };

describe("PaypalPaymentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parsedPaymentOption.value = "ON_BOOKING";
    prismaMock.booking.findUnique.mockResolvedValue({ uid: "booking-uid", title: "Booking" });
    prismaMock.payment.create.mockImplementation(({ data }: { data: unknown }) => ({ id: 1, ...data }));
    createOrder.mockResolvedValue({ id: "order-1", status: "CREATED" });
  });

  describe("isSetupAlready", () => {
    it("is true for parsable credentials and false otherwise", () => {
      expect(BuildPaymentService({ key: validKey }).isSetupAlready()).toBe(true);
      expect(BuildPaymentService({ key: { client_id: "only-id" } }).isSetupAlready()).toBe(false);
    });
  });

  describe("create", () => {
    it("creates a PayPal order and stores the pending payment", async () => {
      const result = await BuildPaymentService({ key: validKey }).create(payment, 42);

      expect(createOrder).toHaveBeenCalledWith({
        referenceId: "payment-uid",
        amount: 2000,
        currency: "USD",
        returnUrl: expect.stringContaining("/api/integrations/paypal/capture?bookingUid=booking-uid"),
        cancelUrl: expect.stringContaining("/payment/payment-uid"),
      });
      expect(prismaMock.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          uid: "payment-uid",
          amount: 2000,
          currency: "USD",
          externalId: "order-1",
          fee: 0,
          refunded: false,
          success: false,
          data: { order: { id: "order-1", status: "CREATED" } },
        }),
      });
      expect(result).toMatchObject({ uid: "payment-uid", externalId: "order-1" });
    });

    it("throws PaymentCreationFailure when the booking does not exist", async () => {
      prismaMock.booking.findUnique.mockResolvedValue(null);

      await expect(BuildPaymentService({ key: validKey }).create(payment, 42)).rejects.toThrow(
        ErrorCode.PaymentCreationFailure
      );
      expect(createOrder).not.toHaveBeenCalled();
    });

    it("throws PaymentCreationFailure when the credentials are invalid", async () => {
      await expect(BuildPaymentService({ key: {} }).create(payment, 42)).rejects.toThrow(
        ErrorCode.PaymentCreationFailure
      );
    });

    it("throws PaymentCreationFailure when the order cannot be created", async () => {
      createOrder.mockRejectedValue(new Error("paypal down"));

      await expect(BuildPaymentService({ key: validKey }).create(payment, 42)).rejects.toThrow(
        ErrorCode.PaymentCreationFailure
      );
    });
  });

  describe("collectCard", () => {
    it("rejects payment options other than HOLD", async () => {
      await expect(
        BuildPaymentService({ key: validKey }).collectCard(payment, 42, "ON_BOOKING")
      ).rejects.toThrow("Payment option is not compatible with create method");
    });

    it("creates an authorize-intent order and stores the held payment", async () => {
      parsedPaymentOption.value = "HOLD";
      createOrder.mockResolvedValue({ id: "order-hold" });

      const result = await BuildPaymentService({ key: validKey }).collectCard(payment, 42, "HOLD");

      expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ intent: "AUTHORIZE" }));
      expect(prismaMock.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentOption: "HOLD",
          externalId: "order-hold",
          data: { id: "order-hold" },
        }),
      });
      expect(result).toMatchObject({ externalId: "order-hold" });
    });

    it("throws when the booking is missing", async () => {
      parsedPaymentOption.value = "HOLD";
      prismaMock.booking.findUnique.mockResolvedValue(null);

      await expect(BuildPaymentService({ key: validKey }).collectCard(payment, 42, "HOLD")).rejects.toThrow(
        "Paypal: Payment method could not be collected"
      );
    });

    it("throws when the order cannot be created", async () => {
      parsedPaymentOption.value = "HOLD";
      createOrder.mockRejectedValue(new Error("paypal down"));

      await expect(BuildPaymentService({ key: validKey }).collectCard(payment, 42, "HOLD")).rejects.toThrow(
        "Paypal: Payment method could not be collected"
      );
    });
  });

  describe("unsupported operations", () => {
    it("rejects methods PayPal does not implement", async () => {
      const service = BuildPaymentService({ key: validKey });

      await expect(service.update()).rejects.toThrow("Method not implemented.");
      await expect(service.refund()).rejects.toThrow("Method not implemented.");
      expect(() => service.chargeCard()).toThrow("Method not implemented.");
      expect(() => service.getPaymentPaidStatus()).toThrow("Method not implemented.");
      expect(() => service.getPaymentDetails()).toThrow("Method not implemented.");
    });

    it("resolves the no-op lifecycle hooks", async () => {
      const service = BuildPaymentService({ key: validKey });

      await expect(service.afterPayment()).resolves.toBeUndefined();
      await expect(service.deletePayment()).resolves.toBe(false);
    });
  });
});
