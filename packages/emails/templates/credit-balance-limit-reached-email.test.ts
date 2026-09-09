import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import CreditBalanceLimitReachedEmail from "./credit-balance-limit-reached-email";

const t = createTranslator({
  action_required_out_of_credits: "{{teamName}} is out of credits",
  action_required_user_out_of_credits: "You are out of credits",
});

const user = { id: 1, name: "Anna", email: "anna@example.com", t };

describe("CreditBalanceLimitReachedEmail", () => {
  it("uses the personal subject when no team is given", async () => {
    const payload = await getPayload(new CreditBalanceLimitReachedEmail({ user }));

    expect(payload.to).toBe("anna@example.com");
    expect(payload.subject).toBe("You are out of credits");
    expect(payload.text).toContain("ran out of credits");
  });

  it("names the team in the subject when a team is given", async () => {
    const payload = await getPayload(
      new CreditBalanceLimitReachedEmail({ user, team: { id: 3, name: "Acme" } })
    );

    expect(payload.subject).toBe("Acme is out of credits");
  });

  it("falls back to an empty name when the user has none", async () => {
    const payload = await getPayload(
      new CreditBalanceLimitReachedEmail({ user: { ...user, name: null }, team: { id: 3, name: null } })
    );

    expect(payload.subject).toBe(" is out of credits");
  });
});
