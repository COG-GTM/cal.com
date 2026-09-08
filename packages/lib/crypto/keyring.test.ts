import { randomBytes } from "node:crypto";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptAndMaybeReencrypt, decryptSecret, encryptSecret, getKeyMaterial } from "./keyring";

const KEY_K1 = randomBytes(32).toString("base64url");
const KEY_K2 = randomBytes(32).toString("base64url");
const aad = { credentialId: 1, userId: 2, type: "google_calendar" };

describe("keyring", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.CALCOM_KEYRING_CREDENTIALS_CURRENT = "k1";
    process.env.CALCOM_KEYRING_CREDENTIALS_K1 = KEY_K1;
    process.env.CALCOM_KEYRING_CREDENTIALS_K2 = KEY_K2;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  describe("getKeyMaterial", () => {
    it("returns the 32 byte key for the given kid, case-insensitively", () => {
      expect(getKeyMaterial("CREDENTIALS", "k1")).toEqual(Buffer.from(KEY_K1, "base64url"));
      expect(getKeyMaterial("CREDENTIALS", "K1")).toEqual(Buffer.from(KEY_K1, "base64url"));
    });

    it("throws when the env var for the kid is missing", () => {
      expect(() => getKeyMaterial("CREDENTIALS", "k9")).toThrow(
        "Unknown kid for ring=CREDENTIALS: missing env var CALCOM_KEYRING_CREDENTIALS_K9"
      );
    });

    it("throws when the key is not 32 bytes", () => {
      process.env.CALCOM_KEYRING_CREDENTIALS_K3 = randomBytes(16).toString("base64url");

      expect(() => getKeyMaterial("CREDENTIALS", "k3")).toThrow("Expected 32 bytes, got 16");
    });

    it("throws when the ring name is not all caps", () => {
      expect(() => getKeyMaterial("Credentials" as "CREDENTIALS", "k1")).toThrow(
        "Keyring name must be ALL CAPS. Got: Credentials"
      );
    });
  });

  describe("encryptSecret", () => {
    it("produces an envelope that round-trips back to the plaintext", () => {
      const envelope = encryptSecret({ ring: "CREDENTIALS", plaintext: "super-secret", aad });

      expect(envelope).toMatchObject({ v: 1, alg: "AES-256-GCM", ring: "CREDENTIALS", kid: "k1" });
      expect(decryptSecret({ envelope, aad })).toBe("super-secret");
    });

    it("uses a fresh nonce so the same plaintext encrypts differently each time", () => {
      const first = encryptSecret({ ring: "CREDENTIALS", plaintext: "super-secret", aad });
      const second = encryptSecret({ ring: "CREDENTIALS", plaintext: "super-secret", aad });

      expect(first.nonce).not.toBe(second.nonce);
      expect(first.ct).not.toBe(second.ct);
    });

    it("throws when the current kid env var is missing", () => {
      delete process.env.CALCOM_KEYRING_CREDENTIALS_CURRENT;

      expect(() => encryptSecret({ ring: "CREDENTIALS", plaintext: "x", aad })).toThrow(
        "Missing env var CALCOM_KEYRING_CREDENTIALS_CURRENT"
      );
    });
  });

  describe("decryptSecret", () => {
    it("accepts additional authenticated data whose keys are ordered differently", () => {
      const envelope = encryptSecret({ ring: "CREDENTIALS", plaintext: "super-secret", aad });

      const reordered = { type: "google_calendar", userId: 2, credentialId: 1 };
      expect(decryptSecret({ envelope, aad: reordered })).toBe("super-secret");
    });

    it("supports array additional authenticated data", () => {
      const arrayAad = ["read", 1, true, null];
      const envelope = encryptSecret({ ring: "CREDENTIALS", plaintext: "super-secret", aad: arrayAad });

      expect(decryptSecret({ envelope, aad: [...arrayAad] })).toBe("super-secret");
      expect(() => decryptSecret({ envelope, aad: ["read", 1, true] })).toThrow();
    });

    it("fails when the additional authenticated data does not match", () => {
      const envelope = encryptSecret({ ring: "CREDENTIALS", plaintext: "super-secret", aad });

      expect(() => decryptSecret({ envelope, aad: { ...aad, credentialId: 999 } })).toThrow();
    });

    it("fails when the ciphertext has been tampered with", () => {
      const envelope = encryptSecret({ ring: "CREDENTIALS", plaintext: "super-secret", aad });
      const tampered = { ...envelope, ct: Buffer.from("tampered", "utf8").toString("base64url") };

      expect(() => decryptSecret({ envelope: tampered, aad })).toThrow();
    });

    it("rejects unsupported envelope versions and algorithms", () => {
      const envelope = encryptSecret({ ring: "CREDENTIALS", plaintext: "super-secret", aad });

      expect(() => decryptSecret({ envelope: { ...envelope, v: 2 as 1 }, aad })).toThrow(
        "Unsupported envelope version: 2"
      );
      expect(() =>
        decryptSecret({ envelope: { ...envelope, alg: "AES-128-GCM" as "AES-256-GCM" }, aad })
      ).toThrow("Unsupported envelope algorithm: AES-128-GCM");
    });
  });

  describe("decryptAndMaybeReencrypt", () => {
    it("does not re-encrypt when the envelope already uses the current kid", () => {
      const envelope = encryptSecret({ ring: "CREDENTIALS", plaintext: "super-secret", aad });

      const { plaintext, updatedEnvelope } = decryptAndMaybeReencrypt({ envelope, aad });

      expect(plaintext).toBe("super-secret");
      expect(updatedEnvelope).toBeNull();
    });

    it("re-encrypts with the current kid when the envelope uses a rotated-out key", () => {
      process.env.CALCOM_KEYRING_CREDENTIALS_CURRENT = "k2";
      const oldEnvelope = encryptSecret({ ring: "CREDENTIALS", plaintext: "super-secret", aad });
      process.env.CALCOM_KEYRING_CREDENTIALS_CURRENT = "k1";

      const { plaintext, updatedEnvelope } = decryptAndMaybeReencrypt({ envelope: oldEnvelope, aad });

      expect(plaintext).toBe("super-secret");
      expect(updatedEnvelope?.kid).toBe("k1");
      expect(decryptSecret({ envelope: updatedEnvelope as NonNullable<typeof updatedEnvelope>, aad })).toBe(
        "super-secret"
      );
    });
  });
});
