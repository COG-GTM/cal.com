import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSecret, hashSecretKey } from "./generateSecret";

describe("generateSecret", () => {
  it("hashes a secret with sha256", () => {
    const secret = "oauth-client-secret";

    expect(hashSecretKey(secret)).toBe(createHash("sha256").update(secret).digest("hex"));
  });

  it("returns the hash and provided secret", () => {
    const secret = "provided-secret";

    expect(generateSecret(secret)).toEqual([hashSecretKey(secret), secret]);
  });

  it("generates a secret when none is provided", () => {
    const [hash, secret] = generateSecret();

    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashSecretKey(secret));
  });
});
