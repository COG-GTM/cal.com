import { createHash } from "node:crypto";
import process from "node:process";
import { OAUTH_ERROR_REASONS, OAuthService } from "@calcom/features/oauth/services/OAuthService";
import { hashSecretKey } from "@calcom/features/oauth/utils/generateSecret";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { AccessScope } from "@calcom/prisma/enums";
import { OAuthClientStatus as ClientStatus } from "@calcom/prisma/enums";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamRepository } from "../../ee/teams/repositories/TeamRepository";
import type { AccessCodeRepository } from "../repositories/AccessCodeRepository";
import type { OAuthClientRepository } from "../repositories/OAuthClientRepository";

const redirectUri = "https://client.example/callback";
const scopes: AccessScope[] = ["READ_BOOKING", "READ_PROFILE"];
const encryptionKey = "test-secret";

const oAuthClientRepository = {
  findByClientId: vi.fn(),
  findByClientIdWithSecret: vi.fn(),
} as unknown as OAuthClientRepository;
const accessCodeRepository = {
  create: vi.fn(),
  findValidCode: vi.fn(),
  deleteExpiredAndUsedCodes: vi.fn(),
} as unknown as AccessCodeRepository;
const teamsRepository = {
  findTeamBySlugWithAdminRole: vi.fn(),
} as unknown as TeamRepository;

const makeClient = (overrides: Record<string, unknown> = {}) => ({
  clientId: "client-id",
  redirectUri,
  name: "Test client",
  logo: "https://client.example/logo.png",
  isTrusted: false,
  clientType: "CONFIDENTIAL" as const,
  status: ClientStatus.APPROVED,
  userId: 1,
  clientSecret: null,
  ...overrides,
});

const makeAccessCode = (overrides: Record<string, unknown> = {}) => ({
  userId: 1,
  teamId: null,
  scopes,
  codeChallenge: null,
  codeChallengeMethod: null,
  ...overrides,
});

const validVerifier = "correct-verifier";
const validChallenge = createHash("sha256").update(validVerifier).digest("base64url");

