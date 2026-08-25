import { createHash } from "node:crypto";
import process from "node:process";
import type { TeamRepository } from "@calcom/features/ee/teams/repositories/TeamRepository";
import type { AccessCodeRepository } from "@calcom/features/oauth/repositories/AccessCodeRepository";
import type { OAuthClientRepository } from "@calcom/features/oauth/repositories/OAuthClientRepository";
import { hashSecretKey } from "@calcom/features/oauth/utils/generateSecret";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { OAuthClientStatus } from "@calcom/prisma/enums";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import { OAuthService } from "./OAuthService";

const ENCRYPTION_KEY = "test-encryption-key";
const CODE_VERIFIER = "a".repeat(64);
const CODE_CHALLENGE = createHash("sha256").update(CODE_VERIFIER).digest("base64url");

const oAuthClientRepository = mockDeep<OAuthClientRepository>();
const accessCodeRepository = mockDeep<AccessCodeRepository>();
const teamsRepository = mockDeep<TeamRepository>();

type ClientOverrides = Partial<{
  clientId: string;
  clientSecret: string | null;
  redirectUri: string;
  name: string;
  logo: string | null;
  isTrusted: boolean;
  clientType: "PUBLIC" | "CONFIDENTIAL";
  status: OAuthClientStatus;
  userId: number | null;
}>;

const buildClient = (overrides: ClientOverrides = {}) => ({
  clientId: "client-1",
  clientSecret: hashSecretKey("plain-secret"),
  redirectUri: "https://example.com/callback",
  name: "My app",
  purpose: "Testing",
  logo: null,
  websiteUrl: null,
  rejectionReason: null,
  isTrusted: false,
  clientType: "CONFIDENTIAL" as const,
  status: OAuthClientStatus.APPROVED,
  userId: 1,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  ...overrides,
});

const buildAccessCode = (overrides: Record<string, unknown> = {}) => ({
  userId: 10,
  teamId: null,
  scopes: ["READ_BOOKING" as const],
  codeChallenge: null,
  codeChallengeMethod: null,
  ...overrides,
});

const mockFoundClient = (overrides: ClientOverrides = {}) => {
  const client = buildClient(overrides);
  oAuthClientRepository.findByClientId.mockResolvedValue(client);
  oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(client);
  return client;
};

const expectErrorWithCode = async (promise: Promise<unknown>, code: ErrorCode, reason: string) => {
  await expect(promise).rejects.toBeInstanceOf(ErrorWithCode);
  const error = await promise.catch((e: ErrorWithCode) => e);
  expect(error.code).toBe(code);
  expect(error.data?.reason).toBe(reason);
  return error;
};

