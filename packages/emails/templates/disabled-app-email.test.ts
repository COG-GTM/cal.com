import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import DisabledAppEmail from "./disabled-app-email";

const t = createTranslator({
  admin_has_disabled: "{{appName}} was disabled",
  disabled_app_affects_event_type: "{{appName}} was disabled and affects {{eventType}}",
  disable_payment_app: "{{appName}} payments are disabled for {{title}}",
  app_disabled_video: "{{appName}} video calls are disabled",
  app_disabled: "{{appName}} is disabled",
});

describe("DisabledAppEmail", () => {
  it("uses the generic subject and body when no event type is affected", async () => {
    const payload = await getPayload(new DisabledAppEmail("anna@example.com", "Stripe", ["other"], t));

    expect(payload.to).toBe("anna@example.com");
    expect(payload.subject).toBe("Stripe was disabled");
    expect(payload.text).toBe("Stripe is disabled");
  });

  it("names the affected event type and uses the payment copy for payment apps", async () => {
    const payload = await getPayload(
      new DisabledAppEmail("anna@example.com", "Stripe", ["payment"], t, "Paid consult", 42)
    );

    expect(payload.subject).toBe("Stripe was disabled and affects Paid consult");
    expect(payload.text).toBe("Stripe payments are disabled for Paid consult");
  });

  it("uses the video copy for video apps", async () => {
    const payload = await getPayload(new DisabledAppEmail("anna@example.com", "Zoom", ["video"], t));

    expect(payload.text).toBe("Zoom video calls are disabled");
  });
});
