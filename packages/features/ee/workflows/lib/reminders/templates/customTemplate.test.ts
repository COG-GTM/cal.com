import dayjs from "@calcom/dayjs";
import { TimeFormat } from "@calcom/lib/timeFormat";
import { describe, expect, it } from "vitest";
import customTemplate, {
  formatIdentifierToVariable,
  getVariableFormats,
  transformBookingResponsesToVariableFormat,
} from "./customTemplate";

describe("formatIdentifierToVariable", () => {
  it("should convert spaces to underscores and uppercase", () => {
    expect(formatIdentifierToVariable("Company Name")).toBe("COMPANY_NAME");
  });

  it("should preserve existing underscores", () => {
    expect(formatIdentifierToVariable("Company_Name")).toBe("COMPANY_NAME");
  });

  it("should handle multiple underscores", () => {
    expect(formatIdentifierToVariable("Monthly_Infrastructure_Spend")).toBe("MONTHLY_INFRASTRUCTURE_SPEND");
  });

  it("should remove special characters except underscores", () => {
    expect(formatIdentifierToVariable("Company-Name!")).toBe("COMPANYNAME");
  });

  it("should handle mixed spaces and underscores", () => {
    expect(formatIdentifierToVariable("Company_Name Here")).toBe("COMPANY_NAME_HERE");
  });

  it("should trim whitespace", () => {
    expect(formatIdentifierToVariable("  Company Name  ")).toBe("COMPANY_NAME");
  });
  it("should preserve numbers", () => {
    expect(formatIdentifierToVariable("Company123_Name")).toBe("COMPANY123_NAME");
  });
});

describe("getVariableFormats", () => {
  it("should return both formats when identifier has underscores", () => {
    const formats = getVariableFormats("Company_Name");
    expect(formats).toContain("COMPANY_NAME");
    expect(formats).toContain("COMPANYNAME");
    expect(formats).toHaveLength(2);
  });

  it("should return single format when no underscores in identifier", () => {
    const formats = getVariableFormats("Company Name");
    expect(formats).toEqual(["COMPANY_NAME"]);
  });

  it("should return single format when identifier has no special chars", () => {
    const formats = getVariableFormats("CompanyName");
    expect(formats).toEqual(["COMPANYNAME"]);
  });

  it("should handle multiple underscores", () => {
    const formats = getVariableFormats("Monthly_Infrastructure_Spend");
    expect(formats).toContain("MONTHLY_INFRASTRUCTURE_SPEND");
    expect(formats).toContain("MONTHLYINFRASTRUCTURESPEND");
    expect(formats).toHaveLength(2);
  });
});

describe("customTemplate - variable replacement", () => {
  const baseVariables = {
    eventName: "Test Event",
    organizerName: "Test Organizer",
    attendeeName: "Test Attendee",
    timeZone: "UTC",
  };

  it("should replace variables with underscores in template", () => {
    const responses = transformBookingResponsesToVariableFormat({
      Company_Name: { value: "Acme Corp", label: "Company Name" },
    });

    const result = customTemplate(
      "Company: {COMPANY_NAME}",
      { ...baseVariables, responses },
      "en",
      undefined,
      true
    );

    expect(result.text).toBe("Company: Acme Corp");
  });

  it("should replace legacy variables without underscores in template (backward compatibility)", () => {
    const responses = transformBookingResponsesToVariableFormat({
      Company_Name: { value: "Acme Corp", label: "Company Name" },
    });

    const result = customTemplate(
      "Company: {COMPANYNAME}",
      { ...baseVariables, responses },
      "en",
      undefined,
      true
    );

    expect(result.text).toBe("Company: Acme Corp");
  });

  it("should handle both variable formats in the same template", () => {
    const responses = transformBookingResponsesToVariableFormat({
      Company_Name: { value: "Acme Corp", label: "Company Name" },
      Monthly_Spend: { value: "$5000", label: "Monthly Spend" },
    });

    const result = customTemplate(
      "Company: {COMPANY_NAME}, Spend: {MONTHLYSPEND}",
      { ...baseVariables, responses },
      "en",
      undefined,
      true
    );

    expect(result.text).toBe("Company: Acme Corp, Spend: $5000");
  });

  it("should handle identifiers with spaces (converted to underscores)", () => {
    const responses = transformBookingResponsesToVariableFormat({
      "Company Name": { value: "Acme Corp", label: "Company Name" },
    });

    const result = customTemplate(
      "Company: {COMPANY_NAME}",
      { ...baseVariables, responses },
      "en",
      undefined,
      true
    );

    expect(result.text).toBe("Company: Acme Corp");
  });

  it("should handle array values", () => {
    const responses = transformBookingResponsesToVariableFormat({
      Selected_Options: { value: ["Option A", "Option B", "Option C"], label: "Selected Options" },
    });

    const result = customTemplate(
      "Options: {SELECTED_OPTIONS}",
      { ...baseVariables, responses },
      "en",
      undefined,
      true
    );

    expect(result.text).toBe("Options: Option A, Option B, Option C");
  });

  it("formats custom event dates and end times using placeholder formats", () => {
    const result = customTemplate(
      "{EVENT_DATE_YYYY-MM-DD} {EVENT_TIME_HH:mm} {START_TIME_HH:mm} {EVENT_END_TIME_HH:mm}",
      {
        ...baseVariables,
        eventDate: dayjs("2025-06-15T10:00:00Z"),
        eventEndTime: dayjs("2025-06-15T11:00:00Z"),
      },
      "en",
      TimeFormat.TWENTY_FOUR_HOUR,
      true
    );

    expect(result.text).toContain("2025-06-15");
    expect(result.text).toContain("10:00");
    expect(result.text).toContain("11:00");
  });

  it("renders response values with object values and ignores undefined responses", () => {
    const responses = transformBookingResponsesToVariableFormat({
      Account_Manager: { value: { value: "Alex", optionValue: "alex" }, label: "Account Manager" },
      Empty_Field: { value: "", label: "Empty Field" },
    });

    const result = customTemplate(
      "Manager: {ACCOUNT_MANAGER}; Empty: {EMPTY_FIELD}",
      { ...baseVariables, responses },
      "en",
      undefined,
      true
    );

    expect(result.text).toBe("Manager: [object Object]; Empty: ");
  });
});
