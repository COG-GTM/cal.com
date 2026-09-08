import { createHash } from "node:crypto";
import type { TeamRepository } from "@calcom/features/ee/teams/repositories/TeamRepository";
import type { AccessCodeRepository } from "@calcom/features/oauth/repositories/AccessCodeRepository";
import type { OAuthClientRepository } from "@calcom/features/oauth/repositories/OAuthClientRepository";
import { generateSecret } from "@calcom/features/oauth/utils/generateSecret";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { OAuthClientStatus } from "@calcom/prisma/enums";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAUTH_ERROR_REASONS, OAuthService } from "./OAuthService";

vi.mock("@calcom/features/oauth/utils/generateSecret", () => ({
  generateSecret: vi.fn((secret: string) => [`hashed-${secret}`, secret]),
}));

const SECRET_KEY = "test-encryption-key";
const CLIENT_ID = "client-123";
const REDIRECT_URI = "https://example.com/callback";

type FoundClient = NonNullable<Awaited<ReturnType<OAuthClientRepository["findByClientId"]>>>;
type FoundClientWithSecret = NonNullable<
  Awaited<ReturnType<OAuthClientRepository["findByClientIdWithSecret"]>>
>;
type FoundAccessCode = NonNullable<Awaited<ReturnType<AccessCodeRepository["findValidCode"]>>>;

const buildClient = (overrides: Partial<FoundClient> = {}): FoundClient => ({
  clientId: CLIENT_ID,
  redirectUri: REDIRECT_URI,
  clientType: "CONFIDENTIAL",
  name: "Test Client",
  purpose: null,
  logo: null,
  isTrusted: false,
  websiteUrl: null,
  rejectionReason: null,
  status: OAuthClientStatus.APPROVED,
  userId: 10,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  ...overrides,
});

const buildClientWithSecret = (overrides: Partial<FoundClientWithSecret> = {}): FoundClientWithSecret => ({
  clientId: CLIENT_ID,
  redirectUri: REDIRECT_URI,
  clientSecret: "hashed-secret",
  clientType: "CONFIDENTIAL",
  status: OAuthClientStatus.APPROVED,
  userId: 10,
  ...overrides,
});

const buildAccessCode = (overrides: Partial<FoundAccessCode> = {}): FoundAccessCode => ({
  userId: 42,
  teamId: null,
  scopes: ["READ_PROFILE"],
  codeChallenge: null,
  codeChallengeMethod: null,
  ...overrides,
});

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

const expectErrorWithCode = async (
  promise: Promise<unknown>,
  code: ErrorCode,
  message: string,
  reason: string
) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(ErrorWithCode);
  const typed = error as ErrorWithCode;
  expect(typed.code).toBe(code);
  expect(typed.message).toBe(message);
  expect(typed.data).toEqual({ reason });
};

