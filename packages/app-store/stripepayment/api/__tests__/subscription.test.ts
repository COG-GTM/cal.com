import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { checkPremiumUsername } from "@calcom/features/ee/common/lib/checkPremiumUsername";
import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStripeCustomerIdFromUserId } from "../../lib/customer";
import stripe from "../../lib/server";
import { getPremiumMonthlyPlanPriceId } from "../../lib/utils";
import handler from "../subscription";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  checkPremiumUsername: vi.fn(),
  getCustomerId: vi.fn(),
  findFirst: vi.fn(),
  userUpdate: vi.fn(),
  customerRetrieve: vi.fn(),
  customerUpdate: vi.fn(),
  checkoutCreate: vi.fn(),
  getPremiumPriceId: vi.fn(),
}));

vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@calcom/features/ee/common/lib/checkPremiumUsername", () => ({
  checkPremiumUsername: mocks.checkPremiumUsername,
}));

vi.mock("../../lib/customer", () => ({
  getStripeCustomerIdFromUserId: mocks.getCustomerId,
}));

vi.mock("../../lib/server", () => ({
  default: {
    customers: {
      retrieve: mocks.customerRetrieve,
      update: mocks.customerUpdate,
    },
    checkout: { sessions: { create: mocks.checkoutCreate } },
  },
}));

vi.mock("../../lib/utils", () => ({
  getPremiumMonthlyPlanPriceId: mocks.getPremiumPriceId,
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    user: {
      findFirst: mocks.findFirst,
      update: mocks.userUpdate,
    },
  },
}));

function createRequest(overrides: Partial<NextApiRequest> = {}) {
  return {
    method: "GET",
    query: { intentUsername: "premium-user", callbackUrl: "/settings" },
    ...overrides,
  } as unknown as NextApiRequest;
}

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
}

describe("Stripe subscription API handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: 42 } });
    mocks.getCustomerId.mockResolvedValue("cus_123");
    mocks.findFirst.mockResolvedValue({ id: 42, metadata: { existing: "value" } });
    mocks.userUpdate.mockResolvedValue({});
    mocks.checkPremiumUsername.mockResolvedValue({ available: true });
    mocks.customerRetrieve.mockResolvedValue({ id: "cus_123", deleted: false, metadata: { old: "value" } });
    mocks.customerUpdate.mockResolvedValue({});
    mocks.checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_123" });
    mocks.getPremiumPriceId.mockReturnValue("price_premium");
  });

  it("does not respond to non-GET requests", async () => {
    const res = createResponse();

    await handler(createRequest({ method: "POST" }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it.each([
    { query: {}, message: "Missing required parameters: userId or intentUsername" },
    { query: { intentUsername: null }, message: "Missing required parameters: userId or intentUsername" },
  ])("returns 404 for missing required parameters", async ({ query, message }) => {
    const res = createResponse();

    await handler(createRequest({ query }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message });
  });

  it("uses the first intent username when the query value is an array", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        query: { intentUsername: ["premium-user", "ignored"], callbackUrl: "/settings" },
      }),
      res
    );

    expect(vi.mocked(checkPremiumUsername)).toHaveBeenCalledWith("premium-user");
    expect(mocks.checkoutCreate.mock.calls[0][0].metadata).toEqual({
      userId: "42",
      intentUsername: "premium-user",
    });
  });

  it("returns 404 when the customer ID is missing", async () => {
    mocks.getCustomerId.mockResolvedValue(null);
    const res = createResponse();

    await handler(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Missing customer id" });
  });

  it("returns 404 when user data is missing", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const res = createResponse();

    await handler(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Missing user data" });
  });

  it("returns 404 when the intent username is unavailable", async () => {
    mocks.checkPremiumUsername.mockResolvedValue({ available: false });
    const res = createResponse();

    await handler(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Intent username not available" });
  });

  it("returns 400 for deleted or missing Stripe customers", async () => {
    mocks.customerRetrieve.mockResolvedValueOnce({ id: "cus_123", deleted: true });
    await handler(createRequest(), createResponse());

    expect(mocks.customerRetrieve).toHaveBeenCalledWith("cus_123");
    expect(mocks.customerUpdate).not.toHaveBeenCalled();

    mocks.customerRetrieve.mockResolvedValueOnce(null);
    const res = createResponse();
    await handler(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Stripe customer not found or deleted" });
  });

  it("updates the customer and user, creates a subscription checkout session, and redirects", async () => {
    const res = createResponse();

    await handler(createRequest(), res);

    expect(mocks.customerUpdate).toHaveBeenCalledWith("cus_123", {
      metadata: { old: "value", username: "premium-user" },
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { metadata: { existing: "value", isPremium: false } },
    });
    expect(mocks.checkoutCreate).toHaveBeenCalledWith({
      mode: "subscription",
      line_items: [{ quantity: 1, price: "price_premium" }],
      allow_promotion_codes: true,
      customer: "cus_123",
      success_url:
        "http://app.cal.local:3000/api/integrations/stripepayment/paymentCallback?checkoutSessionId={CHECKOUT_SESSION_ID}&callbackUrl=/settings",
      cancel_url:
        "http://app.cal.local:3000/api/integrations/stripepayment/paymentCallback?checkoutSessionId={CHECKOUT_SESSION_ID}&callbackUrl=/settings",
      metadata: { userId: "42", intentUsername: "premium-user" },
    });
    expect(res.redirect).toHaveBeenCalledWith("https://checkout.stripe.com/session_123");
    expect(res.end).toHaveBeenCalledOnce();
    expect(vi.mocked(getServerSession)).toHaveBeenCalledWith({ req: expect.anything() });
    expect(vi.mocked(getStripeCustomerIdFromUserId)).toHaveBeenCalledWith(42);
    expect(vi.mocked(getPremiumMonthlyPlanPriceId)).toHaveBeenCalledOnce();
    expect(vi.mocked(stripe.checkout.sessions.create)).toHaveBeenCalledOnce();
  });

  it("preserves a null metadata value as an empty object", async () => {
    mocks.findFirst.mockResolvedValue({ id: 42, metadata: null });

    await handler(createRequest(), createResponse());

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { metadata: { isPremium: false } },
    });
  });

  it("returns 404 when Stripe does not provide a checkout URL", async () => {
    mocks.checkoutCreate.mockResolvedValueOnce({ url: null });
    const res = createResponse();

    await handler(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Couldn't redirect to stripe checkout session" });
  });
});
