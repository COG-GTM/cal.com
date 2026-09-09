import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPayload } from "../test-utils/fixtures";
import FeedbackEmail from "./feedback-email";

describe("FeedbackEmail", () => {
  beforeAll(() => {
    vi.stubEnv("SEND_FEEDBACK_EMAIL", "feedback@example.com");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("routes the feedback to the configured inbox with rating and comment", async () => {
    const email = new FeedbackEmail({
      username: "anna",
      email: "anna@example.com",
      rating: "5",
      comment: "Works great",
    });

    const payload = await getPayload(email);

    expect(payload.to).toBe("feedback@example.com");
    expect(payload.subject).toBe("User Feedback");
    expect(payload.text).toContain("User: anna");
    expect(payload.text).toContain("Rating: 5");
    expect(payload.text).toContain("Comment: Works great");
  });
});
