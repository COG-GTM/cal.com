import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendCreditBalanceLimitReachedEmails,
  sendCreditBalanceLowWarningEmails,
  sendNoShowFeeChargedEmail,
  sendOrganizerPaymentRefundFailedEmail,
  sendProrationInvoiceEmails,
  sendProrationReminderEmails,
} from "./billing-email-service";
import BaseEmail from "./templates/_base-email";
import CreditBalanceLimitReachedEmail from "./templates/credit-balance-limit-reached-email";
import CreditBalanceLowWarningEmail from "./templates/credit-balance-low-warning-email";
import NoShowFeeChargedEmail from "./templates/no-show-fee-charged-email";
import OrganizerPaymentRefundFailedEmail from "./templates/organizer-payment-refund-failed-email";
import ProrationInvoiceEmail from "./templates/proration-invoice-email";
import ProrationReminderEmail from "./templates/proration-reminder-email";
import { buildCalEvent, buildPerson, createTranslator } from "./test-utils/fixtures";

const sendEmail = vi.spyOn(BaseEmail.prototype, "sendEmail");
const t = createTranslator();
const admin = { id: 1, name: "Admin", email: "admin@acme.com", t };
const proration = { monthKey: "2024-06", netSeatIncrease: 2, proratedAmount: 1000 };

describe("billing-email-service", () => {
  beforeEach(() => {
    sendEmail.mockResolvedValue("sent");
  });

  afterEach(() => {
    sendEmail.mockClear();
  });

  it("notifies the organizer and every team member about a failed refund", async () => {
    const calEvent = buildCalEvent({
      team: {
        name: "Acme",
        members: [{ ...buildPerson({ email: "member@example.com" }), id: 3 }],
        id: 1,
      },
    });

    await sendOrganizerPaymentRefundFailedEmail(calEvent);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.instances[0]).toBeInstanceOf(OrganizerPaymentRefundFailedEmail);
  });

  it("skips the no-show fee email when attendee emails are disabled for the event type", async () => {
    const attendee = buildPerson();
    await sendNoShowFeeChargedEmail(attendee, buildCalEvent(), {
      disableStandardEmails: { all: { attendee: true, host: false } },
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends the no-show fee email when attendee emails are enabled", async () => {
    const attendee = buildPerson();
    const calEvent = buildCalEvent({
      attendees: [attendee],
      paymentInfo: { amount: 1000, currency: "usd", link: null, id: null, paymentOption: null },
    });

    await sendNoShowFeeChargedEmail(attendee, calEvent);

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(NoShowFeeChargedEmail);
  });

  it("warns every team admin and the individual user about a low credit balance", async () => {
    await sendCreditBalanceLowWarningEmails({
      team: { id: 1, name: "Acme", adminAndOwners: [admin, { ...admin, id: 2, email: "b@acme.com" }] },
      user: { id: 9, name: "Anna", email: "anna@example.com", t },
      balance: 50,
    });

    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(sendEmail.mock.instances[0]).toBeInstanceOf(CreditBalanceLowWarningEmail);
  });

  it("does not send low balance warnings without a recipient", async () => {
    await sendCreditBalanceLowWarningEmails({
      team: { id: 1, name: "Acme", adminAndOwners: [] },
      balance: 0,
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails team admins when the credit limit is reached", async () => {
    await sendCreditBalanceLimitReachedEmails({
      team: { id: 1, name: "Acme", adminAndOwners: [admin] },
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.instances[0]).toBeInstanceOf(CreditBalanceLimitReachedEmail);
  });

  it("emails the individual user when the credit limit is reached", async () => {
    await sendCreditBalanceLimitReachedEmails({
      user: { id: 9, name: "Anna", email: "anna@example.com", t },
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(CreditBalanceLimitReachedEmail);
  });

  it("does nothing when there is nobody to warn about the credit limit", async () => {
    await sendCreditBalanceLimitReachedEmails({});

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends a proration invoice to each admin", async () => {
    await sendProrationInvoiceEmails({
      team: { id: 1, name: "Acme" },
      proration,
      isAutoCharge: false,
      adminAndOwners: [admin],
    });

    expect(sendEmail.mock.instances[0]).toBeInstanceOf(ProrationInvoiceEmail);
  });

  it("logs proration invoice failures instead of throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendEmail.mockRejectedValue(new Error("smtp down"));

    await sendProrationInvoiceEmails({
      team: { id: 1, name: "Acme" },
      proration,
      isAutoCharge: true,
      adminAndOwners: [admin],
    });

    expect(consoleError).toHaveBeenCalledWith("1 email(s) failed to send", expect.anything());
    consoleError.mockRestore();
  });

  it("sends proration reminders and skips when there are no admins", async () => {
    await sendProrationReminderEmails({
      team: { id: 1, name: "Acme" },
      proration,
      adminAndOwners: [admin],
    });
    expect(sendEmail.mock.instances[0]).toBeInstanceOf(ProrationReminderEmail);

    sendEmail.mockClear();
    await sendProrationReminderEmails({ team: { id: 1, name: "Acme" }, proration, adminAndOwners: [] });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips proration invoices when there are no admins", async () => {
    await sendProrationInvoiceEmails({
      team: { id: 1, name: "Acme" },
      proration,
      isAutoCharge: false,
      adminAndOwners: [],
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
