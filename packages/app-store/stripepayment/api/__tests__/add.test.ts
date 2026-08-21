import process from "node:process";
import prisma from "@calcom/prisma";
import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStripeAppKeys } from "../../lib/getStripeAppKeys";
import handler from "../add";

const mocks = vi.hoisted(() => ({
  getStripeAppKeys: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("../../lib/getStripeAppKeys", () => ({
  getStripeAppKeys: mocks.getStripeAppKeys,
}));

vi.mock("@calcom/prisma", () => ({
  default: { user: { findUnique: mocks.findUnique } },
}));

function createRequest(overrides: Partial<NextApiRequest> = {}) {
  return {
    method: "GET",
    query: {},
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

describe("Stripe add API handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStripeAppKeys.mockResolvedValue({ client_id: "ca_test_client" });
    mocks.findUnique.mockResolvedValue({
      email: "user@example.com",
      name: "Test User",
    });
    delete process.env.NEXT_PUBLIC_IS_E2E;
  });

  it("returns a Stripe OAuth URL with the user and redirect parameters", async () => {
    const req = createRequest({
      session: { user: { id: 42 } } as NextApiRequest["session"],
      query: { state: "state_123" },
    });
    const res = createResponse();

    await handler(req, res);

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: 42 },
      select: { email: true, name: true },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const url = (res.json.mock.calls[0][0] as { url: string }).url;
    expect(url).toMatch(/^https:\/\/connect\.stripe\.com\/oauth\/authorize\?/);
    expect(url).toContain("client_id=ca_test_client");
    expect(url).toContain("scope=read_write");
    expect(url).toContain("response_type=code");
    expect(url).toContain("stripe_user[email]=user%40example.com");
    expect(url).toContain("stripe_user[first_name]=Test%20User");
    expect(url).toContain("state=state_123");
    expect(url).toContain(
      "redirect_uri=http%3A%2F%2Fapp.cal.local%3A3000%2Fapi%2Fintegrations%2Fstripepayment%2Fcallback"
    );
  });

  it("omits non-string state and includes E2E country", async () => {
    process.env.NEXT_PUBLIC_IS_E2E = "1";
    const req = createRequest({
      session: { user: { id: 42 } } as NextApiRequest["session"],
      query: { state: ["state_123"] },
    });
    const res = createResponse();

    await handler(req, res);

    const url = (res.json.mock.calls[0][0] as { url: string }).url;
    expect(url).toContain("stripe_user[country]=US");
    expect(url).not.toContain("state=state_123");
  });

  it("omits email and first name when the user is not found", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const res = createResponse();
    await handler(createRequest({ session: { user: { id: 42 } } as NextApiRequest["session"] }), res);

    const url = (res.json.mock.calls[0][0] as { url: string }).url;
    expect(url).not.toContain("email=");
    expect(url).not.toContain("first_name=");
  });

  it("does not include country when E2E mode is unset", async () => {
    const res = createResponse();

    await handler(createRequest(), res);

    const url = (res.json.mock.calls[0][0] as { url: string }).url;
    expect(url).not.toContain("country=");
  });

  it("does not respond to POST requests", async () => {
    const res = createResponse();

    await handler(createRequest({ method: "POST" }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("uses the mocked app keys dependency", async () => {
    await handler(createRequest(), createResponse());

    expect(vi.mocked(getStripeAppKeys)).toHaveBeenCalledOnce();
    expect(vi.mocked(prisma).user.findUnique).toHaveBeenCalledOnce();
  });
});
