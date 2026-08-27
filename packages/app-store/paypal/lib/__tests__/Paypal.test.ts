import { beforeEach, describe, expect, it, vi } from "vitest";
import Paypal from "../Paypal";

vi.mock("@calcom/prisma", () => ({
  default: {
    payment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    booking: {
      update: vi.fn(),
    },
  },
}));

vi.mock("uuid", () => ({ v4: () => "mock-uuid" }));

const prismaMock = (await import("@calcom/prisma")).default as unknown as {
  payment: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  booking: { update: ReturnType<typeof vi.fn> };
};

const SANDBOX_URL = "https://api-m.sandbox.paypal.com";

type FetchResult = { ok: boolean; status?: number; statusText?: string; json?: () => Promise<unknown> };

const fetchMock = vi.fn();

function respondWith(handler: (url: string, init?: RequestInit) => FetchResult) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const result = handler(url, init);
    return Promise.resolve({
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({}),
      ...result,
    });
  });
}

function tokenResponse() {
  return { ok: true, json: () => Promise.resolve({ access_token: "token-123", expires_in: 60_000 }) };
}

function buildClient() {
  return new Paypal({ clientId: "client-id", secretKey: "secret-key" });
}

describe("Paypal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    respondWith(() => tokenResponse());
  });

  describe("getAccessToken", () => {
    it("requests a token with basic auth and caches it until it expires", async () => {
      const paypal = buildClient();

      await paypal.getAccessToken();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${SANDBOX_URL}/v1/oauth2/token`);
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe(
        `Basic ${Buffer.from("client-id:secret-key").toString("base64")}`
      );
      expect(init.body.toString()).toBe("grant_type=client_credentials");
      expect(paypal.accessToken).toBe("token-123");

      await paypal.getAccessToken();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("fetches a new token once the cached one is expired", async () => {
      const paypal = buildClient();
      paypal.accessToken = "expired";
      paypal.expiresAt = Date.now() - 1;

      await paypal.getAccessToken();

      expect(paypal.accessToken).toBe("token-123");
    });

    it("logs and keeps no token when the request fails", async () => {
      respondWith(() => ({ ok: false, status: 401 }));
      const paypal = buildClient();

      await paypal.getAccessToken();

      expect(paypal.accessToken).toBeNull();
      expect(console.error).toHaveBeenCalledWith("Request failed with status 401");
    });

    it("swallows network errors", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const paypal = buildClient();

      await paypal.getAccessToken();

      expect(paypal.accessToken).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("createOrder", () => {
    const orderArgs = {
      referenceId: "ref-1",
      amount: 1250,
      currency: "USD",
      returnUrl: "https://cal.com/return",
      cancelUrl: "https://cal.com/cancel",
    };

    it("converts the amount to a decimal string and returns the created order", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok: true, json: () => Promise.resolve({ id: "order-1", status: "CREATED" }) };
      });

      const order = await buildClient().createOrder(orderArgs);

      expect(order).toEqual({ id: "order-1", status: "CREATED" });
      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe(`${SANDBOX_URL}/v2/checkout/orders`);
      expect(init.headers.Authorization).toBe("Bearer token-123");
      expect(init.headers["PayPal-Request-Id"]).toBe("mock-uuid");
      expect(JSON.parse(init.body)).toEqual({
        intent: "CAPTURE",
        purchase_units: [{ reference_id: "ref-1", amount: { currency_code: "USD", value: "12.5" } }],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: "PAY_NOW",
              return_url: orderArgs.returnUrl,
              cancel_url: orderArgs.cancelUrl,
            },
          },
        },
      });
    });

    it("forwards an AUTHORIZE intent", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok: true, json: () => Promise.resolve({ id: "order-2" }) };
      });

      await buildClient().createOrder({ ...orderArgs, intent: "AUTHORIZE" });

      expect(JSON.parse(fetchMock.mock.calls[1][1].body).intent).toBe("AUTHORIZE");
    });

    it("returns an empty order when PayPal rejects the request", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok: false, status: 422 };
      });

      await expect(buildClient().createOrder(orderArgs)).resolves.toEqual({});
      expect(console.error).toHaveBeenCalledWith("Request failed with status 422");
    });

    it("returns an empty order when the request throws", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        throw new Error("boom");
      });

      await expect(buildClient().createOrder(orderArgs)).resolves.toEqual({});
    });
  });

  describe("captureOrder", () => {
    function mockCapture(result: Record<string, unknown>, ok = true) {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok, status: 500, json: () => Promise.resolve(result) };
      });
    }

    it("marks the payment successful and accepts the booking", async () => {
      mockCapture({ status: "COMPLETED", id: "capture-1" });
      prismaMock.payment.findFirst.mockResolvedValue({
        id: 7,
        bookingId: 42,
        data: { order: { id: "order-1" } },
      });

      await expect(buildClient().captureOrder("order-1")).resolves.toBe(true);

      expect(prismaMock.payment.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { success: true, data: { order: { id: "order-1" }, capture: "capture-1" } },
      });
      expect(prismaMock.booking.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { status: "ACCEPTED" },
      });
    });

    it("throws when no payment matches the order", async () => {
      mockCapture({ status: "COMPLETED", id: "capture-1" });
      prismaMock.payment.findFirst.mockResolvedValue(null);

      await expect(buildClient().captureOrder("order-1")).rejects.toThrow("Payment not found");
      expect(prismaMock.booking.update).not.toHaveBeenCalled();
    });

    it("returns false when the capture is not completed", async () => {
      mockCapture({ status: "PENDING" });

      await expect(buildClient().captureOrder("order-1")).resolves.toBe(false);
      expect(prismaMock.payment.update).not.toHaveBeenCalled();
    });

    it("returns false when the capture request fails", async () => {
      mockCapture({}, false);

      await expect(buildClient().captureOrder("order-1")).resolves.toBe(false);
    });
  });

  describe("createWebhook", () => {
    it("returns the created webhook id", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok: true, json: () => Promise.resolve({ id: "webhook-1" }) };
      });

      await expect(buildClient().createWebhook()).resolves.toBe("webhook-1");
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).event_types).toEqual([
        { name: "CHECKOUT.ORDER.APPROVED" },
        { name: "CHECKOUT.ORDER.COMPLETED" },
      ]);
    });

    it("returns false when the webhook cannot be created", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok: false, statusText: "Bad Request", json: () => Promise.resolve({ message: "nope" }) };
      });

      await expect(buildClient().createWebhook()).resolves.toBe(false);
    });
  });

  describe("listWebhooks", () => {
    it("returns only the ids of cal.com webhooks", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              webhooks: [
                { id: "1", url: "https://example.com/api/integrations/paypal/webhook" },
                { id: "2", url: "https://example.com/other" },
              ],
            }),
        };
      });

      await expect(buildClient().listWebhooks()).resolves.toEqual(["1"]);
    });

    it("returns an empty list when the request fails", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok: false };
      });

      await expect(buildClient().listWebhooks()).resolves.toEqual([]);
    });

    it("returns an empty list when the response cannot be parsed", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok: true, json: () => Promise.reject(new Error("invalid json")) };
      });

      await expect(buildClient().listWebhooks()).resolves.toEqual([]);
    });
  });

  describe("deleteWebhook", () => {
    it("returns true when PayPal accepts the deletion", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok: true };
      });

      await expect(buildClient().deleteWebhook("webhook-1")).resolves.toBe(true);
      expect(fetchMock.mock.calls[1][0]).toBe(`${SANDBOX_URL}/v1/notifications/webhooks/webhook-1`);
      expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
    });

    it("returns false when the deletion fails", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok: false };
      });

      await expect(buildClient().deleteWebhook("webhook-1")).resolves.toBe(false);
    });

    it("returns false when the request throws", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        throw new Error("boom");
      });

      await expect(buildClient().deleteWebhook("webhook-1")).resolves.toBe(false);
    });
  });

  describe("test", () => {
    it("returns true once a token can be fetched", async () => {
      await expect(buildClient().test()).resolves.toBe(true);
    });

    it("returns false when getting a token throws", async () => {
      const paypal = buildClient();
      vi.spyOn(paypal, "getAccessToken").mockRejectedValue(new Error("boom"));

      await expect(paypal.test()).resolves.toBe(false);
    });
  });

  describe("verifyWebhook", () => {
    const options = {
      body: {
        auth_algo: "SHA256withRSA",
        cert_url: "https://api.paypal.com/cert.pem",
        transmission_id: "transmission-1",
        transmission_sig: "signature",
        transmission_time: "2024-01-01T00:00:00Z",
        webhook_event: '{"id":"event-1"}',
        webhook_id: "webhook-1",
      },
    };

    it("rejects a malformed request without calling PayPal", async () => {
      await expect(
        buildClient().verifyWebhook({ body: { auth_algo: "SHA256withRSA" } } as typeof options)
      ).rejects.toThrow("Request is malformed");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends the signature payload with the raw webhook event inlined", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok: true, json: () => Promise.resolve({ verification_status: "SUCCESS" }) };
      });

      await expect(buildClient().verifyWebhook(options)).resolves.toBeUndefined();

      const body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.webhook_event).toEqual({ id: "event-1" });
      expect(body.webhook_id).toBe("webhook-1");
    });

    it("throws when the verification status is not SUCCESS", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok: true, json: () => Promise.resolve({ verification_status: "FAILURE" }) };
      });

      await expect(buildClient().verifyWebhook(options)).rejects.toEqual({
        verification_status: "FAILURE",
      });
    });

    it("throws the response when PayPal rejects the verification request", async () => {
      respondWith((url) => {
        if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
        return { ok: false, status: 400 };
      });

      await expect(buildClient().verifyWebhook(options)).rejects.toMatchObject({ ok: false });
    });
  });
});
