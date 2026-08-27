import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetcher } from "../dailyApiFetcher";

vi.mock("../getDailyAppKeys", () => ({
  getDailyAppKeys: vi.fn().mockResolvedValue({ api_key: "daily-key", scale_plan: "false" }),
}));

const fetchMock = vi.fn();

describe("dailyApiFetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ id: "room-1" }),
    });
  });

  it("calls the Daily API with the app key and parses the response", async () => {
    await expect(fetcher("/rooms")).resolves.toEqual({ id: "room-1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.daily.co/v1/rooms");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer daily-key",
      "Content-Type": "application/json",
    });
  });

  it("applies the request options, with caller headers taking over", async () => {
    await fetcher("/rooms/abc", { method: "DELETE", headers: { "X-Test": "1" } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.daily.co/v1/rooms/abc");
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({ "X-Test": "1" });
  });

  it("throws when the Daily API returns an error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers(),
      json: () => Promise.resolve({ error: "not found" }),
    });

    await expect(fetcher("/rooms/missing")).rejects.toThrow();
  });
});
