import { buildCalendarEvent } from "@calcom/lib/test/builder";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppsStatus } from "./AppsStatus";

const t = ((key: string) => key) as unknown as TFunction;

const buildAppStatus = (overrides: Partial<NonNullable<CalendarEvent["appsStatus"]>[number]>) => ({
  appName: "Google Meet",
  type: "google_video",
  success: 0,
  failures: 0,
  errors: [],
  ...overrides,
});

const render = (appsStatus: CalendarEvent["appsStatus"]) =>
  renderToStaticMarkup(<AppsStatus calEvent={buildCalendarEvent({ appsStatus })} t={t} />);

describe("AppsStatus", () => {
  it("renders nothing when the event has no apps status", () => {
    expect(render(undefined)).toBe("");
  });

  it("marks a single success without a counter", () => {
    const html = render([buildAppStatus({ success: 1 })]);

    expect(html).toContain("Google Meet");
    expect(html).toContain("✅");
    expect(html).not.toContain("(x");
  });

  it("adds a counter for repeated successes and failures", () => {
    const html = render([buildAppStatus({ success: 2, failures: 3 })]);

    expect(html).toContain("(x2)");
    expect(html).toContain("❌");
    expect(html).toContain("(x3)");
  });

  it("lists errors and warnings", () => {
    const html = render([
      buildAppStatus({
        failures: 1,
        errors: ["invalid_grant"],
        warnings: ["token expiring soon"],
      }),
    ]);

    expect(html).toContain("invalid_grant");
    expect(html).toContain("token expiring soon");
  });

  it("renders one entry per app", () => {
    const html = render([
      buildAppStatus({ appName: "Google Meet", type: "google_video", success: 1 }),
      buildAppStatus({ appName: "Zoom", type: "zoom_video", failures: 1 }),
    ]);

    expect(html).toContain("Google Meet");
    expect(html).toContain("Zoom");
  });
});
