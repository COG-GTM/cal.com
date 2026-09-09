import { describe, expect, it } from "vitest";
import { createTranslator } from "../../test-utils/fixtures";
import type { TeamInvite } from "./team-invite-utils";
import { getSubject, getTypeOfInvite } from "./team-invite-utils";

const language = createTranslator({
  organization: "Organization",
  team: "Team",
  "email_team_invite|subject|invited_to_org": "{{user}} invited you to the {{entity}} {{team}}",
  "email_team_invite|subject|added_to_org": "{{user}} added you to the {{entity}} {{team}}",
  "email_team_invite|subject|invited_to_subteam": "{{user}} invited you to {{team}} of {{parentTeamName}}",
  "email_team_invite|subject|invited_to_regular_team": "{{user}} invited you to {{team}}",
});

const buildInvite = (overrides: Partial<TeamInvite> = {}): TeamInvite => ({
  language,
  from: "Oliver",
  to: "anna@example.com",
  teamName: "Acme",
  joinLink: "https://cal.com/auth/join",
  isCalcomMember: true,
  isAutoJoin: false,
  isOrg: false,
  parentTeamName: undefined,
  isExistingUserMovedToOrg: false,
  prevLink: null,
  newLink: null,
  ...overrides,
});

describe("getTypeOfInvite", () => {
  it("detects organization invites first", () => {
    expect(getTypeOfInvite(buildInvite({ isOrg: true, parentTeamName: "Acme" }))).toBe("TO_ORG");
  });

  it("detects subteam invites by the parent team name", () => {
    expect(getTypeOfInvite(buildInvite({ parentTeamName: "Acme" }))).toBe("TO_SUBTEAM");
  });

  it("detects regular team invites", () => {
    expect(getTypeOfInvite(buildInvite())).toBe("TO_REGULAR_TEAM");
  });

  it("rejects auto-join for regular teams", () => {
    expect(() => getTypeOfInvite(buildInvite({ isAutoJoin: true }))).toThrow(
      "Auto-join is not supported for regular teams"
    );
  });
});

describe("getSubject", () => {
  it("uses the invited-to-org copy with a lowercased entity", () => {
    expect(getSubject(buildInvite({ isOrg: true }))).toBe("Oliver invited you to the organization Acme");
  });

  it("switches to the added copy for auto-join org invites", () => {
    expect(getSubject(buildInvite({ isOrg: true, isAutoJoin: true }))).toBe(
      "Oliver added you to the organization Acme"
    );
  });

  it("names the parent team for subteam invites", () => {
    expect(getSubject(buildInvite({ parentTeamName: "Umbrella" }))).toBe(
      "Oliver invited you to Acme of Umbrella"
    );
  });

  it("falls back to the regular team copy", () => {
    expect(getSubject(buildInvite())).toBe("Oliver invited you to Acme");
  });
});
