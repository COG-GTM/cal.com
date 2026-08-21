import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";
import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import getInstalledAppPath from "../../../_utils/getInstalledAppPath";
import { decodeOAuthState } from "../../../_utils/oauth/decodeOAuthState";
import stripe from "../../lib/server";
import handler from "../callback";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  accountsRetrieve: vi.fn(),
  decodeOAuthState: vi.fn(),
  createOAuthAppCredential: vi.fn(),
  getInstalledAppPath: vi.fn(),
  getSafeRedirectUrl: vi.fn(),
}));

vi.mock("../../lib/server", () => ({
  default: {
    oauth: { token: mocks.token },
    accounts: { retrieve: mocks.accountsRetrieve },
  },
}));

vi.mock("../../../_utils/oauth/decodeOAuthState", () => ({
  decodeOAuthState: mocks.decodeOAuthState,
}));

vi.mock("../../../_utils/oauth/createOAuthAppCredential", () => ({
  default: mocks.createOAuthAppCredential,
}));

vi.mock("../../../_utils/getInstalledAppPath", () => ({
  default: mocks.getInstalledAppPath,
}));

vi.mock("@calcom/lib/getSafeRedirectUrl", () => ({
  getSafeRedirectUrl: mocks.getSafeRedirectUrl,
}));

function createRequest(overrides: Partial<NextApiRequest> = {}) {
  return {
    method: "GET",
    query: { code: "oauth_code" },
    session: { user: { id: 42 } },
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

describe("Stripe callback API handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decodeOAuthState.mockReturnValue({
      returnTo: "https://app.cal.local:3000/settings/integrations",
      onErrorReturnTo: "https://app.cal.local:3000/apps",
    });
    mocks.getSafeRedirectUrl.mockImplementation((url?: string) => {
      if (typeof url === "string" && url.startsWith("https://app.cal.local:3000")) return url;
      return null;
    });
    mocks.getInstalledAppPath.mockReturnValue("/apps/installed/payment");
    mocks.token.mockResolvedValue({
      access_token: "access_token",
      stripe_user_id: "acct_123",
      stripe_publishable_key: "pk_test",
    });
    mocks.accountsRetrieve.mockResolvedValue({ default_currency: "usd" });
    mocks.createOAuthAppCredential.mockResolvedValue(undefined);
  });

  it("redirects access denied errors to a safe error return URL", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        query: { error: "access_denied" },
      }),
      res
    );

    expect(res.redirect).toHaveBeenCalledWith("https://app.cal.local:3000/apps");
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it("uses the installed payment path for unsafe or missing access-denied return URLs", async () => {
    mocks.getSafeRedirectUrl.mockReturnValue(null);
    const res = createResponse();

    await handler(
      createRequest({
        query: { error: "access_denied" },
      }),
      res
    );

    expect(res.redirect).toHaveBeenCalledWith("/apps/installed/payment");
  });

  it("redirects other OAuth errors with their description", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        query: { error: "invalid_scope", error_description: "The scope is invalid" },
      }),
      res
    );

    expect(res.redirect).toHaveBeenCalledWith(
      "/apps/installed?error=invalid_scope&error_description=The%20scope%20is%20invalid"
    );
  });

  it("returns 401 without a session and does not call Stripe", async () => {
    const res = createResponse();

    await handler(createRequest({ session: null }), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "You must be logged in to do this" });
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it("exchanges the code, retrieves the account, saves credentials, and redirects safely", async () => {
    const req = createRequest();
    const res = createResponse();

    await handler(req, res);

    expect(mocks.token).toHaveBeenCalledWith({
      grant_type: "authorization_code",
      code: "oauth_code",
    });
    expect(mocks.accountsRetrieve).toHaveBeenCalledWith("acct_123");
    expect(mocks.createOAuthAppCredential).toHaveBeenCalledWith(
      { appId: "stripe", type: "stripe_payment" },
      expect.objectContaining({ stripe_user_id: "acct_123", default_currency: "usd" }),
      req
    );
    expect(res.redirect).toHaveBeenCalledWith("https://app.cal.local:3000/settings/integrations");
    expect(vi.mocked(stripe.oauth.token)).toHaveBeenCalledOnce();
    expect(vi.mocked(decodeOAuthState)).toHaveBeenCalledWith(req, "stripe");
  });

  it("does not retrieve an account when Stripe omits stripe_user_id", async () => {
    mocks.token.mockResolvedValue({ access_token: "access_token" });
    const res = createResponse();

    await handler(
      createRequest({
        query: { code: "oauth_code" },
      }),
      res
    );

    expect(mocks.accountsRetrieve).not.toHaveBeenCalled();
    expect(mocks.createOAuthAppCredential).toHaveBeenCalledWith(
      { appId: "stripe", type: "stripe_payment" },
      expect.objectContaining({ default_currency: "" }),
      expect.anything()
    );
  });

  it("uses the installed app path when returnTo is unsafe or absent", async () => {
    mocks.getSafeRedirectUrl.mockReturnValue(null);
    const res = createResponse();

    await handler(createRequest(), res);

    expect(res.redirect).toHaveBeenCalledWith("/apps/installed/payment");
    expect(vi.mocked(getInstalledAppPath)).toHaveBeenCalledWith({ variant: "payment", slug: "stripe" });
    expect(vi.mocked(getSafeRedirectUrl)).toHaveBeenCalled();
  });
});
