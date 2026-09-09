import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";

/**
 * Returns the key itself unless an override is supplied, so assertions can look for the
 * i18n key in the rendered output. `{{var}}` placeholders in overrides are interpolated.
 */
export const createTranslator = (overrides: Record<string, string> = {}): TFunction => {
  const translate = (key: string, vars?: Record<string, unknown>) => {
    const template = overrides[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
      vars[name] === undefined || vars[name] === null ? "" : String(vars[name])
    );
  };

  return translate as unknown as TFunction;
};

type EmailWithPayload = {
  getNodeMailerPayload: () => Promise<Record<string, unknown>>;
  getTextBody?: () => string;
};

/** `getNodeMailerPayload` is protected on `BaseEmail`; tests exercise it as the class' real output. */
export const getPayload = (email: object): Promise<Record<string, unknown>> =>
  (email as unknown as EmailWithPayload).getNodeMailerPayload();

export const getText = (email: object): string => {
  const textBody = (email as unknown as EmailWithPayload).getTextBody;
  if (!textBody) throw new Error("Email has no getTextBody");
  return textBody.call(email);
};

export const buildPerson = (overrides: Partial<Person> = {}): Person => ({
  id: 1,
  name: "Anna Attendee",
  email: "anna@example.com",
  username: "anna",
  timeZone: "Europe/London",
  language: { locale: "en", translate: createTranslator() },
  ...overrides,
});

export const buildOrganizer = (overrides: Partial<Person> = {}): Person =>
  buildPerson({
    id: 2,
    name: "Oliver Organizer",
    email: "oliver@example.com",
    username: "oliver",
    timeZone: "America/New_York",
    ...overrides,
  });

export const buildCalEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  type: "30min",
  title: "30min between Oliver and Anna",
  description: "A description",
  additionalNotes: "Some additional notes",
  customInputs: {},
  startTime: "2024-06-01T10:00:00.000Z",
  endTime: "2024-06-01T10:30:00.000Z",
  organizer: buildOrganizer(),
  attendees: [buildPerson()],
  location: "Cal Video",
  uid: "booking-uid-1",
  bookerUrl: "https://cal.com",
  ...overrides,
});
