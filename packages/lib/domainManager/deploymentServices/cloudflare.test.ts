import { HttpError } from "@calcom/lib/http-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDnsRecord, deleteDnsRecord } from "./cloudflare";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const jsonResponse = (body: unknown) => ({ json: async () => body });

beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_VERCEL_CNAME", "cname.vercel-dns.com");
  vi.stubEnv("CLOUDFLARE_ZONE_ID", "zone-1");
  vi.stubEnv("AUTH_BEARER_TOKEN_CLOUDFLARE", "cf-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

describe("addDnsRecord", () => {
  it("creates a CNAME record and returns true on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, result: { id: "rec-1" } }));

    await expect(addDnsRecord("acme.cal.com")).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/dns_records");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer cf-token");
    expect(JSON.parse(init.body)).toMatchObject({
      type: "CNAME",
      name: "acme.cal.com",
      content: "cname.vercel-dns.com",
    });
  });

  it("returns true when the record already exists", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, errors: [{ code: 81057 }] }));
    await expect(addDnsRecord("acme.cal.com")).resolves.toBe(true);
  });

  it("throws HttpError on other failures", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, errors: [{ code: 999 }] }));
    await expect(addDnsRecord("acme.cal.com")).rejects.toThrow(HttpError);
  });

  it("throws HttpError when the response cannot be parsed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: "not-a-boolean" }));
    await expect(addDnsRecord("acme.cal.com")).rejects.toThrow("Something went wrong");
  });

  it("throws when required env vars are missing", async () => {
    vi.stubEnv("CLOUDFLARE_VERCEL_CNAME", "");
    await expect(addDnsRecord("acme.cal.com")).rejects.toThrow("Missing env var: CLOUDFLARE_VERCEL_CNAME");
    vi.stubEnv("CLOUDFLARE_VERCEL_CNAME", "cname.vercel-dns.com");
    vi.stubEnv("CLOUDFLARE_ZONE_ID", "");
    await expect(addDnsRecord("acme.cal.com")).rejects.toThrow("Missing env var: CLOUDFLARE_ZONE_ID");
    vi.stubEnv("CLOUDFLARE_ZONE_ID", "zone-1");
    vi.stubEnv("AUTH_BEARER_TOKEN_CLOUDFLARE", "");
    await expect(addDnsRecord("acme.cal.com")).rejects.toThrow(
      "Missing env var: AUTH_BEARER_TOKEN_CLOUDFLARE"
    );
  });
});

describe("deleteDnsRecord", () => {
  it("finds and deletes the record", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ success: true, result: [{ id: "rec-1" }] }))
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { id: "rec-1" } }));

    await expect(deleteDnsRecord("acme.cal.com")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("/dns_records/rec-1");
    expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
  });

  it("returns true when there is nothing to delete", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, result: [] }));
    await expect(deleteDnsRecord("acme.cal.com")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the search fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, result: null }));
    await expect(deleteDnsRecord("acme.cal.com")).rejects.toThrow(HttpError);
  });

  it("throws when more than one record matches", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, result: [{ id: "rec-1" }, { id: "rec-2" }] })
    );
    await expect(deleteDnsRecord("acme.cal.com")).rejects.toThrow(HttpError);
  });

  it("returns true when the record was already deleted", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ success: true, result: [{ id: "rec-1" }] }))
      .mockResolvedValueOnce(jsonResponse({ success: false, errors: [{ code: 81044 }] }));
    await expect(deleteDnsRecord("acme.cal.com")).resolves.toBe(true);
  });

  it("throws when deletion fails for another reason", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ success: true, result: [{ id: "rec-1" }] }))
      .mockResolvedValueOnce(jsonResponse({ success: false, errors: [{ code: 999 }] }));
    await expect(deleteDnsRecord("acme.cal.com")).rejects.toThrow(HttpError);
  });
});
