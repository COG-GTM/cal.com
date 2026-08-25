import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Paypal from "./Paypal";

const fetchMock = vi.fn();

const jsonResponse = (body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) =>
  ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: async () => body,
  }) as unknown as Response;

const tokenResponse = () => jsonResponse({ access_token: "token-1", expires_in: 60_000 });

const buildClient = () => new Paypal({ clientId: "client-id", secretKey: "secret-key" });

/** Skips the token request so assertions can target the API call itself. */
const authenticatedClient = async () => {
  fetchMock.mockResolvedValueOnce(tokenResponse());
  const client = buildClient();
  await client.getAccessToken();
  return client;
};

const lastFetchCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];

describe("Paypal", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("getAccessToken", () => {
    it("requests a token with basic auth and caches it until it expires", async () => {
      const client = await authenticatedClient();

      expect(client.accessToken).toBe("token-1");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
      expect(init.headers.Authorization).toBe(
        `Basic ${Buffer.from("client-id:secret-key").toString("base64")}`
      );
      expect(init.body.toString()).toBe("grant_type=client_credentials");

      await client.getAccessToken();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("requests a new token once the cached one expired", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ access_token: "token-1", expires_in: -1 }));
      const client = buildClient();

      await client.getAccessToken();
      await client.getAccessToken();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("leaves the token unset when paypal responds with an error", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));
      const client = buildClient();

      await client.getAccessToken();

      expect(client.accessToken).toBeNull();
    });

    it("swallows network errors", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const client = buildClient();

      await expect(client.getAccessToken()).resolves.toBeUndefined();
      expect(client.accessToken).toBeNull();
    });
  });

  describe("createOrder", () => {
    it("sends the amount in major units and the configured redirect urls", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: "order-1", status: "CREATED" }));

      const order = await client.createOrder({
        referenceId: "ref-1",
        amount: 1250,
        currency: "USD",
        returnUrl: "https://cal.local/return",
        cancelUrl: "https://cal.local/cancel",
      });

      expect(order).toEqual({ id: "order-1", status: "CREATED" });
      const [url, init] = lastFetchCall();
      expect(url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
      expect(init.headers.Authorization).toBe("Bearer token-1");
      expect(init.headers["PayPal-Request-Id"]).toEqual(expect.any(String));
      const body = JSON.parse(init.body);
      expect(body.intent).toBe("CAPTURE");
      expect(body.purchase_units[0]).toEqual({
        reference_id: "ref-1",
        amount: { currency_code: "USD", value: "12.5" },
      });
      expect(body.payment_source.paypal.experience_context).toMatchObject({
        return_url: "https://cal.local/return",
        cancel_url: "https://cal.local/cancel",
      });
    });

    it("forwards the AUTHORIZE intent", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: "order-1" }));

      await client.createOrder({
        referenceId: "ref-1",
        amount: 100,
        currency: "USD",
        returnUrl: "https://cal.local/return",
        cancelUrl: "https://cal.local/cancel",
        intent: "AUTHORIZE",
      });

      expect(JSON.parse(lastFetchCall()[1].body).intent).toBe("AUTHORIZE");
    });

    it("returns an empty order when paypal rejects the request", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 422 }));

      await expect(
        client.createOrder({
          referenceId: "ref-1",
          amount: 100,
          currency: "USD",
          returnUrl: "https://cal.local/return",
          cancelUrl: "https://cal.local/cancel",
        })
      ).resolves.toEqual({});
    });

    it("returns an empty order when the request throws", async () => {
      const client = await authenticatedClient();
      fetchMock.mockRejectedValueOnce(new Error("network down"));

      await expect(
        client.createOrder({
          referenceId: "ref-1",
          amount: 100,
          currency: "USD",
          returnUrl: "https://cal.local/return",
          cancelUrl: "https://cal.local/cancel",
        })
      ).resolves.toEqual({});
    });
  });

  describe("captureOrder", () => {
    it("marks the payment successful and accepts the booking", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: "COMPLETED", id: "capture-1" }));
      prismaMock.payment.findFirst.mockResolvedValue({
        id: 5,
        bookingId: 9,
        data: { order: { id: "order-1" } },
      });

      await expect(client.captureOrder("order-1")).resolves.toBe(true);

      expect(prismaMock.payment.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { success: true, data: { order: { id: "order-1" }, capture: "capture-1" } },
      });
      expect(prismaMock.booking.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { status: "ACCEPTED" },
      });
    });

    it("returns false when the capture is not completed", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: "PENDING" }));

      await expect(client.captureOrder("order-1")).resolves.toBe(false);
      expect(prismaMock.payment.update).not.toHaveBeenCalled();
    });

    it("returns false when paypal rejects the capture", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));

      await expect(client.captureOrder("order-1")).resolves.toBe(false);
    });

    it("rethrows when the payment row is missing", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: "COMPLETED", id: "capture-1" }));
      prismaMock.payment.findFirst.mockResolvedValue(null);

      await expect(client.captureOrder("order-1")).rejects.toThrow("Payment not found");
    });
  });

  describe("createWebhook", () => {
    it("registers the cal.com webhook url and returns its id", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: "webhook-1" }));

      await expect(client.createWebhook()).resolves.toBe("webhook-1");

      const [url, init] = lastFetchCall();
      expect(url).toBe("https://api-m.sandbox.paypal.com/v1/notifications/webhooks");
      const body = JSON.parse(init.body);
      expect(body.url).toContain("/api/integrations/paypal/webhook");
      expect(body.event_types.map((event: { name: string }) => event.name)).toEqual([
        "CHECKOUT.ORDER.APPROVED",
        "CHECKOUT.ORDER.COMPLETED",
      ]);
    });

    it("returns false when paypal rejects the registration", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ message: "nope" }, { ok: false, status: 400, statusText: "Bad Request" })
      );

      await expect(client.createWebhook()).resolves.toBe(false);
    });
  });

  describe("listWebhooks", () => {
    it("returns only the ids of cal.com webhooks", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          webhooks: [
            { id: "webhook-1", url: "https://cal.local/api/integrations/paypal/webhook" },
            { id: "webhook-2", url: "https://other.app/webhook" },
          ],
        })
      );

      await expect(client.listWebhooks()).resolves.toEqual(["webhook-1"]);
    });

    it("returns an empty list when paypal rejects the request", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));

      await expect(client.listWebhooks()).resolves.toEqual([]);
    });

    it("returns an empty list when the request throws", async () => {
      const client = await authenticatedClient();
      fetchMock.mockRejectedValueOnce(new Error("network down"));

      await expect(client.listWebhooks()).resolves.toEqual([]);
    });
  });

  describe("deleteWebhook", () => {
    it("issues a DELETE for the webhook id", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({}));

      await expect(client.deleteWebhook("webhook-1")).resolves.toBe(true);

      const [url, init] = lastFetchCall();
      expect(url).toBe("https://api-m.sandbox.paypal.com/v1/notifications/webhooks/webhook-1");
      expect(init.method).toBe("DELETE");
    });

    it("returns false when paypal rejects the deletion", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 404 }));

      await expect(client.deleteWebhook("webhook-1")).resolves.toBe(false);
    });

    it("returns false when the request throws", async () => {
      const client = await authenticatedClient();
      fetchMock.mockRejectedValueOnce(new Error("network down"));

      await expect(client.deleteWebhook("webhook-1")).resolves.toBe(false);
    });
  });

  describe("test", () => {
    it("resolves true once credentials can be exchanged for a token", async () => {
      fetchMock.mockResolvedValueOnce(tokenResponse());

      await expect(buildClient().test()).resolves.toBe(true);
    });
  });

  describe("verifyWebhook", () => {
    const verifyRequest = {
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

    it("posts the signature payload with the raw webhook event inlined", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({ verification_status: "SUCCESS" }));

      await expect(client.verifyWebhook(verifyRequest)).resolves.toBeUndefined();

      const [url, init] = lastFetchCall();
      expect(url).toBe("https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature");
      expect(JSON.parse(init.body)).toMatchObject({
        auth_algo: "SHA256withRSA",
        webhook_id: "webhook-1",
        webhook_event: { id: "event-1" },
      });
    });

    it("throws when the request is malformed", async () => {
      const client = await authenticatedClient();

      await expect(client.verifyWebhook({ body: { auth_algo: "SHA256withRSA" } } as never)).rejects.toThrow(
        "Request is malformed"
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws the response when paypal rejects the verification request", async () => {
      const client = await authenticatedClient();
      const response = jsonResponse({}, { ok: false, status: 400 });
      fetchMock.mockResolvedValueOnce(response);

      await expect(client.verifyWebhook(verifyRequest)).rejects.toBe(response);
    });

    it("throws the payload when the signature is not verified", async () => {
      const client = await authenticatedClient();
      fetchMock.mockResolvedValueOnce(jsonResponse({ verification_status: "FAILURE" }));

      await expect(client.verifyWebhook(verifyRequest)).rejects.toEqual({
        verification_status: "FAILURE",
      });
    });
  });
});
