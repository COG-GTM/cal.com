import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendAddAttendeeEmailsAndSMS,
  sendAddGuestsEmails,
  sendAddGuestsEmailsAndSMS,
  sendAttendeeRequestEmailAndSMS,
  sendAwaitingPaymentEmailAndSMS,
  sendCancelledEmailsAndSMS,
  sendCancelledSeatEmailsAndSMS,
  sendDeclinedEmailsAndSMS,
  sendLocationChangeEmailsAndSMS,
  sendOrganizerRequestEmail,
  sendOrganizerRequestReminderEmail,
  sendReassignedEmailsAndSMS,
  sendReassignedScheduledEmailsAndSMS,
  sendReassignedUpdatedEmailsAndSMS,
  sendRequestRescheduleEmailAndSMS,
  sendRescheduledEmailsAndSMS,
  sendRescheduledSeatEmailAndSMS,
  sendRoundRobinCancelledEmailsAndSMS,
  sendRoundRobinRescheduledEmailsAndSMS,
  sendScheduledEmailsAndSMS,
  sendScheduledSeatsEmailsAndSMS,
} from "./email-manager";
import BaseEmail from "./templates/_base-email";
import AttendeeAddGuestsEmail from "./templates/attendee-add-guests-email";
import AttendeeAwaitingPaymentEmail from "./templates/attendee-awaiting-payment-email";
import AttendeeCancelledEmail from "./templates/attendee-cancelled-email";
import AttendeeCancelledSeatEmail from "./templates/attendee-cancelled-seat-email";
import AttendeeDeclinedEmail from "./templates/attendee-declined-email";
import AttendeeLocationChangeEmail from "./templates/attendee-location-change-email";
import AttendeeRequestEmail from "./templates/attendee-request-email";
import AttendeeRescheduledEmail from "./templates/attendee-rescheduled-email";
import AttendeeScheduledEmail from "./templates/attendee-scheduled-email";
import AttendeeUpdatedEmail from "./templates/attendee-updated-email";
import AttendeeWasRequestedToRescheduleEmail from "./templates/attendee-was-requested-to-reschedule-email";
import OrganizerAddAttendeeEmail from "./templates/organizer-add-attendee-email";
import OrganizerAddGuestsEmail from "./templates/organizer-add-guests-email";
import OrganizerAttendeeCancelledSeatEmail from "./templates/organizer-attendee-cancelled-seat-email";
import OrganizerCancelledEmail from "./templates/organizer-cancelled-email";
import OrganizerLocationChangeEmail from "./templates/organizer-location-change-email";
import OrganizerReassignedEmail from "./templates/organizer-reassigned-email";
import OrganizerRequestEmail from "./templates/organizer-request-email";
import OrganizerRequestReminderEmail from "./templates/organizer-request-reminder-email";
import OrganizerRequestedToRescheduleEmail from "./templates/organizer-requested-to-reschedule-email";
import OrganizerRescheduledEmail from "./templates/organizer-rescheduled-email";
import OrganizerScheduledEmail from "./templates/organizer-scheduled-email";
import { buildCalEvent, buildOrganizer, buildPerson } from "./test-utils/fixtures";

const { getEmailSettings, sendSMSToAttendees, sendSMSToAttendee, smsModule } = vi.hoisted(() => {
  const sendSMSToAttendees = vi.fn();
  const sendSMSToAttendee = vi.fn();

  return {
    getEmailSettings: vi.fn(),
    sendSMSToAttendees,
    sendSMSToAttendee,
    smsModule: () => ({
      default: class {
        sendSMSToAttendees = () => sendSMSToAttendees();
        sendSMSToAttendee = (attendee: { email: string }) => sendSMSToAttendee(attendee);
      },
    }),
  };
});

vi.mock("@calcom/prisma", () => ({ prisma: {} }));

vi.mock("@calcom/features/organizations/repositories/OrganizationSettingsRepository", () => ({
  OrganizationSettingsRepository: class {
    getEmailSettings = (organizationId: number) => getEmailSettings(organizationId);
  },
}));

