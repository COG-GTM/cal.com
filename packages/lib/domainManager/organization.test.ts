import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDnsRecord, deleteDnsRecord } from "./deploymentServices/cloudflare";
import {
  createDomain as createVercelDomain,
  deleteDomain as deleteVercelDomain,
} from "./deploymentServices/vercel";
import { createDomain, deleteDomain, renameDomain } from "./organization";

vi.mock("@calcom/ee/organizations/lib/orgDomains", () => ({
  subdomainSuffix: () => "cal.local",
}));

vi.mock("./deploymentServices/cloudflare", () => ({
  addDnsRecord: vi.fn(),
  deleteDnsRecord: vi.fn(),
}));

vi.mock("./deploymentServices/vercel", () => ({
  createDomain: vi.fn(),
  deleteDomain: vi.fn(),
}));

beforeEach(() => {
  vi.stubEnv("VERCEL_URL", "https://vercel.example.com");
  vi.stubEnv("CLOUDFLARE_DNS", "1");
  vi.mocked(createVercelDomain).mockResolvedValue(true);
  vi.mocked(deleteVercelDomain).mockResolvedValue(true);
  vi.mocked(addDnsRecord).mockResolvedValue(true);
  vi.mocked(deleteDnsRecord).mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("createDomain", () => {
  it("creates the vercel domain and dns record for the full domain", async () => {
    await expect(createDomain("acme")).resolves.toBe(true);
    expect(createVercelDomain).toHaveBeenCalledWith("acme.cal.local");
    expect(addDnsRecord).toHaveBeenCalledWith("acme.cal.local");
  });

  it("returns false when no deployment service is configured", async () => {
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("CLOUDFLARE_DNS", "");
    await expect(createDomain("acme")).resolves.toBe(false);
    expect(createVercelDomain).not.toHaveBeenCalled();
    expect(addDnsRecord).not.toHaveBeenCalled();
  });

  it("returns false when the dns record fails", async () => {
    vi.mocked(addDnsRecord).mockResolvedValue(false);
    await expect(createDomain("acme")).resolves.toBe(false);
  });
});

describe("deleteDomain", () => {
  it("deletes the vercel domain and dns record", async () => {
    await expect(deleteDomain("acme")).resolves.toBe(true);
    expect(deleteVercelDomain).toHaveBeenCalledWith("acme.cal.local");
    expect(deleteDnsRecord).toHaveBeenCalledWith("acme.cal.local");
  });

  it("returns false when the vercel domain was not deleted", async () => {
    vi.stubEnv("VERCEL_URL", "");
    await expect(deleteDomain("acme")).resolves.toBe(false);
    expect(deleteVercelDomain).not.toHaveBeenCalled();
  });
});

describe("renameDomain", () => {
  it("creates the new domain and deletes the old one", async () => {
    await renameDomain("old-slug", "new-slug");
    expect(createVercelDomain).toHaveBeenCalledWith("new-slug.cal.local");
    expect(deleteVercelDomain).toHaveBeenCalledWith("old-slug.cal.local");
  });

  it("skips deletion when there is no old slug", async () => {
    await renameDomain(null, "new-slug");
    expect(createVercelDomain).toHaveBeenCalledWith("new-slug.cal.local");
    expect(deleteVercelDomain).not.toHaveBeenCalled();
  });

  it("does not throw when deleting the old domain fails", async () => {
    vi.mocked(deleteVercelDomain).mockRejectedValue(new Error("boom"));
    await expect(renameDomain("old-slug", "new-slug")).resolves.toBeUndefined();
  });
});
