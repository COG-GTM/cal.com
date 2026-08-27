import { beforeEach, describe, expect, it, vi } from "vitest";
import handlePaypalValidations from "../updateAppCredentials.validator";

const test = vi.fn();
const listWebhooks = vi.fn();
const deleteWebhook = vi.fn();
const createWebhook = vi.fn();

vi.mock("../Paypal", () => ({
  default: class {
    test = test;
    listWebhooks = listWebhooks;
    deleteWebhook = deleteWebhook;
    createWebhook = createWebhook;
  },
}));

const input = { credentialId: 1, key: { client_id: "client-id", secret_key: "secret-key" } };

describe("handlePaypalValidations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    test.mockResolvedValue(true);
    listWebhooks.mockResolvedValue([]);
    deleteWebhook.mockResolvedValue(true);
    createWebhook.mockResolvedValue("webhook-1");
  });

  it("returns the credentials together with the newly created webhook id", async () => {
    await expect(handlePaypalValidations({ input })).resolves.toEqual({
      client_id: "client-id",
      secret_key: "secret-key",
      webhook_id: "webhook-1",
    });
  });

  it("removes previously registered webhooks before creating the new one", async () => {
    listWebhooks.mockResolvedValue(["old-1", "old-2"]);

    await handlePaypalValidations({ input });

    expect(deleteWebhook).toHaveBeenCalledWith("old-1");
    expect(deleteWebhook).toHaveBeenCalledWith("old-2");
  });

  it("throws on malformed input", async () => {
    await expect(handlePaypalValidations({ input: { credentialId: 1, key: {} } })).rejects.toThrow(
      "Invalid input"
    );
    expect(test).not.toHaveBeenCalled();
  });

  it("throws when the credentials fail to authenticate", async () => {
    test.mockResolvedValue(false);

    await expect(handlePaypalValidations({ input })).rejects.toThrow(
      "Provided credentials failed to authenticate"
    );
  });

  it("throws when the webhook cannot be created", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createWebhook.mockResolvedValue(false);

    await expect(handlePaypalValidations({ input })).rejects.toThrow("Failed to create webhook");
  });
});
