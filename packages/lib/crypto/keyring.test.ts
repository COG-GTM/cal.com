import { randomBytes } from "node:crypto";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptAndMaybeReencrypt, decryptSecret, encryptSecret, getKeyMaterial } from "./keyring";

const K1: string = randomBytes(32).toString("base64url");
const K2: string = randomBytes(32).toString("base64url");

const envelopeArgs = { ring: "CREDENTIALS" as const, plaintext: "my-secret", aad: { credentialId: 1 } };

describe("keyring", () => {
  beforeEach(() => {
    process.env.CALCOM_KEYRING_CREDENTIALS_CURRENT = "K1";
    process.env.CALCOM_KEYRING_CREDENTIALS_K1 = K1;
    process.env.CALCOM_KEYRING_CREDENTIALS_K2 = K2;
  });

  afterEach(() => {
    delete process.env.CALCOM_KEYRING_CREDENTIALS_CURRENT;
    delete process.env.CALCOM_KEYRING_CREDENTIALS_K1;
    delete process.env.CALCOM_KEYRING_CREDENTIALS_K2;
  });

  describe("getKeyMaterial", () => {
    it("returns the 32-byte key for a known kid", () => {
      expect(getKeyMaterial("CREDENTIALS", "K1")).toEqual(Buffer.from(K1, "base64url"));
    });

    it("throws for an unknown kid", () => {
      expect(() => getKeyMaterial("CREDENTIALS", "K9")).toThrow(/Unknown kid/);
    });

    it("throws when the key is not 32 bytes", () => {
      process.env.CALCOM_KEYRING_CREDENTIALS_K1 = randomBytes(16).toString("base64url");
      expect(() => getKeyMaterial("CREDENTIALS", "K1")).toThrow(/Invalid key length/);
    });
  });

  describe("encryptSecret / decryptSecret", () => {
    it("round-trips a secret with matching AAD", () => {
      const envelope = encryptSecret(envelopeArgs);
      expect(envelope).toMatchObject({ v: 1, alg: "AES-256-GCM", ring: "CREDENTIALS", kid: "K1" });
      expect(decryptSecret({ envelope, aad: envelopeArgs.aad })).toBe("my-secret");
    });

    it("supports array AAD and nested objects with stable key ordering", () => {
      const aad = [1, "x", null];
      const envelope = encryptSecret({ ...envelopeArgs, aad });
      expect(decryptSecret({ envelope, aad })).toBe("my-secret");

      const nestedEnvelope = encryptSecret({ ...envelopeArgs, aad: { b: 2, a: { d: [1], c: null } } });
      expect(decryptSecret({ envelope: nestedEnvelope, aad: { a: { c: null, d: [1] }, b: 2 } })).toBe(
        "my-secret"
      );
    });

    it("fails to decrypt with mismatched AAD", () => {
      const envelope = encryptSecret(envelopeArgs);
      expect(() => decryptSecret({ envelope, aad: { credentialId: 2 } })).toThrow();
    });

    it("throws when CURRENT env var is missing", () => {
      delete process.env.CALCOM_KEYRING_CREDENTIALS_CURRENT;
      expect(() => encryptSecret(envelopeArgs)).toThrow(/Missing env var/);
    });

    it("rejects unsupported envelope versions and algorithms", () => {
      const envelope = encryptSecret(envelopeArgs);
      expect(() =>
        decryptSecret({ envelope: { ...envelope, v: 2 as never }, aad: envelopeArgs.aad })
      ).toThrow(/Unsupported envelope version/);
      expect(() =>
        decryptSecret({ envelope: { ...envelope, alg: "AES-128-GCM" as never }, aad: envelopeArgs.aad })
      ).toThrow(/Unsupported envelope algorithm/);
    });
  });

  describe("decryptAndMaybeReencrypt", () => {
    it("returns null updatedEnvelope when kid is current", () => {
      const envelope = encryptSecret(envelopeArgs);
      const result = decryptAndMaybeReencrypt({ envelope, aad: envelopeArgs.aad });
      expect(result.plaintext).toBe("my-secret");
      expect(result.updatedEnvelope).toBeNull();
    });

    it("re-encrypts with the new key after rotation", () => {
      const envelope = encryptSecret(envelopeArgs);
      process.env.CALCOM_KEYRING_CREDENTIALS_CURRENT = "K2";
      const result = decryptAndMaybeReencrypt({ envelope, aad: envelopeArgs.aad });
      expect(result.plaintext).toBe("my-secret");
      expect(result.updatedEnvelope?.kid).toBe("K2");
      expect(
        decryptSecret({
          envelope: result.updatedEnvelope as NonNullable<typeof result.updatedEnvelope>,
          aad: envelopeArgs.aad,
        })
      ).toBe("my-secret");
    });
  });
});