describe("OAuthService", () => {
  let service: OAuthService;
  let originalEncryptionKey: string | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
    originalEncryptionKey = process.env.CALENDSO_ENCRYPTION_KEY;
    process.env.CALENDSO_ENCRYPTION_KEY = encryptionKey;
    service = new OAuthService({
      oAuthClientRepository,
      accessCodeRepository,
      teamsRepository,
    });
  });

  afterEach(() => {
    if (originalEncryptionKey === undefined) {
      delete process.env.CALENDSO_ENCRYPTION_KEY;
    } else {
      process.env.CALENDSO_ENCRYPTION_KEY = originalEncryptionKey;
    }
  });

  describe("getClient", () => {
    it("rejects a missing client", async () => {
      vi.mocked(oAuthClientRepository.findByClientId).mockResolvedValue(null);

      await expect(service.getClient("missing")).rejects.toMatchObject({
        code: ErrorCode.NotFound,
        message: "unauthorized_client",
        data: { reason: "client_not_found" },
      });
    });

    it("returns the public client shape", async () => {
      const client = makeClient({ purpose: "Calendar", websiteUrl: "https://client.example" });
      vi.mocked(oAuthClientRepository.findByClientId).mockResolvedValue(client);

      await expect(service.getClient("client-id")).resolves.toEqual({
        clientId: "client-id",
        redirectUri,
        name: "Test client",
        logo: "https://client.example/logo.png",
        isTrusted: false,
        clientType: "CONFIDENTIAL",
      });
    });
  });

  describe("getClientForAuthorization", () => {
    it("rejects a missing client and a mismatched redirect URI", async () => {
      vi.mocked(oAuthClientRepository.findByClientId).mockResolvedValue(null);
      await expect(service.getClientForAuthorization("missing", redirectUri)).rejects.toMatchObject({
        code: ErrorCode.NotFound,
        message: "unauthorized_client",
        data: { reason: "client_not_found" },
      });

      vi.mocked(oAuthClientRepository.findByClientId).mockResolvedValue(makeClient());
      await expect(
        service.getClientForAuthorization("client-id", "https://wrong.example")
      ).rejects.toMatchObject({
        code: ErrorCode.BadRequest,
        message: "invalid_request",
        data: { reason: "redirect_uri_mismatch" },
      });
    });

    it.each([
      { status: ClientStatus.REJECTED, reason: "client_rejected" },
      { status: ClientStatus.PENDING, reason: "client_not_approved" },
    ])("rejects a $status client when the caller is not the owner", async ({ status, reason }) => {
      vi.mocked(oAuthClientRepository.findByClientId).mockResolvedValue(makeClient({ status, userId: 1 }));

      await expect(service.getClientForAuthorization("client-id", redirectUri, 2)).rejects.toMatchObject({
        code: ErrorCode.Unauthorized,
        message: "unauthorized_client",
        data: { reason },
      });
    });

    it("allows the pending owner and approved clients", async () => {
      const pending = makeClient({ status: ClientStatus.PENDING });
      vi.mocked(oAuthClientRepository.findByClientId).mockResolvedValue(pending);
      await expect(service.getClientForAuthorization("client-id", redirectUri, 1)).resolves.toMatchObject({
        clientId: "client-id",
      });

      const approved = makeClient({ status: ClientStatus.APPROVED });
      vi.mocked(oAuthClientRepository.findByClientId).mockResolvedValue(approved);
      await expect(service.getClientForAuthorization("client-id", redirectUri)).resolves.toEqual({
        clientId: "client-id",
        redirectUri,
        name: "Test client",
        logo: "https://client.example/logo.png",
        isTrusted: false,
        clientType: "CONFIDENTIAL",
      });
    });
  });

  describe("generateAuthorizationCode", () => {
    it("validates client, PKCE, and team access", async () => {
      vi.mocked(oAuthClientRepository.findByClientId).mockResolvedValue(null);
      await expect(
        service.generateAuthorizationCode("missing", 1, redirectUri, scopes)
      ).rejects.toMatchObject({
        code: ErrorCode.Unauthorized,
        message: "unauthorized_client",
      });

      const publicClient = makeClient({ clientType: "PUBLIC" });
      vi.mocked(oAuthClientRepository.findByClientId).mockResolvedValue(publicClient);
      await expect(
        service.generateAuthorizationCode("client-id", 1, redirectUri, scopes)
      ).rejects.toMatchObject({
        code: ErrorCode.BadRequest,
        data: { reason: "pkce_required" },
      });
      await expect(
        service.generateAuthorizationCode(
          "client-id",
          1,
          redirectUri,
          scopes,
          undefined,
          undefined,
          "challenge"
        )
      ).rejects.toMatchObject({ data: { reason: "invalid_code_challenge_method" } });
      await expect(
        service.generateAuthorizationCode(
          "client-id",
          1,
          redirectUri,
          scopes,
          undefined,
          undefined,
          "challenge",
          "plain"
        )
      ).rejects.toMatchObject({ data: { reason: "invalid_code_challenge_method" } });

      const confidentialClient = makeClient();
      vi.mocked(oAuthClientRepository.findByClientId).mockResolvedValue(confidentialClient);
      await expect(
        service.generateAuthorizationCode(
          "client-id",
          1,
          redirectUri,
          scopes,
          undefined,
          undefined,
          "challenge",
          "plain"
        )
      ).rejects.toMatchObject({ data: { reason: "invalid_code_challenge_method" } });

      vi.mocked(teamsRepository.findTeamBySlugWithAdminRole).mockResolvedValue(null);
      await expect(
        service.generateAuthorizationCode("client-id", 1, redirectUri, scopes, undefined, "missing-team")
      ).rejects.toMatchObject({
        code: ErrorCode.Unauthorized,
        message: "access_denied",
        data: { reason: "team_not_found_or_no_access" },
      });
    });

    it("creates a team authorization code and redirects with state", async () => {
      vi.mocked(oAuthClientRepository.findByClientId).mockResolvedValue(makeClient());
      vi.mocked(teamsRepository.findTeamBySlugWithAdminRole).mockResolvedValue({ id: 42 });

      const result = await service.generateAuthorizationCode(
        "client-id",
        1,
        redirectUri,
        scopes,
        "state value",
        "team-slug"
      );

      expect(result.client.clientId).toBe("client-id");
      expect(result.authorizationCode).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(new URL(result.redirectUrl).searchParams.get("code")).toBe(result.authorizationCode);
      expect(new URL(result.redirectUrl).searchParams.get("state")).toBe("state value");
      expect(accessCodeRepository.create).toHaveBeenCalledWith({
        code: result.authorizationCode,
        clientId: "client-id",
        userId: undefined,
        teamId: 42,
        scopes,
        codeChallenge: undefined,
        codeChallengeMethod: undefined,
      });
    });

    it("creates a user authorization code without an optional state", async () => {
      vi.mocked(oAuthClientRepository.findByClientId).mockResolvedValue(makeClient());

      const result = await service.generateAuthorizationCode("client-id", 1, redirectUri, scopes);

      expect(new URL(result.redirectUrl).searchParams.has("state")).toBe(false);
      expect(accessCodeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, teamId: undefined })
      );
    });

    it("builds redirect URLs without undefined parameters", () => {
      expect(
        service.buildRedirectUrl("https://client.example/callback?existing=value", {
          code: "code",
          state: undefined,
        })
      ).toBe("https://client.example/callback?existing=value&code=code");
    });
  });

  describe("buildErrorRedirectUrl", () => {
    it("maps OAuth messages and preserves reasons and state", () => {
      const url = service.buildErrorRedirectUrl(
        redirectUri,
        new ErrorWithCode(ErrorCode.BadRequest, "invalid_grant", { reason: "custom_reason" }),
        "state"
      );
      expect(new URL(url).searchParams).toEqual(
        new URLSearchParams({
          error: "invalid_grant",
          error_description: "custom_reason",
          state: "state",
        })
      );
    });

    it.each([
      { error: new ErrorWithCode(ErrorCode.BadRequest, "not_oauth"), expected: "not_oauth" },
      { error: new ErrorWithCode(ErrorCode.Unauthorized, "not_oauth"), expected: "not_oauth" },
      { error: new ErrorWithCode(ErrorCode.InternalServerError, "not_oauth"), expected: "not_oauth" },
    ])("maps $error.code errors by error code", ({ error, expected }) => {
      const params = new URL(service.buildErrorRedirectUrl(redirectUri, error)).searchParams;
      expect(params.get("error")).toBe(
        error.code === ErrorCode.BadRequest
          ? "invalid_request"
          : error.code === ErrorCode.Unauthorized
            ? "unauthorized_client"
            : "server_error"
      );
      expect(params.get("error_description")).toBe(expected);
    });

    it("falls back to the OAuth message and handles unknown errors", () => {
      const withoutReason = service.buildErrorRedirectUrl(
        redirectUri,
        new ErrorWithCode(ErrorCode.BadRequest, "invalid_request")
      );
      expect(new URL(withoutReason).searchParams.get("error_description")).toBe("invalid_request");

      const unknown = new URL(service.buildErrorRedirectUrl(redirectUri, new Error("boom"), "state"));
      expect(unknown.searchParams.get("error")).toBe("server_error");
      expect(unknown.searchParams.get("error_description")).toBe("An unexpected error occurred");
      expect(unknown.searchParams.get("state")).toBe("state");
    });
  });

  describe("exchangeCodeForTokens", () => {
    it("rejects missing clients, redirect mismatches, and bad credentials", async () => {
      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(null);
      await expect(service.exchangeCodeForTokens("missing", "code")).rejects.toMatchObject({
        code: ErrorCode.Unauthorized,
        message: "invalid_client",
      });

      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(makeClient());
      await expect(
        service.exchangeCodeForTokens("client-id", "code", undefined, "https://wrong.example")
      ).rejects.toMatchObject({ code: ErrorCode.BadRequest, data: { reason: "redirect_uri_mismatch" } });
      await expect(service.exchangeCodeForTokens("client-id", "code")).rejects.toMatchObject({
        data: { reason: "invalid_client_credentials" },
      });

      const confidential = makeClient({ clientSecret: hashSecretKey("right") });
      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(confidential);
      await expect(service.exchangeCodeForTokens("client-id", "code", "wrong")).rejects.toMatchObject({
        data: { reason: "invalid_client_credentials" },
      });
    });

    it("deletes used codes even when the code is invalid", async () => {
      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(
        makeClient({ clientType: "PUBLIC" })
      );
      vi.mocked(accessCodeRepository.findValidCode).mockResolvedValue(null);

      await expect(service.exchangeCodeForTokens("client-id", "code")).rejects.toMatchObject({
        code: ErrorCode.BadRequest,
        message: "invalid_grant",
        data: { reason: "code_invalid_or_expired" },
      });
      expect(accessCodeRepository.deleteExpiredAndUsedCodes).toHaveBeenCalledWith("code", "client-id");
    });

    it("enforces client approval and PKCE", async () => {
      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(
        makeClient({ clientType: "PUBLIC", status: ClientStatus.PENDING })
      );
      vi.mocked(accessCodeRepository.findValidCode).mockResolvedValue(makeAccessCode({ userId: 2 }));
      await expect(service.exchangeCodeForTokens("client-id", "code")).rejects.toMatchObject({
        data: { reason: "client_not_approved" },
      });

      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(
        makeClient({ clientType: "PUBLIC" })
      );
      vi.mocked(accessCodeRepository.findValidCode).mockResolvedValue(makeAccessCode());
      await expect(service.exchangeCodeForTokens("client-id", "code")).rejects.toMatchObject({
        code: ErrorCode.BadRequest,
        message: "invalid_request",
        data: { reason: "pkce_missing_parameters_or_invalid_method" },
      });
      vi.mocked(accessCodeRepository.findValidCode).mockResolvedValue(
        makeAccessCode({ codeChallenge: validChallenge, codeChallengeMethod: "plain" })
      );
      await expect(
        service.exchangeCodeForTokens("client-id", "code", undefined, undefined, validVerifier)
      ).rejects.toMatchObject({
        data: { reason: "pkce_missing_parameters_or_invalid_method" },
      });
      vi.mocked(accessCodeRepository.findValidCode).mockResolvedValue(
        makeAccessCode({ codeChallenge: validChallenge })
      );
      await expect(
        service.exchangeCodeForTokens("client-id", "code", undefined, undefined, "wrong")
      ).rejects.toMatchObject({
        code: ErrorCode.BadRequest,
        message: "invalid_grant",
        data: { reason: "pkce_verification_failed" },
      });
    });

    it("returns access and refresh tokens for valid PKCE and non-PKCE clients", async () => {
      const client = makeClient({ clientType: "PUBLIC" });
      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(client);
      vi.mocked(accessCodeRepository.findValidCode).mockResolvedValue(
        makeAccessCode({ teamId: 9, codeChallenge: validChallenge, codeChallengeMethod: "S256" })
      );

      const tokens = await service.exchangeCodeForTokens(
        "client-id",
        "code",
        undefined,
        redirectUri,
        validVerifier
      );
      expect(tokens).toMatchObject({ tokenType: "bearer", expiresIn: 1800 });
      expect(jwt.verify(tokens.accessToken, encryptionKey)).toMatchObject({
        token_type: "Access Token",
        clientId: "client-id",
        userId: 1,
        teamId: 9,
        scope: scopes,
      });
      expect(jwt.verify(tokens.refreshToken, encryptionKey)).toMatchObject({
        token_type: "Refresh Token",
        codeChallenge: validChallenge,
        codeChallengeMethod: "S256",
      });

      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(
        makeClient({ clientType: "CONFIDENTIAL", clientSecret: hashSecretKey("secret") })
      );
      vi.mocked(accessCodeRepository.findValidCode).mockResolvedValue(makeAccessCode());
      const confidentialTokens = await service.exchangeCodeForTokens("client-id", "code", "secret");
      expect(jwt.verify(confidentialTokens.refreshToken, encryptionKey)).not.toHaveProperty("codeChallenge");
    });

    it("reports a missing encryption key", async () => {
      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(
        makeClient({ clientSecret: hashSecretKey("secret") })
      );
      vi.mocked(accessCodeRepository.findValidCode).mockResolvedValue(makeAccessCode());
      delete process.env.CALENDSO_ENCRYPTION_KEY;

      await expect(service.exchangeCodeForTokens("client-id", "code", "secret")).rejects.toMatchObject({
        code: ErrorCode.InternalServerError,
        message: "server_error",
        data: { reason: "encryption_key_missing" },
      });
    });
  });

  describe("refreshAccessToken", () => {
    it("rejects invalid clients, credentials, and tokens", async () => {
      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(null);
      await expect(service.refreshAccessToken("missing", "token")).rejects.toMatchObject({
        data: { reason: "client_not_found" },
      });

      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(makeClient());
      await expect(service.refreshAccessToken("client-id", "token")).rejects.toMatchObject({
        data: { reason: "invalid_client_credentials" },
      });
      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(
        makeClient({ clientType: "PUBLIC" })
      );
      await expect(service.refreshAccessToken("client-id", "garbage")).rejects.toMatchObject({
        code: ErrorCode.BadRequest,
        message: "invalid_grant",
        data: { reason: "invalid_refresh_token" },
      });
    });

    it("rejects access tokens, mismatched clients, and rejected clients", async () => {
      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(
        makeClient({ clientType: "PUBLIC" })
      );
      const accessToken = jwt.sign({ token_type: "Access Token" }, encryptionKey);
      await expect(service.refreshAccessToken("client-id", accessToken)).rejects.toMatchObject({
        data: { reason: "invalid_refresh_token" },
      });

      const otherClientToken = jwt.sign(
        { token_type: "Refresh Token", clientId: "other-client", scope: scopes },
        encryptionKey
      );
      await expect(service.refreshAccessToken("client-id", otherClientToken)).rejects.toMatchObject({
        data: { reason: "client_id_mismatch" },
      });

      const rejectedToken = jwt.sign(
        { token_type: "Refresh Token", clientId: "client-id", userId: 1, scope: scopes },
        encryptionKey
      );
      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(
        makeClient({ clientType: "PUBLIC", status: ClientStatus.REJECTED })
      );
      await expect(service.refreshAccessToken("client-id", rejectedToken)).rejects.toMatchObject({
        data: { reason: "client_rejected" },
      });
    });

    it("refreshes tokens with the same claims", async () => {
      const refreshToken = jwt.sign(
        { token_type: "Refresh Token", clientId: "client-id", userId: 1, teamId: 9, scope: scopes },
        encryptionKey
      );
      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(
        makeClient({ clientType: "PUBLIC" })
      );

      const tokens = await service.refreshAccessToken("client-id", refreshToken);
      expect(jwt.verify(tokens.accessToken, encryptionKey)).toMatchObject({
        token_type: "Access Token",
        clientId: "client-id",
        userId: 1,
        teamId: 9,
        scope: scopes,
      });
      expect(jwt.verify(tokens.refreshToken, encryptionKey)).toMatchObject({
        token_type: "Refresh Token",
        clientId: "client-id",
        userId: 1,
        teamId: 9,
        scope: scopes,
      });
    });

    it("reports a missing encryption key after token signing", async () => {
      const refreshToken = jwt.sign(
        { token_type: "Refresh Token", clientId: "client-id", scope: scopes },
        encryptionKey
      );
      vi.mocked(oAuthClientRepository.findByClientIdWithSecret).mockResolvedValue(
        makeClient({ clientType: "PUBLIC" })
      );
      delete process.env.CALENDSO_ENCRYPTION_KEY;

      await expect(service.refreshAccessToken("client-id", refreshToken)).rejects.toMatchObject({
        code: ErrorCode.InternalServerError,
        message: "server_error",
        data: { reason: "encryption_key_missing" },
      });
    });
  });

  it("defines a non-empty message for every OAuth error reason", () => {
    expect(Object.keys(OAUTH_ERROR_REASONS)).toHaveLength(15);
    expect(Object.values(OAUTH_ERROR_REASONS).every((reason) => reason.length > 0)).toBe(true);
  });
});
