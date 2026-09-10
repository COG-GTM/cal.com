import { compare } from "bcryptjs";
import { describe, expect, it } from "vitest";
import { hashPassword } from "./hashPassword";
import { isPasswordValid } from "./isPasswordValid";

describe("hashPassword", () => {
  it("returns a bcrypt hash that matches the password", async () => {
    const hashed = await hashPassword("p4ssW0rd!");

    expect(hashed).not.toBe("p4ssW0rd!");
    await expect(compare("p4ssW0rd!", hashed)).resolves.toBe(true);
  });

  it("returns a different hash for a different password", async () => {
    await expect(compare("other", await hashPassword("p4ssW0rd!"))).resolves.toBe(false);
  });
});

describe("isPasswordValid", () => {
  it("accepts a password with lower, upper, number and enough length", () => {
    expect(isPasswordValid("p4ssW0rd")).toBe(true);
  });

  it("rejects passwords missing a character class", () => {
    expect(isPasswordValid("passw0rd")).toBe(false);
    expect(isPasswordValid("PASSW0RD")).toBe(false);
    expect(isPasswordValid("passWord")).toBe(false);
  });

  it("rejects passwords shorter than seven characters", () => {
    expect(isPasswordValid("p4ssW0")).toBe(false);
  });

  it("requires more than fourteen characters in strict mode", () => {
    expect(isPasswordValid("p4ssW0rd", true, true)).toEqual({
      caplow: true,
      num: true,
      min: false,
      admin_min: false,
    });
    expect(isPasswordValid("p4ssW0rdp4ssW0rd", true, true)).toEqual({
      caplow: true,
      num: true,
      min: true,
      admin_min: true,
    });
  });

  it("requires the admin length in strict mode without a breakdown", () => {
    expect(isPasswordValid("p4ssW0rd", false, true)).toBe(false);
    expect(isPasswordValid("p4ssW0rdp4ssW0rd", false, true)).toBe(true);
  });

  it("returns a breakdown without the admin key outside strict mode", () => {
    expect(isPasswordValid("passw0rd", true)).toEqual({ caplow: false, num: true, min: true });
  });
});
