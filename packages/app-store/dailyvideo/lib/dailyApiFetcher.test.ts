import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDailyAppKeys } = vi.hoisted(() => ({ getDailyAppKeys: vi.fn() }));

vi.mock("./getDailyAppKeys", () => ({ getDailyAppKeys }));

import { fetcher } from "./dailyApiFetcher";

const fetchMock = vi.fn();

describe("dailyApiFetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    getDailyAppKeys.mockResolvedValue({ api_key: "api-key", scale_plan: "false" });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ id: "room-1" }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefixes the daily api base url and authenticates with the app key", async () => {
    await expect(fetcher("/rooms")).resolves.toEqual({ id: "room-1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.daily.co/v1/rooms");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer api-key",
      "Content-Type": "application/json",
    });
  });

  it("keeps the caller provided method", async () => {
    await fetcher("/rooms/abc", { method: "DELETE" });

    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  // The init spread comes after the merged headers, so caller headers replace them wholesale.
  it("lets caller headers replace the authenticated ones", async () => {
    await fetcher("/rooms/abc", { headers: { "X-Test": "1" } });

    expect(fetchMock.mock.calls[0][1].headers).toEqual({ "X-Test": "1" });
  });

  it("rejects on a non-ok response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers(),
      json: async () => ({ message: "room not found" }),
      text: async () => '{"message":"room not found"}',
    });

    await expect(fetcher("/rooms/missing")).rejects.toBeDefined();
  });
});
