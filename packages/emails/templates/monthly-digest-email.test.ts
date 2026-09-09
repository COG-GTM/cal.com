import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import MonthlyDigestEmail from "./monthly-digest-email";

describe("MonthlyDigestEmail", () => {
  it("emails the team admin a digest of the month's booking stats", async () => {
    const email = new MonthlyDigestEmail({
      language: createTranslator(),
      Created: 12,
      Completed: 9,
      Rescheduled: 2,
      Cancelled: 1,
      mostBookedEvents: [{ eventTypeId: 1, eventTypeName: "30min", count: 7 }],
      membersWithMostBookings: [
        {
          userId: 4,
          user: { id: 4, name: "Anna", email: "anna@example.com", avatar: null, username: "anna" },
          count: 5,
        },
      ],
      admin: { email: "admin@acme.com", name: "Admin" },
      team: { name: "Acme", id: 1 },
    });

    const payload = await getPayload(email);
    const html = String(payload.html);

    expect(payload.to).toBe("admin@acme.com");
    expect(payload.subject).toBe("Cal.com: Your monthly digest");
    expect(html).toContain("30min");
    expect(html).toContain("Anna");
    expect(html).toContain("insights?teamId=1");
    expect(html).toContain("12");
  });
});
