import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import CreditBalanceLowWarningEmail from "./credit-balance-low-warning-email";

const t = createTranslator({
  team_credits_low_warning: "{{teamName}} is running low on credits",
  user_credits_low_warning: "You are running low on credits",
});

const user = { id: 1, name: "Anna", email: "anna@example.com", t };

describe("CreditBalanceLowWarningEmail", () => {
  it("warns the user directly when there is no team", async () => {
    const payload = await getPayload(new CreditBalanceLowWarningEmail({ user, balance: 40 }));

    expect(payload.to).toBe("anna@example.com");
    expect(payload.subject).toBe("You are running low on credits");
    expect(payload.text).toContain("running low on credits");
  });

  it("warns about the team and shows the remaining balance", async () => {
    const payload = await getPayload(
      new CreditBalanceLowWarningEmail({ user, balance: 40, team: { id: 3, name: "Acme" } })
    );

    expect(payload.subject).toBe("Acme is running low on credits");
    expect(String(payload.html)).toContain("40");
  });
});
