import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSecret, hashSecretKey } from "./generateSecret";

describe("hashSecretKey", () => {
  it("returns the sha256 hex digest of the input", () => {
    expect(hashSecretKey("my-secret")).toBe(createHash("sha256").update("my-secret").digest("hex"));
  });

  it("is deterministic and collision free for different inputs", () => {
    expect(hashSecretKey("a")).toBe(hashSecretKey("a"));
    expect(hashSecretKey("a")).not.toBe(hashSecretKey("b"));
  });
});

describe("generateSecret", () => {
  it("hashes the provided secret and returns it alongside the plaintext", () => {
    const [hashed, plain] = generateSecret("known-secret");

    expect(plain).toBe("known-secret");
    expect(hashed).toBe(hashSecretKey("known-secret"));
  });

  it("generates a random 32 byte hex secret when none is provided", () => {
    const [hashed, plain] = generateSecret();
    const [otherHashed, otherPlain] = generateSecret();

    expect(plain).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).toBe(hashSecretKey(plain));
    expect(plain).not.toBe(otherPlain);
    expect(hashed).not.toBe(otherHashed);
  });
});
