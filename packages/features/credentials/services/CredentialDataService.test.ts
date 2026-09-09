import { encryptSecret } from "@calcom/lib/crypto/keyring";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCredentialCreateData } from "./CredentialDataService";

vi.mock("@calcom/lib/crypto/keyring", () => ({
  encryptSecret: vi.fn(),
}));

const mockEncryptSecret = vi.mocked(encryptSecret);

const buildInput = (overrides: Partial<Parameters<typeof buildCredentialCreateData>[0]> = {}) => ({
  type: "google_calendar",
  key: { refresh_token: "token" },
  userId: 1,
  appId: "google-calendar",
  ...overrides,
});

const envelope = {
  v: 1 as const,
  alg: "AES-256-GCM" as const,
  ring: "CREDENTIALS" as const,
  kid: "k1",
  nonce: "nonce",
  ct: "ciphertext",
  tag: "tag",
};

describe("buildCredentialCreateData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("encrypts the key with the credential type as AAD and serializes the envelope", () => {
    mockEncryptSecret.mockReturnValue(envelope);

    const input = buildInput();
    const result = buildCredentialCreateData(input);

    expect(mockEncryptSecret).toHaveBeenCalledWith({
      ring: "CREDENTIALS",
      plaintext: JSON.stringify(input.key),
      aad: { type: input.type },
    });
    expect(result.encryptedKey).toBe(JSON.stringify(envelope));
  });

  it("preserves the plaintext key and the rest of the input", () => {
    mockEncryptSecret.mockReturnValue(envelope);

    const input = buildInput({ delegationCredentialId: "delegation-1" });
    const result = buildCredentialCreateData(input);

    expect(result).toMatchObject({
      type: input.type,
      key: input.key,
      userId: input.userId,
      appId: input.appId,
      delegationCredentialId: "delegation-1",
    });
  });

  it("omits encryptedKey when the keyring is not configured", () => {
    mockEncryptSecret.mockImplementation(() => {
      throw new Error("Missing env var CALCOM_KEYRING_CREDENTIALS_CURRENT");
    });

    const result = buildCredentialCreateData(buildInput());

    expect(result).not.toHaveProperty("encryptedKey");
    expect(result.key).toEqual({ refresh_token: "token" });
  });
});
