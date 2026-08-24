import { BookingWebhookService } from "@calcom/features/webhooks/lib/service/BookingWebhookService";
import { FormWebhookService } from "@calcom/features/webhooks/lib/service/FormWebhookService";
import { OOOWebhookService } from "@calcom/features/webhooks/lib/service/OOOWebhookService";
import { RecordingWebhookService } from "@calcom/features/webhooks/lib/service/RecordingWebhookService";
import { WebhookService } from "@calcom/features/webhooks/lib/service/WebhookService";
import { createContainer, createModule } from "@evyweb/ioctopus";
import { describe, expect, it, vi } from "vitest";
import { SHARED_TOKENS } from "../../shared/shared.tokens";
import { webhookRepositoryModule } from "../repositories/Webhook.repository";
import { WEBHOOK_TOKENS } from "../Webhooks.tokens";
import { webhookServicesModule } from "./Webhook.service";

vi.mock("@calcom/prisma", () => {
  const client = { $connect: vi.fn() };
  return { default: client, prisma: client, readonlyPrisma: client };
});

function buildContainer() {
  const container = createContainer();
  const stubs = createModule();

  stubs.bind(SHARED_TOKENS.TASKER).toValue({ create: vi.fn() });
  stubs.bind(SHARED_TOKENS.LOGGER).toValue({ getSubLogger: vi.fn(() => ({ error: vi.fn() })) });
  stubs.bind(WEBHOOK_TOKENS.WEBHOOK_NOTIFIER).toValue({ emitWebhook: vi.fn() });

  container.load(Symbol("stubs"), stubs);
  container.load(Symbol("webhookRepository"), webhookRepositoryModule);
  container.load(Symbol("webhookServices"), webhookServicesModule);

  return container;
}

describe("webhook repository and service modules", () => {
  it("binds the webhook repository", () => {
    expect(buildContainer().get(WEBHOOK_TOKENS.WEBHOOK_REPOSITORY)).toBeDefined();
  });

  it.each([
    [WEBHOOK_TOKENS.WEBHOOK_SERVICE, WebhookService],
    [WEBHOOK_TOKENS.BOOKING_WEBHOOK_SERVICE, BookingWebhookService],
    [WEBHOOK_TOKENS.FORM_WEBHOOK_SERVICE, FormWebhookService],
    [WEBHOOK_TOKENS.RECORDING_WEBHOOK_SERVICE, RecordingWebhookService],
    [WEBHOOK_TOKENS.OOO_WEBHOOK_SERVICE, OOOWebhookService],
  ])("binds %s", (token, expected) => {
    expect(buildContainer().get(token)).toBeInstanceOf(expected);
  });
});