vi.mock("../sms/attendee/awaiting-payment-sms", smsModule);
vi.mock("../sms/attendee/cancelled-seat-sms", smsModule);
vi.mock("../sms/attendee/event-cancelled-sms", smsModule);
vi.mock("../sms/attendee/event-declined-sms", smsModule);
vi.mock("../sms/attendee/event-location-changed-sms", smsModule);
vi.mock("../sms/attendee/event-request-sms", smsModule);
vi.mock("../sms/attendee/event-request-to-reschedule-sms", smsModule);
vi.mock("../sms/attendee/event-rescheduled-sms", smsModule);
vi.mock("../sms/attendee/event-scheduled-sms", smsModule);

const sendEmail = vi.spyOn(BaseEmail.prototype, "sendEmail");

const teamMember = buildPerson({ id: 5, name: "Tina", email: "tina@example.com" });
const attendee = buildPerson();
const organizer = buildOrganizer();

const teamEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent =>
  buildCalEvent({
    organizer,
    attendees: [attendee],
    team: { id: 1, name: "Acme", members: [teamMember] },
    ...overrides,
  });

const hostDisabled = { disableStandardEmails: { all: { host: true, attendee: false } } };
const attendeeDisabled = { disableStandardEmails: { all: { host: false, attendee: true } } };

const sentTypes = () => sendEmail.mock.instances.map((instance) => (instance as BaseEmail).constructor);

