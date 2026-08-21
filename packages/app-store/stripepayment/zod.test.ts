import { RefundPolicy } from "@calcom/lib/payment/types";
import { describe, expect, it } from "vitest";
import { appDataSchema, appKeysSchema, autoChargeNoShowFeeTimeUnitEnum, paymentOptionEnum } from "./zod";

describe("stripe schemas", () => {
  it("validates payment options and no-show time units", () => {
    expect(paymentOptionEnum.parse("ON_BOOKING")).toBe("ON_BOOKING");
    expect(autoChargeNoShowFeeTimeUnitEnum.parse("hours")).toBe("hours");
    expect(() => paymentOptionEnum.parse("INVALID")).toThrow();
    expect(() => autoChargeNoShowFeeTimeUnitEnum.parse("weeks")).toThrow();
  });

  it("validates app data and supported Stripe credentials", () => {
    expect(
      appDataSchema.parse({
        price: 1000,
        currency: "usd",
        enabled: true,
        refundPolicy: RefundPolicy.FULL,
        appCategories: ["payment"],
      })
    ).toMatchObject({ price: 1000, currency: "usd" });
    expect(() => appDataSchema.parse({ price: "1000", currency: "usd" })).toThrow();

    expect(
      appKeysSchema.parse({
        client_id: "ca_123",
        client_secret: "sk_123",
        public_key: "pk_123",
        webhook_secret: "whsec_123",
      })
    ).toEqual({
      client_id: "ca_123",
      client_secret: "sk_123",
      public_key: "pk_123",
      webhook_secret: "whsec_123",
    });
    expect(() => appKeysSchema.parse({ client_id: "invalid" })).toThrow();
  });
});
