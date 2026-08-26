import { HttpError } from "@calcom/lib/http-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDomain, deleteDomain } from "./vercel";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const jsonResponse = (body: unknown) => ({ json: async () => body });

beforeEach(() => {
  vi.stubEnv("PROJECT_ID_VERCEL", "prj_123");
  vi.stubEnv("TEAM_ID_VERCEL", "team_123");
  vi.stubEnv("AUTH_BEARER_TOKEN_VERCEL", "vercel-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

describe("createDomain", () => {
  it("creates a domain and returns true on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await expect(createDomain("acme.cal.com")).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/domains?teamId=team_123");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer vercel-token");
    expect(JSON.parse(init.body)).toEqual({ name: "acme.cal.com" });
  });

  it("returns false when the response cannot be parsed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "not-an-object" }));
    await expect(createDomain("acme.cal.com")).resolves.toBe(false);
  });

  it("returns true when the domain is already in use by this project", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "domain_already_in_use" } }));
    await expect(createDomain("acme.cal.com")).resolves.toBe(true);
  });

  it("throws HttpError when permission is denied", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "forbidden" } }));
    await expect(createDomain("acme.cal.com")).rejects.toThrow(
      "Vercel denied permission to manage this domain"
    );
  });

  it("throws HttpError when the domain is taken", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "domain_taken" } }));
    await expect(createDomain("acme.cal.com")).rejects.toThrow(
      "Domain is already being used by a different project"
    );
  });

  it("throws HttpError for unknown errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "unknown", domain: "acme.cal.com" } }));
    await expect(createDomain("acme.cal.com")).rejects.toThrow(HttpError);
  });

  it("throws when required env vars are missing", async () => {
    vi.stubEnv("PROJECT_ID_VERCEL", "");
    await expect(createDomain("acme.cal.com")).rejects.toThrow("Missing env var: PROJECT_ID_VERCEL");
    vi.stubEnv("PROJECT_ID_VERCEL", "prj_123");
    vi.stubEnv("AUTH_BEARER_TOKEN_VERCEL", "");
    await expect(createDomain("acme.cal.com")).rejects.toThrow("Missing env var: AUTH_BEARER_TOKEN_VERCEL");
  });
});

describe("deleteDomain", () => {
  it("deletes a domain and returns true on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await expect(deleteDomain("acme.cal.com")).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/domains/acme.cal.com?teamId=team_123");
    expect(init.method).toBe("DELETE");
  });

  it("returns true when the domain was already deleted", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "not_found" } }));
    await expect(deleteDomain("acme.cal.com")).resolves.toBe(true);
  });

  it("throws HttpError when permission is denied", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "forbidden" } }));
    await expect(deleteDomain("acme.cal.com")).rejects.toThrow(HttpError);
  });

  it("throws HttpError for unknown errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "unknown", domain: "acme.cal.com" } }));
    await expect(deleteDomain("acme.cal.com")).rejects.toThrow(
      "Failed to take action for domain: acme.cal.com"
    );
  });
});
