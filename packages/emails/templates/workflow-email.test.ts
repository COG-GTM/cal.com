import { describe, expect, it } from "vitest";
import { getPayload } from "../test-utils/fixtures";
import WorkflowEmail, { addHTMLStyles } from "./workflow-email";

describe("addHTMLStyles", () => {
  it("returns an empty string when there is no html", () => {
    expect(addHTMLStyles()).toBe("");
  });

  it("enlarges rating emoji links inside h6 elements", () => {
    const styled = addHTMLStyles(
      '<h6><a href="https://cal.com/rate/1">star</a></h6><p><a href="#">x</a></p>'
    );

    expect(styled).toContain("font-size: 20px");
    expect(styled).toContain("text-decoration: none");
    expect(styled).toMatch(/<p><a href="#">x<\/a><\/p>/);
  });
});

describe("WorkflowEmail", () => {
  it("uses the workflow sender and reply-to when provided", async () => {
    const payload = await getPayload(
      new WorkflowEmail({
        to: "anna@example.com",
        subject: "Reminder",
        html: "<p>See you soon</p>",
        replyTo: "oliver@example.com",
        sender: "Acme",
        attachments: [{ content: "aWNz", filename: "event.ics" }],
      })
    );

    expect(payload.to).toBe("anna@example.com");
    expect(payload.subject).toBe("Reminder");
    expect(String(payload.from)).toContain("Acme <");
    expect(payload.replyTo).toBe("oliver@example.com");
    expect(payload.attachments).toEqual([{ content: "aWNz", filename: "event.ics" }]);
  });

  it("falls back to the default sender and omits reply-to", async () => {
    const payload = await getPayload(
      new WorkflowEmail({ to: "anna@example.com", subject: "Reminder", html: "<p>Hi</p>" })
    );

    expect(payload).not.toHaveProperty("replyTo");
    expect(String(payload.from)).toContain("Cal.com");
  });
});
