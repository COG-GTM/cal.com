import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BaseEmail from "./_base-email";

const checkIfFeatureIsEnabledGlobally = vi.fn();
const setTestEmail = vi.fn();
const sendMail = vi.fn();

vi.mock("@calcom/features/flags/features.repository", () => ({
  FeaturesRepository: class {
    checkIfFeatureIsEnabledGlobally = (slug: string) => checkIfFeatureIsEnabledGlobally(slug);
  },
}));

vi.mock("@calcom/prisma", () => ({ prisma: {} }));

vi.mock("@calcom/lib/testEmails", () => ({
  setTestEmail: (payload: unknown) => setTestEmail(payload),
}));

vi.mock("nodemailer", () => ({
  createTransport: () => ({
    sendMail: (payload: Record<string, unknown>, callback: (err: Error | null, info?: unknown) => void) =>
      sendMail(payload, callback),
  }),
}));

class TestEmail extends BaseEmail {
  private payload: Record<string, unknown>;

  constructor(payload: Record<string, unknown>) {
    super();
    this.name = "TEST_EMAIL";
    this.payload = payload;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return this.payload;
  }
}

const defaultPayload = {
  from: 'Oliver "The; Organizer" <oliver@example.com>',
  to: "Anna <anna@example.com>",
  subject: "Booking&nbsp;confirmed &amp; paid",
  html: "<p>hi</p>",
};

describe("BaseEmail.sendEmail", () => {
  beforeEach(() => {
    vi.stubEnv("INTEGRATION_TEST_MODE", "");
    checkIfFeatureIsEnabledGlobally.mockResolvedValue(false);
    sendMail.mockImplementation((_payload, callback) => callback(null, { accepted: ["anna@example.com"] }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("skips sending when the global emails kill switch is on", async () => {
    checkIfFeatureIsEnabledGlobally.mockResolvedValue(true);

    await expect(new TestEmail(defaultPayload).sendEmail()).resolves.toBe(
      "Skipped Sending Email due to active Kill Switch"
    );
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("captures the payload instead of sending it in integration test mode", async () => {
    vi.stubEnv("INTEGRATION_TEST_MODE", "true");

    await expect(new TestEmail(defaultPayload).sendEmail()).resolves.toBe("Skipped sendEmail for Unit Tests");
    expect(setTestEmail).toHaveBeenCalledWith(defaultPayload);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("skips faux sms recipients", async () => {
    const email = new TestEmail({ ...defaultPayload, to: "+1234567890@sms.cal.com" });

    await expect(email.sendEmail()).resolves.toBe(
      "Skipped Sending Email to faux email: +1234567890@sms.cal.com"
    );
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sanitizes display names and decodes the subject before sending", async () => {
    await expect(new TestEmail(defaultPayload).sendEmail()).resolves.toBe("send mail async");

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [sentPayload] = sendMail.mock.calls[0];
    expect(sentPayload.from).toBe("Oliver The Organizer  <oliver@example.com>");
    expect(sentPayload.to).toBe("Anna <anna@example.com>");
    expect(sentPayload.subject).toBe("Booking\u00a0confirmed & paid");
  });

  it("resolves and logs when nodemailer reports an error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendMail.mockImplementation((_payload, callback) => callback(new Error("smtp down")));

    await expect(new TestEmail(defaultPayload).sendEmail()).resolves.toBe("send mail async");
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("stays silent about nodemailer errors during e2e runs", async () => {
    vi.stubEnv("NEXT_PUBLIC_IS_E2E", "1");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendMail.mockImplementation((_payload, callback) => callback(new Error("smtp down")));

    await new TestEmail(defaultPayload).sendEmail();

    expect(consoleError).not.toHaveBeenCalledWith("TEST_EMAIL_ERROR", expect.anything());

    consoleError.mockRestore();
  });
});
