import { Prisma } from "@calcom/prisma/client";
import { describe, expect, it } from "vitest";
import { getRequestedSlugError } from "./team-billing";

describe("getRequestedSlugError", () => {
  it("returns a helpful conflict for duplicate slugs", () => {
    const error = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6.16.1",
    });

    expect(getRequestedSlugError(error, "team-slug")).toEqual({
      statusCode: 400,
      message: expect.stringContaining("team-slug"),
    });
    expect(getRequestedSlugError(error, "team-slug").message).toContain("help@cal.com");
  });

  it("returns the original message for other errors", () => {
    const knownError = new Prisma.PrismaClientKnownRequestError("database down", {
      code: "P2025",
      clientVersion: "6.16.1",
    });

    expect(getRequestedSlugError(knownError, "team-slug")).toEqual({
      statusCode: 500,
      message: "database down",
    });
    expect(getRequestedSlugError(new Error("plain failure"), "team-slug")).toEqual({
      statusCode: 500,
      message: "plain failure",
    });
  });

  it.each([undefined, "failure"])("returns Unknown error for non-Error values: %s", (error) => {
    expect(getRequestedSlugError(error, "team-slug")).toEqual({
      statusCode: 500,
      message: "Unknown error",
    });
  });
});