describe("OAuthService", () => {
  const oAuthClientRepository = {
    findByClientId: vi.fn(),
    findByClientIdWithSecret: vi.fn(),
  };
  const accessCodeRepository = {
    create: vi.fn(),
    findValidCode: vi.fn(),
    deleteExpiredAndUsedCodes: vi.fn(),
  };
  const teamsRepository = {
    findTeamBySlugWithAdminRole: vi.fn(),
  };

  let service: OAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CALENDSO_ENCRYPTION_KEY", SECRET_KEY);
    service = new OAuthService({
      oAuthClientRepository: oAuthClientRepository as unknown as OAuthClientRepository,
      accessCodeRepository: accessCodeRepository as unknown as AccessCodeRepository,
      teamsRepository: teamsRepository as unknown as TeamRepository,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getClient", () => {
    it("returns the public client shape", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(buildClient({ logo: "logo.png" }));

      const result = await service.getClient(CLIENT_ID);

      expect(oAuthClientRepository.findByClientId).toHaveBeenCalledWith(CLIENT_ID);
      expect(result).toEqual({
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        name: "Test Client",
        logo: "logo.png",
        isTrusted: false,
        clientType: "CONFIDENTIAL",
      });
    });

    it("throws NotFound when client is missing", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(null);

      await expectErrorWithCode(
        service.getClient(CLIENT_ID),
        ErrorCode.NotFound,
        "unauthorized_client",
        "client_not_found"
      );
    });
  });

  describe("getClientForAuthorization", () => {
    it("returns the client when redirect uri matches and client is approved", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(buildClient());

      const result = await service.getClientForAuthorization(CLIENT_ID, REDIRECT_URI);

      expect(result.clientId).toBe(CLIENT_ID);
    });

    it("throws NotFound when client is missing", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(null);

      await expectErrorWithCode(
        service.getClientForAuthorization(CLIENT_ID, REDIRECT_URI),
        ErrorCode.NotFound,
        "unauthorized_client",
        "client_not_found"
      );
    });

    it("throws BadRequest on redirect uri mismatch", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(buildClient());

      await expectErrorWithCode(
        service.getClientForAuthorization(CLIENT_ID, "https://evil.com/cb"),
        ErrorCode.BadRequest,
        "invalid_request",
        "redirect_uri_mismatch"
      );
    });

    it("throws Unauthorized when client is rejected, even for the owner", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(
        buildClient({ status: OAuthClientStatus.REJECTED })
      );

      await expectErrorWithCode(
        service.getClientForAuthorization(CLIENT_ID, REDIRECT_URI, 10),
        ErrorCode.Unauthorized,
        "unauthorized_client",
        "client_rejected"
      );
    });

    it("throws Unauthorized when a pending client is used by a non-owner", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(
        buildClient({ status: OAuthClientStatus.PENDING })
      );

      await expectErrorWithCode(
        service.getClientForAuthorization(CLIENT_ID, REDIRECT_URI, 99),
        ErrorCode.Unauthorized,
        "unauthorized_client",
        "client_not_approved"
      );
    });

    it("allows the owner to use a pending client", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(
        buildClient({ status: OAuthClientStatus.PENDING, userId: 10 })
      );

      await expect(service.getClientForAuthorization(CLIENT_ID, REDIRECT_URI, 10)).resolves.toMatchObject({
        clientId: CLIENT_ID,
      });
    });
  });

  describe("generateAuthorizationCode", () => {
    const scopes: FoundAccessCode["scopes"] = ["READ_PROFILE"];

    it("throws Unauthorized when client is missing", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(null);

      await expectErrorWithCode(
        service.generateAuthorizationCode(CLIENT_ID, 10, REDIRECT_URI, scopes),
        ErrorCode.Unauthorized,
        "unauthorized_client",
        "client_not_found"
      );
    });

    it("throws BadRequest on redirect uri mismatch", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(buildClient());

      await expectErrorWithCode(
        service.generateAuthorizationCode(CLIENT_ID, 10, "https://other.com", scopes),
        ErrorCode.BadRequest,
        "invalid_request",
        "redirect_uri_mismatch"
      );
    });

    it("requires a code challenge for PUBLIC clients", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(buildClient({ clientType: "PUBLIC" }));

      await expectErrorWithCode(
        service.generateAuthorizationCode(CLIENT_ID, 10, REDIRECT_URI, scopes),
        ErrorCode.BadRequest,
        "invalid_request",
        "pkce_required"
      );
    });

    it("requires S256 for PUBLIC clients", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(buildClient({ clientType: "PUBLIC" }));

      await expectErrorWithCode(
        service.generateAuthorizationCode(
          CLIENT_ID,
          10,
          REDIRECT_URI,
          scopes,
          undefined,
          undefined,
          "challenge",
          "plain"
        ),
        ErrorCode.BadRequest,
        "invalid_request",
        "invalid_code_challenge_method"
      );
    });

    it("rejects CONFIDENTIAL clients that send a challenge without S256", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(buildClient());

      await expectErrorWithCode(
        service.generateAuthorizationCode(
          CLIENT_ID,
          10,
          REDIRECT_URI,
          scopes,
          undefined,
          undefined,
          "challenge",
          undefined
        ),
        ErrorCode.BadRequest,
        "invalid_request",
        "invalid_code_challenge_method"
      );
    });

    it("creates a user-scoped code and builds the redirect url with state", async () => {
      const client = buildClient();
      oAuthClientRepository.findByClientId.mockResolvedValue(client);
      accessCodeRepository.create.mockResolvedValue(undefined);

      const result = await service.generateAuthorizationCode(
        CLIENT_ID,
        10,
        REDIRECT_URI,
        scopes,
        "xyz",
        undefined,
        "challenge",
        "S256"
      );

      expect(accessCodeRepository.create).toHaveBeenCalledWith({
        code: result.authorizationCode,
        clientId: CLIENT_ID,
        userId: 10,
        teamId: undefined,
        scopes,
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
      });
      expect(result.authorizationCode).toMatch(/^[A-Za-z0-9_-]+$/);
      const url = new URL(result.redirectUrl);
      expect(url.origin + url.pathname).toBe(REDIRECT_URI);
      expect(url.searchParams.get("code")).toBe(result.authorizationCode);
      expect(url.searchParams.get("state")).toBe("xyz");
      expect(result.client).toBe(client);
      expect(teamsRepository.findTeamBySlugWithAdminRole).not.toHaveBeenCalled();
    });

    it("creates a team-scoped code when teamSlug is provided", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(buildClient({ clientType: "PUBLIC" }));
      teamsRepository.findTeamBySlugWithAdminRole.mockResolvedValue({ id: 7 });

      const result = await service.generateAuthorizationCode(
        CLIENT_ID,
        10,
        REDIRECT_URI,
        scopes,
        undefined,
        "acme",
        "challenge",
        "S256"
      );

      expect(teamsRepository.findTeamBySlugWithAdminRole).toHaveBeenCalledWith("acme", 10);
      expect(accessCodeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: undefined, teamId: 7 })
      );
      expect(new URL(result.redirectUrl).searchParams.has("state")).toBe(false);
    });

    it("throws access_denied when the team is not found or user lacks admin role", async () => {
      oAuthClientRepository.findByClientId.mockResolvedValue(buildClient());
      teamsRepository.findTeamBySlugWithAdminRole.mockResolvedValue(null);

      await expectErrorWithCode(
        service.generateAuthorizationCode(CLIENT_ID, 10, REDIRECT_URI, scopes, undefined, "acme"),
        ErrorCode.Unauthorized,
        "access_denied",
        "team_not_found_or_no_access"
      );
      expect(accessCodeRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("buildRedirectUrl / buildErrorRedirectUrl", () => {
    it("skips undefined params", () => {
      const url = new URL(service.buildRedirectUrl(REDIRECT_URI, { a: "1", b: undefined }));
      expect(url.searchParams.get("a")).toBe("1");
      expect(url.searchParams.has("b")).toBe(false);
    });

    it("maps known OAuth error messages directly", () => {
      const url = new URL(
        service.buildErrorRedirectUrl(
          REDIRECT_URI,
          new ErrorWithCode(ErrorCode.Unauthorized, "access_denied", {
            reason: "team_not_found_or_no_access",
          }),
          "st"
        )
      );
      expect(url.searchParams.get("error")).toBe("access_denied");
      expect(url.searchParams.get("error_description")).toBe("team_not_found_or_no_access");
      expect(url.searchParams.get("state")).toBe("st");
    });

    it("maps BadRequest to invalid_request using the message when no reason", () => {
      const url = new URL(
        service.buildErrorRedirectUrl(REDIRECT_URI, new ErrorWithCode(ErrorCode.BadRequest, "boom"))
      );
      expect(url.searchParams.get("error")).toBe("invalid_request");
      expect(url.searchParams.get("error_description")).toBe("boom");
    });

    it("maps Unauthorized to unauthorized_client", () => {
      const url = new URL(
        service.buildErrorRedirectUrl(
          REDIRECT_URI,
          new ErrorWithCode(ErrorCode.Unauthorized, "nope", { reason: "custom" })
        )
      );
      expect(url.searchParams.get("error")).toBe("unauthorized_client");
      expect(url.searchParams.get("error_description")).toBe("custom");
    });

    it("maps other ErrorWithCode codes to server_error", () => {
      const url = new URL(
        service.buildErrorRedirectUrl(REDIRECT_URI, new ErrorWithCode(ErrorCode.InternalServerError, "oops"))
      );
      expect(url.searchParams.get("error")).toBe("server_error");
      expect(url.searchParams.get("error_description")).toBe("oops");
    });

    it("maps unknown errors to a generic server_error", () => {
      const url = new URL(service.buildErrorRedirectUrl(REDIRECT_URI, new Error("x")));
      expect(url.searchParams.get("error")).toBe("server_error");
      expect(url.searchParams.get("error_description")).toBe("An unexpected error occurred");
    });
  });

  describe("exchangeCodeForTokens", () => {
    const code = "auth-code";

    beforeEach(() => {
      accessCodeRepository.deleteExpiredAndUsedCodes.mockResolvedValue(undefined);
    });

    it("throws invalid_client when client is missing", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(null);

      await expectErrorWithCode(
        service.exchangeCodeForTokens(CLIENT_ID, code, "secret"),
        ErrorCode.Unauthorized,
        "invalid_client",
        "client_not_found"
      );
    });

    it("throws invalid_grant on redirect uri mismatch", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(buildClientWithSecret());

      await expectErrorWithCode(
        service.exchangeCodeForTokens(CLIENT_ID, code, "secret", "https://other.com"),
        ErrorCode.BadRequest,
        "invalid_grant",
        "redirect_uri_mismatch"
      );
    });

    it("throws invalid_client when confidential client omits the secret", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(buildClientWithSecret());

      await expectErrorWithCode(
        service.exchangeCodeForTokens(CLIENT_ID, code),
        ErrorCode.Unauthorized,
        "invalid_client",
        "invalid_client_credentials"
      );
    });

    it("throws invalid_client when the secret hash does not match", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(buildClientWithSecret());

      await expectErrorWithCode(
        service.exchangeCodeForTokens(CLIENT_ID, code, "wrong", REDIRECT_URI),
        ErrorCode.Unauthorized,
        "invalid_client",
        "invalid_client_credentials"
      );
      expect(vi.mocked(generateSecret)).toHaveBeenCalledWith("wrong");
    });

    it("deletes expired codes then throws invalid_grant when the code is invalid", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(buildClientWithSecret());
      accessCodeRepository.findValidCode.mockResolvedValue(null);

      await expectErrorWithCode(
        service.exchangeCodeForTokens(CLIENT_ID, code, "secret"),
        ErrorCode.BadRequest,
        "invalid_grant",
        "code_invalid_or_expired"
      );
      expect(accessCodeRepository.findValidCode).toHaveBeenCalledWith(code, CLIENT_ID);
      expect(accessCodeRepository.deleteExpiredAndUsedCodes).toHaveBeenCalledWith(code, CLIENT_ID);
    });

    it("throws when the client is not approved for the code's user", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(
        buildClientWithSecret({ status: OAuthClientStatus.PENDING })
      );
      accessCodeRepository.findValidCode.mockResolvedValue(buildAccessCode({ userId: 42 }));

      await expectErrorWithCode(
        service.exchangeCodeForTokens(CLIENT_ID, code, "secret"),
        ErrorCode.Unauthorized,
        "unauthorized_client",
        "client_not_approved"
      );
    });

    it("issues tokens for a confidential client without PKCE", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(buildClientWithSecret());
      accessCodeRepository.findValidCode.mockResolvedValue(buildAccessCode({ teamId: 3, userId: null }));

      const tokens = await service.exchangeCodeForTokens(CLIENT_ID, code, "secret", REDIRECT_URI);

      expect(tokens.tokenType).toBe("bearer");
      expect(tokens.expiresIn).toBe(1800);
      const access = jwt.verify(tokens.accessToken, SECRET_KEY) as Record<string, unknown>;
      expect(access).toMatchObject({
        teamId: 3,
        scope: ["READ_PROFILE"],
        token_type: "Access Token",
        clientId: CLIENT_ID,
      });
      expect(access.userId).toBeNull();
      const refresh = jwt.verify(tokens.refreshToken, SECRET_KEY) as Record<string, unknown>;
      expect(refresh).toMatchObject({ token_type: "Refresh Token", clientId: CLIENT_ID });
      expect(refresh).not.toHaveProperty("codeChallenge");
    });

    it("returns invalid_request when PUBLIC client omits the verifier", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(
        buildClientWithSecret({ clientType: "PUBLIC", clientSecret: null })
      );
      accessCodeRepository.findValidCode.mockResolvedValue(
        buildAccessCode({ codeChallenge: s256("verifier"), codeChallengeMethod: "S256" })
      );

      await expectErrorWithCode(
        service.exchangeCodeForTokens(CLIENT_ID, code),
        ErrorCode.BadRequest,
        "invalid_request",
        "pkce_missing_parameters_or_invalid_method"
      );
    });

    it("returns invalid_request when the stored method is not S256", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(
        buildClientWithSecret({ clientType: "PUBLIC", clientSecret: null })
      );
      accessCodeRepository.findValidCode.mockResolvedValue(
        buildAccessCode({ codeChallenge: "challenge", codeChallengeMethod: "plain" })
      );

      await expectErrorWithCode(
        service.exchangeCodeForTokens(CLIENT_ID, code, undefined, undefined, "verifier"),
        ErrorCode.BadRequest,
        "invalid_request",
        "pkce_missing_parameters_or_invalid_method"
      );
    });

    it("returns invalid_grant when the verifier does not match the challenge", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(
        buildClientWithSecret({ clientType: "PUBLIC", clientSecret: null })
      );
      accessCodeRepository.findValidCode.mockResolvedValue(
        buildAccessCode({ codeChallenge: s256("verifier"), codeChallengeMethod: null })
      );

      await expectErrorWithCode(
        service.exchangeCodeForTokens(CLIENT_ID, code, undefined, undefined, "other"),
        ErrorCode.BadRequest,
        "invalid_grant",
        "pkce_verification_failed"
      );
    });

    it("issues tokens with PKCE data when a confidential client used a challenge", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(buildClientWithSecret());
      accessCodeRepository.findValidCode.mockResolvedValue(
        buildAccessCode({ codeChallenge: s256("verifier"), codeChallengeMethod: "S256" })
      );

      const tokens = await service.exchangeCodeForTokens(CLIENT_ID, code, "secret", undefined, "verifier");

      const refresh = jwt.verify(tokens.refreshToken, SECRET_KEY) as Record<string, unknown>;
      expect(refresh).toMatchObject({
        userId: 42,
        codeChallenge: s256("verifier"),
        codeChallengeMethod: "S256",
      });
    });

    it("throws server_error when the encryption key is missing", async () => {
      vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "");
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(buildClientWithSecret());
      accessCodeRepository.findValidCode.mockResolvedValue(buildAccessCode());

      await expectErrorWithCode(
        service.exchangeCodeForTokens(CLIENT_ID, code, "secret"),
        ErrorCode.InternalServerError,
        "server_error",
        "encryption_key_missing"
      );
    });
  });

  describe("refreshAccessToken", () => {
    const signRefresh = (payload: Record<string, unknown>, key = SECRET_KEY) =>
      jwt.sign(payload, key, { expiresIn: 60 });

    it("throws invalid_client when client is missing", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(null);

      await expectErrorWithCode(
        service.refreshAccessToken(CLIENT_ID, "token", "secret"),
        ErrorCode.Unauthorized,
        "invalid_client",
        "client_not_found"
      );
    });

    it("throws invalid_client on bad credentials", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(buildClientWithSecret());

      await expectErrorWithCode(
        service.refreshAccessToken(CLIENT_ID, "token", "wrong"),
        ErrorCode.Unauthorized,
        "invalid_client",
        "invalid_client_credentials"
      );
    });

    it("throws invalid_grant when the token signature is invalid", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(buildClientWithSecret());
      const token = signRefresh({ token_type: "Refresh Token", clientId: CLIENT_ID }, "other-key");

      await expectErrorWithCode(
        service.refreshAccessToken(CLIENT_ID, token, "secret"),
        ErrorCode.BadRequest,
        "invalid_grant",
        "invalid_refresh_token"
      );
    });

    it("throws invalid_grant when an access token is used as refresh token", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(buildClientWithSecret());
      const token = signRefresh({ token_type: "Access Token", clientId: CLIENT_ID });

      await expectErrorWithCode(
        service.refreshAccessToken(CLIENT_ID, token, "secret"),
        ErrorCode.BadRequest,
        "invalid_grant",
        "invalid_refresh_token"
      );
    });

    it("throws invalid_grant when the token belongs to another client", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(buildClientWithSecret());
      const token = signRefresh({ token_type: "Refresh Token", clientId: "other-client", scope: [] });

      await expectErrorWithCode(
        service.refreshAccessToken(CLIENT_ID, token, "secret"),
        ErrorCode.BadRequest,
        "invalid_grant",
        "client_id_mismatch"
      );
    });

    it("throws server_error when the encryption key is missing", async () => {
      vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "");
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(
        buildClientWithSecret({ clientType: "PUBLIC", clientSecret: null })
      );

      await expectErrorWithCode(
        service.refreshAccessToken(CLIENT_ID, "token"),
        ErrorCode.InternalServerError,
        "server_error",
        "encryption_key_missing"
      );
    });

    it("rejects a refresh when the client has since been rejected", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(
        buildClientWithSecret({ status: OAuthClientStatus.REJECTED })
      );
      const token = signRefresh({ token_type: "Refresh Token", clientId: CLIENT_ID, userId: 10, scope: [] });

      await expectErrorWithCode(
        service.refreshAccessToken(CLIENT_ID, token, "secret"),
        ErrorCode.Unauthorized,
        "unauthorized_client",
        "client_rejected"
      );
    });

    it("issues new tokens for a valid refresh token", async () => {
      oAuthClientRepository.findByClientIdWithSecret.mockResolvedValue(
        buildClientWithSecret({ clientType: "PUBLIC", clientSecret: null })
      );
      const token = signRefresh({
        token_type: "Refresh Token",
        clientId: CLIENT_ID,
        userId: 42,
        teamId: null,
        scope: ["READ_PROFILE"],
      });

      const tokens = await service.refreshAccessToken(CLIENT_ID, token);

      const access = jwt.verify(tokens.accessToken, SECRET_KEY) as Record<string, unknown>;
      expect(access).toMatchObject({
        userId: 42,
        scope: ["READ_PROFILE"],
        token_type: "Access Token",
        clientId: CLIENT_ID,
      });
      expect(tokens.expiresIn).toBe(1800);
      expect(tokens.tokenType).toBe("bearer");
    });
  });

  it("exposes descriptive messages for every error reason", () => {
    expect(OAUTH_ERROR_REASONS.client_not_found).toBe("OAuth client with ID not found");
    expect(Object.keys(OAUTH_ERROR_REASONS)).toHaveLength(15);
  });
});
