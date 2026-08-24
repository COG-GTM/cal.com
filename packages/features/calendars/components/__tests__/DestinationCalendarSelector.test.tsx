import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DestinationCalendarSelector from "../DestinationCalendarSelector";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

const calendar = ({
  externalId,
  name,
  readOnly = false,
}: {
  externalId: string;
  name: string;
  readOnly?: boolean;
}) => ({
  externalId,
  name,
  integration: "google_calendar",
  readOnly,
  credentialId: 1,
});

const queryData = {
  connectedCalendars: [
    {
      credentialId: 1,
      integration: { type: "google_calendar", title: "Google Calendar" },
      primary: { externalId: "primary@example.com", name: "Primary", integration: "google_calendar" },
      calendars: [
        calendar({ externalId: "primary@example.com", name: "Primary" }),
        calendar({ externalId: "readonly@example.com", name: "Read only", readOnly: true }),
      ],
    },
  ],
  destinationCalendar: {
    integration: "google_calendar",
    externalId: "primary@example.com",
    name: "Primary",
    integrationTitle: "Google Calendar",
    primaryEmail: "primary@example.com",
  },
};

describe("DestinationCalendarSelector", () => {
  it("renders nothing when there are no connected calendars", () => {
    const { container } = render(
      <DestinationCalendarSelector
        onChange={vi.fn()}
        value={undefined}
        calendarsQueryData={{ connectedCalendars: [], destinationCalendar: null }}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no query data is given at all", () => {
    const { container } = render(<DestinationCalendarSelector onChange={vi.fn()} value={undefined} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the placeholder and the advanced tab hint by default", () => {
    render(
      <DestinationCalendarSelector onChange={vi.fn()} value={undefined} calendarsQueryData={queryData} />
    );

    expect(screen.getByText("create_events_on")).toBeInTheDocument();
    expect(screen.getByText("you_can_override_calendar_in_advanced_tab")).toBeInTheDocument();
  });

  it("hides the advanced tab hint when asked", () => {
    render(
      <DestinationCalendarSelector
        onChange={vi.fn()}
        value={undefined}
        hideAdvancedText
        calendarsQueryData={queryData}
      />
    );

    expect(screen.queryByText("you_can_override_calendar_in_advanced_tab")).not.toBeInTheDocument();
  });

  it("shows the destination calendar badge placeholder when the placeholder is hidden", () => {
    render(
      <DestinationCalendarSelector
        onChange={vi.fn()}
        value={undefined}
        hidePlaceholder
        calendarsQueryData={queryData}
      />
    );

    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText(/Primary \(Google Calendar - primary@example.com\)/)).toBeInTheDocument();
  });

  it("preselects the calendar matching the given external id", () => {
    const { container } = render(
      <DestinationCalendarSelector
        onChange={vi.fn()}
        value="primary@example.com"
        calendarsQueryData={queryData}
      />
    );

    expect(container.textContent).toContain("Primary");
    expect(container.textContent).toContain("(Google  - Primary)");
  });

  it("only offers writable calendars and reports the picked integration and external id", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DestinationCalendarSelector onChange={onChange} value={undefined} calendarsQueryData={queryData} />
    );

    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(screen.queryByText(/Read only/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Primary/, { selector: "span" }));

    expect(onChange).toHaveBeenCalledWith({
      integration: "google_calendar",
      externalId: "primary@example.com",
    });
  });
});