describe("email-manager senders", () => {
  beforeEach(() => {
    sendEmail.mockResolvedValue("sent");
    getEmailSettings.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("sendScheduledEmailsAndSMS", () => {
    it("emails the organizer, each team member and each attendee", async () => {
      await sendScheduledEmailsAndSMS(teamEvent());

      expect(sentTypes()).toEqual([OrganizerScheduledEmail, OrganizerScheduledEmail, AttendeeScheduledEmail]);
      expect(sendSMSToAttendees).toHaveBeenCalledTimes(1);
    });

    it("honours the host and attendee kill switches", async () => {
      await sendScheduledEmailsAndSMS(teamEvent(), undefined, true, true);

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("skips host emails disabled on the event type metadata", async () => {
      await sendScheduledEmailsAndSMS(teamEvent(), undefined, false, false, hostDisabled);

      expect(sentTypes()).toEqual([AttendeeScheduledEmail]);
    });

    it("skips attendee confirmations disabled by organization settings", async () => {
      getEmailSettings.mockResolvedValue({ disableAttendeeConfirmationEmail: true });

      await sendScheduledEmailsAndSMS(teamEvent({ organizationId: 3 }));

      expect(sentTypes()).toEqual([OrganizerScheduledEmail, OrganizerScheduledEmail]);
      expect(getEmailSettings).toHaveBeenCalledWith(3);
    });

    it("renames the booking using the event name object", async () => {
      await sendScheduledEmailsAndSMS(
        teamEvent(),
        {
          attendeeName: "Anna",
          eventType: "30min",
          eventName: "{Event type title} with {Scheduler}",
          host: "Oliver",
          eventDuration: 30,
          t: attendee.language.translate,
        },
        true
      );

      const attendeeEmail = sendEmail.mock.instances[0] as AttendeeScheduledEmail;
      expect(attendeeEmail).toBeInstanceOf(AttendeeScheduledEmail);
      expect(attendeeEmail.calEvent.title).toBe("30min with Anna");
    });
  });

  describe("reassignment", () => {
    it("emails every reassigned member and texts those with a phone number", async () => {
      await sendReassignedScheduledEmailsAndSMS({
        calEvent: teamEvent(),
        members: [teamMember, buildPerson({ id: 6, email: "phone@example.com", phoneNumber: "+15550001" })],
      });

      expect(sentTypes()).toEqual([OrganizerScheduledEmail, OrganizerScheduledEmail]);
      expect(sendSMSToAttendee).toHaveBeenCalledTimes(1);
    });

    it("does nothing when host emails are disabled", async () => {
      await sendReassignedScheduledEmailsAndSMS({
        calEvent: teamEvent(),
        members: [teamMember],
        eventTypeMetadata: hostDisabled,
      });

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("emails attendees about the update unless reassignment emails are skipped", async () => {
      await sendReassignedUpdatedEmailsAndSMS({ calEvent: teamEvent(), showAttendees: true });
      expect(sentTypes()).toEqual([AttendeeUpdatedEmail]);

      sendEmail.mockClear();
      await sendReassignedUpdatedEmailsAndSMS({
        calEvent: teamEvent(),
        showAttendees: false,
        eventTypeMetadata: attendeeDisabled,
      });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("tells the previous hosts they were reassigned", async () => {
      await sendReassignedEmailsAndSMS({
        calEvent: teamEvent(),
        members: [teamMember],
        reassignedTo: { name: "New Host", email: "new@example.com" },
      });

      expect(sentTypes()).toEqual([OrganizerReassignedEmail]);
    });
  });

  describe("round robin", () => {
    it("sends attendees a reschedule email and hosts an organizer email", async () => {
      await sendRoundRobinRescheduledEmailsAndSMS(teamEvent(), [attendee, teamMember]);

      expect(sentTypes()).toEqual([AttendeeRescheduledEmail, OrganizerRescheduledEmail]);
    });

    it("cancels for each member unless host emails are disabled", async () => {
      await sendRoundRobinCancelledEmailsAndSMS(teamEvent(), [teamMember]);
      expect(sentTypes()).toEqual([OrganizerCancelledEmail]);

      sendEmail.mockClear();
      await sendRoundRobinCancelledEmailsAndSMS(teamEvent(), [teamMember], hostDisabled);
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("rescheduling", () => {
    it("emails the organizer, team members and attendees", async () => {
      await sendRescheduledEmailsAndSMS(teamEvent());

      expect(sentTypes()).toEqual([
        OrganizerRescheduledEmail,
        OrganizerRescheduledEmail,
        AttendeeRescheduledEmail,
      ]);
    });

    it("hides calendar notes from attendees when the event type hides them", async () => {
      await sendRescheduledEmailsAndSMS(teamEvent({ hideCalendarNotes: true }), hostDisabled);

      const attendeeEmail = sendEmail.mock.instances[0] as AttendeeRescheduledEmail;
      expect(attendeeEmail.calEvent.additionalNotes).toBeUndefined();
    });

    it("emails a single seat attendee about the reschedule", async () => {
      await sendRescheduledSeatEmailAndSMS(teamEvent(), attendee);

      expect(sentTypes()).toEqual([OrganizerRescheduledEmail, AttendeeRescheduledEmail]);
      expect(sendSMSToAttendee).toHaveBeenCalledWith(attendee);
    });
  });

  describe("seats", () => {
    it("emails organizer, team members and the new invitee", async () => {
      await sendScheduledSeatsEmailsAndSMS(teamEvent(), attendee, true, false);

      expect(sentTypes()).toEqual([OrganizerScheduledEmail, OrganizerScheduledEmail, AttendeeScheduledEmail]);
    });

    it("respects the host and attendee kill switches", async () => {
      await sendScheduledSeatsEmailsAndSMS(teamEvent(), attendee, true, false, true, true);

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("emails the cancelled seat attendee and the organizer", async () => {
      await sendCancelledSeatEmailsAndSMS(teamEvent(), attendee);

      expect(sentTypes()).toEqual([AttendeeCancelledSeatEmail, OrganizerAttendeeCancelledSeatEmail]);
    });
  });

  describe("requests", () => {
    it("asks the organizer and team members to confirm", async () => {
      await sendOrganizerRequestEmail(teamEvent());

      expect(sentTypes()).toEqual([OrganizerRequestEmail, OrganizerRequestEmail]);
    });

    it("does not ask the organizer when host emails are disabled", async () => {
      await sendOrganizerRequestEmail(teamEvent(), hostDisabled);

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("tells the attendee the booking is awaiting confirmation", async () => {
      await sendAttendeeRequestEmailAndSMS(teamEvent(), attendee);

      expect(sentTypes()).toEqual([AttendeeRequestEmail]);
      expect(sendSMSToAttendee).toHaveBeenCalledWith(attendee);
    });

    it("skips the attendee request email when request emails are disabled", async () => {
      await sendAttendeeRequestEmailAndSMS(teamEvent(), attendee, attendeeDisabled);

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("reminds the organizer and team members about a pending request", async () => {
      await sendOrganizerRequestReminderEmail(teamEvent());

      expect(sentTypes()).toEqual([OrganizerRequestReminderEmail, OrganizerRequestReminderEmail]);
    });

    it("emails attendees when the request is declined", async () => {
      await sendDeclinedEmailsAndSMS(teamEvent());

      expect(sentTypes()).toEqual([AttendeeDeclinedEmail]);
      expect(sendSMSToAttendees).toHaveBeenCalled();
    });
  });

  describe("cancellation", () => {
    it("emails organizer, team members and attendees with the resolved event name", async () => {
      await sendCancelledEmailsAndSMS(teamEvent(), { eventName: "{Event type title} cancelled" });

      expect(sentTypes()).toEqual([OrganizerCancelledEmail, OrganizerCancelledEmail, AttendeeCancelledEmail]);
    });

    it("logs when the event length is missing", async () => {
      await sendCancelledEmailsAndSMS(teamEvent({ length: undefined }), { eventName: "" }, hostDisabled);

      expect(sentTypes()).toEqual([AttendeeCancelledEmail]);
    });
  });

  describe("payment, reschedule requests and location changes", () => {
    it("asks the attendee for payment", async () => {
      await sendAwaitingPaymentEmailAndSMS(teamEvent());

      expect(sentTypes()).toEqual([AttendeeAwaitingPaymentEmail]);
    });

    it("asks both sides to reschedule", async () => {
      await sendRequestRescheduleEmailAndSMS(teamEvent(), { rescheduleLink: "https://cal.com/resched" });

      expect(sentTypes()).toEqual([
        OrganizerRequestedToRescheduleEmail,
        AttendeeWasRequestedToRescheduleEmail,
      ]);
    });

    it("announces a location change to everyone", async () => {
      await sendLocationChangeEmailsAndSMS(teamEvent());

      expect(sentTypes()).toEqual([
        OrganizerLocationChangeEmail,
        OrganizerLocationChangeEmail,
        AttendeeLocationChangeEmail,
      ]);
    });
  });

  describe("guests and attendees added later", () => {
    it("sends new guests a confirmation and existing attendees an update", async () => {
      const guest = buildPerson({ id: 7, email: "guest@example.com", name: "Guest" });

      await sendAddGuestsEmails(teamEvent({ attendees: [attendee, guest] }), [guest.email]);

      expect(sentTypes()).toEqual([
        OrganizerAddGuestsEmail,
        OrganizerAddGuestsEmail,
        AttendeeAddGuestsEmail,
        AttendeeScheduledEmail,
      ]);
    });

    it("texts new guests who have a phone number", async () => {
      const guest = buildPerson({
        id: 7,
        email: "guest@example.com",
        name: "Guest",
        phoneNumber: "+15550002",
      });

      await sendAddGuestsEmailsAndSMS({
        calEvent: teamEvent({ attendees: [attendee, guest] }),
        newGuests: [guest.email],
      });

      expect(sentTypes()).toEqual([
        OrganizerAddGuestsEmail,
        OrganizerAddGuestsEmail,
        AttendeeAddGuestsEmail,
        AttendeeScheduledEmail,
      ]);
      expect(sendSMSToAttendee).toHaveBeenCalledWith(expect.objectContaining({ email: guest.email }));
    });

    it("only emails attendees when host emails are disabled for added attendees", async () => {
      const added = buildPerson({ id: 8, email: "added@example.com", name: "Added" });

      await sendAddAttendeeEmailsAndSMS({
        calEvent: teamEvent({ attendees: [attendee, added] }),
        newAttendees: [added.email],
        eventTypeMetadata: hostDisabled,
      });

      expect(sentTypes()).toEqual([AttendeeAddGuestsEmail, AttendeeScheduledEmail]);
    });

    it("emails the organizer and team when attendees are added", async () => {
      const added = buildPerson({ id: 8, email: "added@example.com", name: "Added" });

      await sendAddAttendeeEmailsAndSMS({
        calEvent: teamEvent({ attendees: [added] }),
        newAttendees: [added.email],
      });

      expect(sentTypes()).toEqual([
        OrganizerAddAttendeeEmail,
        OrganizerAddAttendeeEmail,
        AttendeeScheduledEmail,
      ]);
    });
  });
});
