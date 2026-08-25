import { beforeEach, describe, expect, it, vi } from "vitest";

const test = vi.fn();
const listWebhooks = vi.fn();
const deleteWebhook = vi.fn();
const createWebhook = vi.fn();

vi.mock("./Paypal", () => ({
  default: vi.fn(function PaypalMock(this: Record<string, unknown>) {
    this.test = test;
    this.listWebhooks = listWebhooks;
    this.deleteWebhook = deleteWebhook;
    this.createWebhook = createWebhook;
  }),
}));

import Paypal from "./Paypal";
import handlePaypalValidations from "./updateAppCredentials.validator";

const input = { credentialId: 1, key: { client_id: "client-id", secret_key: "secret-key" } };

describe("handlePaypalValidations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    test.mockResolvedValue(true);
    listWebhooks.mockResolvedValue([]);
    createWebhook.mockResolvedValue("webhook-1");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns the credentials together with the newly created webhook id", async () => {
    await expect(handlePaypalValidations({ input })).resolves.toEqual({
      client_id: "client-id",
      secret_key: "secret-key",
      webhook_id: "webhook-1",
    });

    expect(Paypal).toHaveBeenCalledWith({ clientId: "client-id", secretKey: "secret-key" });
  });

  it("removes previously registered webhooks before creating a new one", async () => {
    listWebhooks.mockResolvedValue(["webhook-old-1", "webhook-old-2"]);

    await handlePaypalValidations({ input });

    expect(deleteWebhook).toHaveBeenCalledWith("webhook-old-1");
    expect(deleteWebhook).toHaveBeenCalledWith("webhook-old-2");
  });

  it("rejects input that does not match the credential schema", async () => {
    await expect(handlePaypalValidations({ input: { credentialId: 1, key: {} } })).rejects.toThrow(
      "Invalid input"
    );
    expect(test).not.toHaveBeenCalled();
  });

  it("rejects credentials paypal does not authenticate", async () => {
    test.mockResolvedValue(false);

    await expect(handlePaypalValidations({ input })).rejects.toThrow(
      "Provided credentials failed to authenticate"
    );
    expect(createWebhook).not.toHaveBeenCalled();
  });

  it("rejects when the webhook cannot be created", async () => {
    createWebhook.mockResolvedValue(false);

    await expect(handlePaypalValidations({ input })).rejects.toThrow("Failed to create webhook");
  });
});
