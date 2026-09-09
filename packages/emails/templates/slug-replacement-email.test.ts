import { describe, expect, it } from "vitest";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import SlugReplacementEmail from "./slug-replacement-email";

const t = createTranslator({
  email_subject_slug_replacement: "Your {{slug}} event type was replaced",
  email_body_slug_replacement_notice: "The event type {{slug}} was replaced.",
  email_body_slug_replacement_suggestion: "Review your event types.",
});

describe("SlugReplacementEmail", () => {
  it("tells the user which slug was replaced", async () => {
    const payload = await getPayload(
      new SlugReplacementEmail("anna@example.com", "Anna", "Acme", "30min", t)
    );

    expect(payload.to).toBe("anna@example.com");
    expect(payload.subject).toBe("Your 30min event type was replaced");
    expect(payload.text).toBe("The event type 30min was replaced. Review your event types.");
  });

  it("renders without a team name when the user has no team", async () => {
    const payload = await getPayload(new SlugReplacementEmail("anna@example.com", "Anna", null, "30min", t));

    expect(String(payload.html)).toContain("30min");
  });
});
