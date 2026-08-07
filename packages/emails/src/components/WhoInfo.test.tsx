import { buildCalendarEvent, buildPerson } from "@calcom/lib/test/builder";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PersonInfo, WhoInfo } from "./WhoInfo";

const t = ((key: string) => key) as unknown as TFunction;

const renderWhoInfo = (calEvent: CalendarEvent) =>
  renderToStaticMarkup(<WhoInfo calEvent={calEvent} t={t} />);

describe("PersonInfo", () => {
  it("renders the name, role and a mailto link", () => {
    const html = renderToStaticMarkup(<PersonInfo name="Alice" email="alice@example.com" role="organizer" />);

    expect(html).toContain("Alice");
    expect(html).toContain("organizer");
    expect(html).toContain(`href="mailto:alice@example.com"`);
  });

  it("hides the email for sms-only attendees", () => {
    const html = renderToStaticMarkup(
      <PersonInfo name="Bob" email="+15551234567@sms.cal.com" role="guest" phoneNumber="+15551234567" />
    );

    expect(html).not.toContain("sms.cal.com");
    expect(html).toContain("+15551234567");
  });
});

describe("WhoInfo", () => {
  it("lists the organizer, team members and attendees", () => {
    const calEvent = buildCalendarEvent({
      organizer: buildPerson({ name: "Alice", email: "alice@example.com" }),
      attendees: [buildPerson({ name: "Bob", email: "bob@example.com" })],
      team: {
        name: "Engineering",
        members: [buildPerson({ name: "Carol", email: "carol@example.com" })],
        id: 1,
      },
    });

    const html = renderWhoInfo(calEvent);

    expect(html).toContain("Alice");
    expect(html).toContain("organizer");
    expect(html).toContain("Carol");
    expect(html).toContain("team_member");
    expect(html).toContain("Bob");
    expect(html).toContain("guest");
  });

  it("omits organizer and team member emails when hideOrganizerEmail is set", () => {
    const calEvent = buildCalendarEvent({
      hideOrganizerEmail: true,
      organizer: buildPerson({ name: "Alice", email: "alice@example.com" }),
      attendees: [buildPerson({ name: "Bob", email: "bob@example.com" })],
      team: {
        name: "Engineering",
        members: [buildPerson({ name: "Carol", email: "carol@example.com" })],
        id: 1,
      },
    });

    const html = renderWhoInfo(calEvent);

    expect(html).not.toContain("alice@example.com");
    expect(html).not.toContain("carol@example.com");
    expect(html).toContain("bob@example.com");
  });

  it("renders the attendee phone number when available", () => {
    const calEvent = buildCalendarEvent({
      attendees: [{ ...buildPerson({ name: "Bob", email: "bob@example.com" }), phoneNumber: "+15551234567" }],
    });

    expect(renderWhoInfo(calEvent)).toContain("+15551234567");
  });
});
