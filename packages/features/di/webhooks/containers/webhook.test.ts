import { WebhookTaskConsumer } from "@calcom/features/webhooks/lib/service/WebhookTaskConsumer";
import { describe, expect, it, vi } from "vitest";
import { WEBHOOK_TOKENS } from "../Webhooks.tokens";
import { getWebhookFeature, getWebhookProducer, getWebhookTaskConsumer, webhookContainer } from "./webhook";

vi.mock("@calcom/prisma", () => {
  const client = { $connect: vi.fn() };
  return { default: client, prisma: client, readonlyPrisma: client };
});

vi.mock("@calcom/features/tasker", () => ({
  default: { create: vi.fn(), cleanup: vi.fn(), processQueue: vi.fn() },
}));

describe("webhook container", () => {
  it("resolves the task consumer", () => {
    expect(getWebhookTaskConsumer()).toBeInstanceOf(WebhookTaskConsumer);
  });

  it("resolves the producer service", () => {
    expect(getWebhookProducer()).toBeDefined();
    expect(getWebhookProducer()).toBe(getWebhookProducer());
  });

  it("exposes every service through the feature facade", () => {
    const feature = getWebhookFeature();

    expect(feature.producer).toBe(getWebhookProducer());
    expect(feature.consumer).toBe(getWebhookTaskConsumer());
    for (const service of [
      feature.core,
      feature.booking,
      feature.form,
      feature.recording,
      feature.ooo,
      feature.notifier,
      feature.repository,
    ]) {
      expect(service).toBeDefined();
    }
  });

  it("binds the data fetchers used by the notification handler", () => {
    for (const token of [
      WEBHOOK_TOKENS.BOOKING_DATA_FETCHER,
      WEBHOOK_TOKENS.PAYMENT_DATA_FETCHER,
      WEBHOOK_TOKENS.FORM_DATA_FETCHER,
      WEBHOOK_TOKENS.RECORDING_DATA_FETCHER,
      WEBHOOK_TOKENS.OOO_DATA_FETCHER,
    ]) {
      expect(webhookContainer.get(token)).toBeDefined();
    }
  });

  it("binds the cross-table repositories", () => {
    expect(webhookContainer.get(WEBHOOK_TOKENS.WEBHOOK_EVENT_TYPE_REPOSITORY)).toBeDefined();
    expect(webhookContainer.get(WEBHOOK_TOKENS.WEBHOOK_USER_REPOSITORY)).toBeDefined();
    expect(webhookContainer.get(WEBHOOK_TOKENS.PAYLOAD_BUILDER_FACTORY)).toBeDefined();
    expect(webhookContainer.get(WEBHOOK_TOKENS.WEBHOOK_NOTIFICATION_HANDLER)).toBeDefined();
  });
});
