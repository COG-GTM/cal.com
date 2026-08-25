import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createOrder = vi.fn();

vi.mock("@calcom/app-store/paypal/lib/Paypal", () => ({
  default: vi.fn(function PaypalMock(this: { createOrder: typeof createOrder }) {
    this.createOrder = createOrder;
  }),
}));

import Paypal from "@calcom/app-store/paypal/lib/Paypal";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { paymentOptionEnum } from "../zod";
import { BuildPaymentService } from "./PaymentService";

const validKey = { client_id: "client-id", secret_key: "secret-key", webhook_id: "webhook-id" };

const buildService = (key: unknown = validKey) => BuildPaymentService({ key: key as never });

describe("PaypalPaymentService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    createOrder.mockResolvedValue({ id: "order-1" });
    prismaMock.booking.findUnique.mockResolvedValue({ uid: "booking-uid", title: "Booking" });
    prismaMock.payment.create.mockResolvedValue({ id: 1, uid: "payment-uid" });
  });

  describe("isSetupAlready", () => {
    it("is true when the credential key matches the schema", () => {
      expect(buildService().isSetupAlready()).toBe(true);
    });

    it("is false when the credential key is malformed", () => {
      expect(buildService({ client_id: "client-id" }).isSetupAlready()).toBe(false);
    });
  });

  describe("create", () => {
    it("creates a paypal order and a pending payment row", async () => {
      const payment = await buildService().create({ amount: 1500, currency: "USD" }, 42);

      expect(Paypal).toHaveBeenCalledWith({ clientId: "client-id", secretKey: "secret-key" });
      expect(createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1500,
          currency: "USD",
          returnUrl: expect.stringContaining("/api/integrations/paypal/capture?bookingUid=booking-uid"),
        })
      );
      const data = prismaMock.payment.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        amount: 1500,
        currency: "USD",
        externalId: "order-1",
        fee: 0,
        refunded: false,
        success: false,
        app: { connect: { slug: "paypal" } },
        booking: { connect: { id: 42 } },
      });
      expect(payment).toEqual({ id: 1, uid: "payment-uid" });
    });

    it("throws a payment creation failure when the booking is missing", async () => {
      prismaMock.booking.findUnique.mockResolvedValue(null);

      await expect(buildService().create({ amount: 1500, currency: "USD" }, 42)).rejects.toThrow(
        ErrorCode.PaymentCreationFailure
      );
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it("throws a payment creation failure when the credentials are invalid", async () => {
      await expect(buildService({}).create({ amount: 1500, currency: "USD" }, 42)).rejects.toThrow(
        ErrorCode.PaymentCreationFailure
      );
    });

    it("throws a payment creation failure when the payment row cannot be created", async () => {
      prismaMock.payment.create.mockResolvedValue(null as never);

      await expect(buildService().create({ amount: 1500, currency: "USD" }, 42)).rejects.toThrow(
        ErrorCode.PaymentCreationFailure
      );
    });
  });

  // HOLD is the only option collectCard accepts, but the paypal app does not expose it in
  // paymentOptionEnum, so every call currently ends in a throw before any order is created.
  describe("collectCard", () => {
    it("rejects HOLD because the paypal app does not offer it", async () => {
      await expect(
        buildService().collectCard({ amount: 100, currency: "USD" }, 42, "HOLD")
      ).rejects.toThrow();
      expect(createOrder).not.toHaveBeenCalled();
    });

    it("rejects ON_BOOKING as incompatible with the hold flow", async () => {
      await expect(
        buildService().collectCard({ amount: 100, currency: "USD" }, 42, "ON_BOOKING")
      ).rejects.toThrow("Payment option is not compatible with create method");
      expect(createOrder).not.toHaveBeenCalled();
    });

    describe("with HOLD enabled", () => {
      beforeEach(() => {
        vi.spyOn(paymentOptionEnum, "parse").mockReturnValue("HOLD");
      });

      it("creates an AUTHORIZE order and a pending payment row", async () => {
        await expect(
          buildService().collectCard({ amount: 100, currency: "USD" }, 42, "HOLD")
        ).resolves.toEqual({ id: 1, uid: "payment-uid" });

        expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ intent: "AUTHORIZE" }));
        expect(prismaMock.payment.create.mock.calls[0][0].data).toMatchObject({
          amount: 100,
          currency: "USD",
          externalId: "order-1",
          paymentOption: "HOLD",
          success: false,
        });
      });

      it("throws when the booking is missing", async () => {
        prismaMock.booking.findUnique.mockResolvedValue(null);

        await expect(
          buildService().collectCard({ amount: 100, currency: "USD" }, 42, "HOLD")
        ).rejects.toThrow("Paypal: Payment method could not be collected");
      });

      it("throws when the credentials are invalid", async () => {
        await expect(
          buildService({}).collectCard({ amount: 100, currency: "USD" }, 42, "HOLD")
        ).rejects.toThrow("Paypal: Payment method could not be collected");
      });

      it("throws when the payment row cannot be created", async () => {
        prismaMock.payment.create.mockResolvedValue(null as never);

        await expect(
          buildService().collectCard({ amount: 100, currency: "USD" }, 42, "HOLD")
        ).rejects.toThrow("Paypal: Payment method could not be collected");
      });
    });
  });

  describe("unimplemented methods", () => {
    it.each(["update", "refund"] as const)("%s rejects", async (method) => {
      await expect(buildService()[method]()).rejects.toThrow("Method not implemented.");
    });

    it.each(["chargeCard", "getPaymentPaidStatus", "getPaymentDetails"] as const)("%s throws", (method) => {
      expect(() => buildService()[method]()).toThrow("Method not implemented.");
    });

    it("afterPayment resolves without doing anything", async () => {
      await expect(buildService().afterPayment()).resolves.toBeUndefined();
    });

    it("deletePayment resolves false", async () => {
      await expect(buildService().deletePayment()).resolves.toBe(false);
    });
  });
});
