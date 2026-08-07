import { buildCalendarEvent } from "@calcom/lib/test/builder";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocationInfo } from "./LocationInfo";

const t = ((key: string) => key) as unknown as TFunction;

const render = (calEvent: CalendarEvent) => renderToStaticMarkup(<LocationInfo calEvent={calEvent} t={t} />);

describe("LocationInfo", () => {
  it("links to the video call url when the event has video call data", () => {
    const calEvent = buildCalendarEvent({
      location: "integrations:zoom",
      videoCallData: {
        type: "zoom_video",
        id: "abc",
        password: "secret",
        url: "https://zoom.us/j/abc",
      },
    });

    const html = render(calEvent);

    expect(html).toContain("https://zoom.us/j/abc");
    expect(html).toContain("meeting_url");
    expect(html).toContain("Zoom Video");
  });

  it("links to the Cal Video url for daily_video events instead of the raw url", () => {
    const calEvent = buildCalendarEvent({
      location: "integrations:daily",
      videoCallData: {
        type: "daily_video",
        id: "abc",
        password: "secret",
        url: "https://cal.daily.co/abc",
      },
    });

    const html = render(calEvent);

    expect(html).toContain(`/video/${calEvent.uid}`);
    expect(html).not.toContain("https://cal.daily.co/abc");
  });

  it("links to the location itself when it is a plain url", () => {
    const calEvent = buildCalendarEvent({ location: "https://zoom.us/j/123" }, /* omitVideoCallData */ true);

    const html = render(calEvent);

    expect(html).toContain("https://zoom.us/j/123");
    expect(html).toContain("meeting_url");
  });

  it("renders a tel link for phone locations", () => {
    const calEvent = buildCalendarEvent({ location: "+15551234567" }, true);

    expect(render(calEvent)).toContain(`href="tel:+15551234567"`);
  });

  it("falls back to rendering the raw location for in-person events", () => {
    const calEvent = buildCalendarEvent({ location: "Cal HQ, San Francisco" }, true);

    const html = render(calEvent);

    expect(html).toContain("where");
    expect(html).toContain("Cal HQ, San Francisco");
    expect(html).not.toContain("meeting_url");
  });

  it("renders the provider label for an unconfirmed video booking without a link", () => {
    const calEvent = buildCalendarEvent({ location: "integrations:zoom", requiresConfirmation: true }, true);

    const html = render(calEvent);

    expect(html).toContain("Zoom Video");
    expect(html).not.toContain("href");
  });
});