describe("OAuthService", () => {
  let service: OAuthService;
  const originalKey = process.env.CALENDSO_ENCRYPTION_KEY;

  beforeEach(() => {
    mockReset(oAuthClientRepository);
    mockReset(accessCodeRepository);
    mockReset(teamsRepository);
    process.env.CALENDSO_ENCRYPTION_KEY = ENCRYPTION_KEY;
    service = new OAuthService({ oAuthClientRepository, accessCodeRepository, teamsRepository });
  });

  afterEach(() => {
    process.env.CALENDSO_ENCRYPTION_KEY = originalKey;
  });

  describe("getClient", () => {
    it("returns the public client fields", async () => {
      mockFoundClient({ isTrusted: true });

      await expect(service.getClient("client-1")).resolves.toEqual({
        clientId: "client-1",
        redirectUri: "https://example.com/callback",
        name: "My app",
        logo: null,
        isTrusted: true,
        clientType: "CONFIDENTIAL",
      });
    });

    it("throws when the client does not exist", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(null);

      await expectErrorWithCode(service.getClient("client-1"), ErrorCode.NotFound, "client_not_found");
    });
  });

  describe("getClientForAuthorization", () => {
    it("returns the client when the redirect uri matches and the client is approved", async () => {
      mockFoundClient();

      const client = await service.getClientForAuthorization("client-1", "https://example.com/callback");

      expect(client.clientId).toBe("client-1");
    });

    it("throws when the client does not exist", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(null);

      await expectErrorWithCode(
        service.getClientForAuthorization("client-1", "https://example.com/callback"),
        ErrorCode.NotFound,
        "client_not_found"
      );
    });

    it("throws on a redirect uri mismatch", async () => {
      mockFoundClient();

      await expectErrorWithCode(
        service.getClientForAuthorization("client-1", "https://evil.com/callback"),
        ErrorCode.BadRequest,
        "redirect_uri_mismatch"
      );
    });

    it("throws for rejected clients even for the owner", async () => {
      mockFoundClient({ status: OAuthClientStatus.REJECTED, userId: 99 });

      await expectErrorWithCode(
        service.getClientForAuthorization("client-1", "https://example.com/callback", 99),
        ErrorCode.Unauthorized,
        "client_rejected"
      );
    });

    it("throws for pending clients when the requester is not the owner", async () => {
      mockFoundClient({ status: OAuthClientStatus.PENDING, userId: 99 });

      await expectErrorWithCode(
        service.getClientForAuthorization("client-1", "https://example.com/callback", 1),
        ErrorCode.Unauthorized,
        "client_not_approved"
      );
    });

    it("allows the owner to authorize a pending client", async () => {
      mockFoundClient({ status: OAuthClientStatus.PENDING, userId: 99 });

      await expect(
        service.getClientForAuthorization("client-1", "https://example.com/callback", 99)
      ).resolves.toMatchObject({ clientId: "client-1" });
    });
  });

  describe("generateAuthorizationCode", () => {
    it("stores the code for the logged in user and returns a redirect url with state", async () => {
      mockFoundClient();

      const result = await service.generateAuthorizationCode(
        "client-1",
        10,
        "https://example.com/callback",
        ["READ_BOOKING"],
        "state-123"
      );

      expect(result.authorizationCode).toMatch(/^[A-Za-z0-9\-_]+$/);
      const url = new URL(result.redirectUrl);
      expect(url.searchParams.get("code")).toBe(result.authorizationCode);
      expect(url.searchParams.get("state")).toBe("state-123");
      expect(accessCodeRepository.create).toHaveBeenCalledWith({
        code: result.authorizationCode,
        clientId: "client-1",
        userId: 10,
        teamId: undefined,
        scopes: ["READ_BOOKING"],
        codeChallenge: undefined,
        codeChallengeMethod: undefined,
      });
    });

    it("omits the state param when no state is provided", async () => {
      mockFoundClient();

      const result = await service.generateAuthorizationCode("client-1", 10, "https://example.com/callback", [
        "READ_BOOKING",
      ]);

      expect(new URL(result.redirectUrl).searchParams.has("state")).toBe(false);
    });

    it("throws when the client does not exist", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(null);

      await expectErrorWithCode(
        service.generateAuthorizationCode("client-1", 10, "https://example.com/callback", []),
        ErrorCode.Unauthorized,
        "client_not_found"
      );
    });

    it("requires pkce for public clients", async () => {
      mockFoundClient({ clientType: "PUBLIC" });

      await expectErrorWithCode(
        service.generateAuthorizationCode("client-1", 10, "https://example.com/callback", []),
        ErrorCode.BadRequest,
        "pkce_required"
      );
    });

    it("rejects non S256 challenge methods for public clients", async () => {
      mockFoundClient({ clientType: "PUBLIC" });

      await expectErrorWithCode(
        service.generateAuthorizationCode(
          "client-1",
          10,
          "https://example.com/callback",
          [],
          undefined,
          undefined,
          CODE_CHALLENGE,
          "plain"
        ),
        ErrorCode.BadRequest,
        "invalid_code_challenge_method"
      );
    });

    it("rejects non S256 challenge methods for confidential clients using pkce", async () => {
      mockFoundClient();

      await expectErrorWithCode(
        service.generateAuthorizationCode(
          "client-1",
          10,
          "https://example.com/callback",
          [],
          undefined,
          undefined,
          CODE_CHALLENGE,
          "plain"
        ),
        ErrorCode.BadRequest,
        "invalid_code_challenge_method"
      );
    });

    it("stores the pkce challenge for public clients", async () => {
      mockFoundClient({ clientType: "PUBLIC" });

      await service.generateAuthorizationCode(
        "client-1",
        10,
        "https://example.com/callback",
        ["READ_BOOKING"],
        undefined,
        undefined,
        CODE_CHALLENGE,
        "S256"
      );

      expect(accessCodeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ codeChallenge: CODE_CHALLENGE, codeChallengeMethod: "S256" })
      );
    });

    it("stores a team scoped code when a team slug is provided", async () => {
      mockFoundClient();
      teamsRepository.findTeamBySlugWithAdminRole.mockResolvedValue({ id: 55 } as never);

      await service.generateAuthorizationCode(
        "client-1",
        10,
        "https://example.com/callback",
        ["READ_BOOKING"],
        undefined,
        "my-team"
      );

      expect(accessCodeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 55, userId: undefined })
      );
    });

    it("throws when the user is not an admin of the team", async () => {
      mockFoundClient();
      teamsRepository.findTeamBySlugWithAdminRole.mockResolvedValue(null as never);

      await expectErrorWithCode(
        service.generateAuthorizationCode(
          "client-1",
          10,
          "https://example.com/callback",
          [],
          undefined,
          "my-team"
        ),
        ErrorCode.Unauthorized,
        "team_not_found_or_no_access"
      );
    });
  });

  describe("buildRedirectUrl", () => {
    it("appends defined params only", () => {
      const url = service.buildRedirectUrl("https://example.com/callback?existing=1", {
        code: "abc",
        state: undefined,
      });

      expect(url).toBe("https://example.com/callback?existing=1&code=abc");
    });
  });

  describe("buildErrorRedirectUrl", () => {
    it("maps a known oauth error message straight through", () => {
      const error = new ErrorWithCode(ErrorCode.Unauthorized, "access_denied", { reason: "user_denied" });

      const url = new URL(service.buildErrorRedirectUrl("https://example.com/callback", error, "state-1"));

      expect(url.searchParams.get("error")).toBe("access_denied");
      expect(url.searchParams.get("error_description")).toBe("user_denied");
      expect(url.searchParams.get("state")).toBe("state-1");
    });

    it("maps bad request errors to invalid_request", () => {
      const error = new ErrorWithCode(ErrorCode.BadRequest, "something broke", { reason: "bad_input" });

      const url = new URL(service.buildErrorRedirectUrl("https://example.com/callback", error));

      expect(url.searchParams.get("error")).toBe("invalid_request");
      expect(url.searchParams.get("error_description")).toBe("bad_input");
    });

    it("maps unauthorized errors to unauthorized_client", () => {
      const error = new ErrorWithCode(ErrorCode.Unauthorized, "nope");

      const url = new URL(service.buildErrorRedirectUrl("https://example.com/callback", error));

      expect(url.searchParams.get("error")).toBe("unauthorized_client");
      expect(url.searchParams.get("error_description")).toBe("nope");
    });

    it("maps other error codes to server_error", () => {
      const error = new ErrorWithCode(ErrorCode.NotFound, "missing");

      const url = new URL(service.buildErrorRedirectUrl("https://example.com/callback", error));

      expect(url.searchParams.get("error")).toBe("server_error");
      expect(url.searchParams.get("error_description")).toBe("missing");
    });

    it("maps unknown errors to a generic server_error", () => {
      const url = new URL(service.buildErrorRedirectUrl("https://example.com/callback", new Error("boom")));

      expect(url.searchParams.get("error")).toBe("server_error");
      expect(url.searchParams.get("error_description")).toBe("An unexpected error occurred");
    });
  });

  describe("exchangeCodeForTokens", () => {
    it("returns signed tokens and invalidates the used code", async () => {
      mockFoundClient();
      accessCodeRepository.findValidCode.mockResolvedValue(buildAccessCode());

      const tokens = await service.exchangeCodeForTokens(
        "client-1",
        "code-1",
        "plain-secret",
        "https://example.com/callback"
      );

      expect(tokens.tokenType).toBe("bearer");
      expect(tokens.expiresIn).toBe(1800);
      expect(accessCodeRepository.deleteExpiredAndUsedCodes).toHaveBeenCalledWith("code-1", "client-1");

      const accessTokenPayload = jwt.verify(tokens.accessToken, ENCRYPTION_KEY) as Record<string, unknown>;
      expect(accessTokenPayload).toMatchObject({
        userId: 10,
        clientId: "client-1",
        token_type: "Access Token",
        scope: ["READ_BOOKING"],
      });
      const refreshTokenPayload = jwt.verify(tokens.refreshToken, ENCRYPTION_KEY) as Record<string, unknown>;
      expect(refreshTokenPayload).toMatchObject({ token_type: "Refresh Token" });
      expect(refreshTokenPayload).not.toHaveProperty("codeChallenge");
    });

    it("throws when the client is unknown", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(null);

      await expectErrorWithCode(
        service.exchangeCodeForTokens("client-1", "code-1", "plain-secret"),
        ErrorCode.Unauthorized,
        "client_not_found"
      );
    });

    it("throws invalid_grant on redirect uri mismatch", async () => {
      mockFoundClient();

      await expectErrorWithCode(
        service.exchangeCodeForTokens("client-1", "code-1", "plain-secret", "https://evil.com/callback"),
        ErrorCode.BadRequest,
        "redirect_uri_mismatch"
      );
    });

    it("throws when a confidential client omits its secret", async () => {
      mockFoundClient();

      await expectErrorWithCode(
        service.exchangeCodeForTokens("client-1", "code-1"),
        ErrorCode.Unauthorized,
        "invalid_client_credentials"
      );
    });

    it("throws when a confidential client sends a wrong secret", async () => {
      mockFoundClient();

      await expectErrorWithCode(
        service.exchangeCodeForTokens("client-1", "code-1", "wrong-secret"),
        ErrorCode.Unauthorized,
        "invalid_client_credentials"
      );
    });

    it("throws when the code is invalid or expired", async () => {
      mockFoundClient();
      accessCodeRepository.findValidCode.mockResolvedValue(null);

      await expectErrorWithCode(
        service.exchangeCodeForTokens("client-1", "code-1", "plain-secret"),
        ErrorCode.BadRequest,
        "code_invalid_or_expired"
      );
      expect(accessCodeRepository.deleteExpiredAndUsedCodes).toHaveBeenCalled();
    });

    it("throws when the client is no longer approved", async () => {
      mockFoundClient({ status: OAuthClientStatus.PENDING, userId: 99 });
      accessCodeRepository.findValidCode.mockResolvedValue(buildAccessCode());

      await expectErrorWithCode(
        service.exchangeCodeForTokens("client-1", "code-1", "plain-secret"),
        ErrorCode.Unauthorized,
        "client_not_approved"
      );
    });

    it("verifies pkce for public clients and embeds the challenge in the refresh token", async () => {
      mockFoundClient({ clientType: "PUBLIC", clientSecret: null });
      accessCodeRepository.findValidCode.mockResolvedValue(
        buildAccessCode({ codeChallenge: CODE_CHALLENGE, codeChallengeMethod: "S256" })
      );

      const tokens = await service.exchangeCodeForTokens(
        "client-1",
        "code-1",
        undefined,
        undefined,
        CODE_VERIFIER
      );

      const refreshTokenPayload = jwt.verify(tokens.refreshToken, ENCRYPTION_KEY) as Record<string, unknown>;
      expect(refreshTokenPayload).toMatchObject({
        codeChallenge: CODE_CHALLENGE,
        codeChallengeMethod: "S256",
      });
    });

    it("throws invalid_request when a public client omits the code verifier", async () => {
      mockFoundClient({ clientType: "PUBLIC", clientSecret: null });
      accessCodeRepository.findValidCode.mockResolvedValue(
        buildAccessCode({ codeChallenge: CODE_CHALLENGE, codeChallengeMethod: "S256" })
      );

      await expectErrorWithCode(
        service.exchangeCodeForTokens("client-1", "code-1"),
        ErrorCode.BadRequest,
        "pkce_missing_parameters_or_invalid_method"
      );
    });

    it("throws invalid_grant when the code verifier does not match the challenge", async () => {
      mockFoundClient({ clientType: "PUBLIC", clientSecret: null });
      accessCodeRepository.findValidCode.mockResolvedValue(
        buildAccessCode({ codeChallenge: CODE_CHALLENGE, codeChallengeMethod: "S256" })
      );

      await expectErrorWithCode(
        service.exchangeCodeForTokens("client-1", "code-1", undefined, undefined, "wrong-verifier"),
        ErrorCode.BadRequest,
        "pkce_verification_failed"
      );
    });

    it("enforces pkce for confidential clients that started the flow with a challenge", async () => {
      mockFoundClient();
      accessCodeRepository.findValidCode.mockResolvedValue(
        buildAccessCode({ codeChallenge: CODE_CHALLENGE, codeChallengeMethod: "S256" })
      );

      await expect(
        service.exchangeCodeForTokens("client-1", "code-1", "plain-secret", undefined, CODE_VERIFIER)
      ).resolves.toMatchObject({ tokenType: "bearer" });
    });

    it("throws when the encryption key is missing", async () => {
      delete process.env.CALENDSO_ENCRYPTION_KEY;
      mockFoundClient();
      accessCodeRepository.findValidCode.mockResolvedValue(buildAccessCode());

      await expectErrorWithCode(
        service.exchangeCodeForTokens("client-1", "code-1", "plain-secret"),
        ErrorCode.InternalServerError,
        "encryption_key_missing"
      );
    });
  });

  describe("refreshAccessToken", () => {
    const signRefreshToken = (payload: Record<string, unknown>, key = ENCRYPTION_KEY) =>
      jwt.sign(
        { token_type: "Refresh Token", clientId: "client-1", scope: [], userId: 10, ...payload },
        key,
        {
          expiresIn: 60,
        }
      );

    it("issues a new token pair", async () => {
      mockFoundClient();

      const tokens = await service.refreshAccessToken("client-1", signRefreshToken({}), "plain-secret");

      const payload = jwt.verify(tokens.accessToken, ENCRYPTION_KEY) as Record<string, unknown>;
      expect(payload).toMatchObject({ userId: 10, token_type: "Access Token" });
    });

    it("throws when the client is unknown", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(null);

      await expectErrorWithCode(
        service.refreshAccessToken("client-1", signRefreshToken({}), "plain-secret"),
        ErrorCode.Unauthorized,
        "client_not_found"
      );
    });

    it("throws when the client secret is wrong", async () => {
      mockFoundClient();

      await expectErrorWithCode(
        service.refreshAccessToken("client-1", signRefreshToken({}), "wrong-secret"),
        ErrorCode.Unauthorized,
        "invalid_client_credentials"
      );
    });

    it("throws when the refresh token signature is invalid", async () => {
      mockFoundClient();

      await expectErrorWithCode(
        service.refreshAccessToken("client-1", signRefreshToken({}, "other-key"), "plain-secret"),
        ErrorCode.BadRequest,
        "invalid_refresh_token"
      );
    });

    it("throws when an access token is used as a refresh token", async () => {
      mockFoundClient();

      await expectErrorWithCode(
        service.refreshAccessToken(
          "client-1",
          signRefreshToken({ token_type: "Access Token" }),
          "plain-secret"
        ),
        ErrorCode.BadRequest,
        "invalid_refresh_token"
      );
    });

    it("throws when the token belongs to another client", async () => {
      mockFoundClient();

      await expectErrorWithCode(
        service.refreshAccessToken("client-1", signRefreshToken({ clientId: "other" }), "plain-secret"),
        ErrorCode.BadRequest,
        "client_id_mismatch"
      );
    });

    it("throws when the client has been rejected since the token was issued", async () => {
      mockFoundClient({ status: OAuthClientStatus.REJECTED });

      await expectErrorWithCode(
        service.refreshAccessToken("client-1", signRefreshToken({}), "plain-secret"),
        ErrorCode.Unauthorized,
        "client_rejected"
      );
    });

    it("throws when the encryption key is missing", async () => {
      mockFoundClient();
      const token = signRefreshToken({});
      delete process.env.CALENDSO_ENCRYPTION_KEY;

      await expectErrorWithCode(
        service.refreshAccessToken("client-1", token, "plain-secret"),
        ErrorCode.InternalServerError,
        "encryption_key_missing"
      );
    });
  });
});
