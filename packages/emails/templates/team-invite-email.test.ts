import { describe, expect, it } from "vitest";
import type { TeamInvite } from "../lib/utils/team-invite-utils";
import { createTranslator, getPayload } from "../test-utils/fixtures";
import TeamInviteEmail from "./team-invite-email";

const buildInvite = (overrides: Partial<TeamInvite> = {}): TeamInvite => ({
  language: createTranslator({
    team: "Team",
    organization: "Organization",
    "email_team_invite|subject|invited_to_regular_team": "{{user}} invited you to {{team}}",
    "email_team_invite|subject|invited_to_org": "{{user}} invited you to the {{entity}} {{team}}",
  }),
  from: "Oliver",
  to: "anna@example.com",
  teamName: "Acme",
  joinLink: "https://cal.com/auth/join?token=abc",
  isCalcomMember: true,
  isAutoJoin: false,
  isOrg: false,
  parentTeamName: undefined,
  isExistingUserMovedToOrg: false,
  prevLink: null,
  newLink: null,
  ...overrides,
});

describe("TeamInviteEmail", () => {
  it("sends the team invite with the join link", async () => {
    const payload = await getPayload(new TeamInviteEmail(buildInvite()));

    expect(payload.to).toBe("anna@example.com");
    expect(payload.subject).toBe("Oliver invited you to Acme");
    expect(String(payload.html)).toContain("https://cal.com/auth/join?token=abc");
    expect(payload.text).toBe("");
  });

  it("uses the organization subject for org invites", async () => {
    const payload = await getPayload(new TeamInviteEmail(buildInvite({ isOrg: true })));

    expect(payload.subject).toBe("Oliver invited you to the organization Acme");
  });
});
