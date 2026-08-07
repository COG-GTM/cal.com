import { APP_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { TeamInvite } from "./team-invite-utils";
import { getSubject, getTypeOfInvite } from "./team-invite-utils";

const translate = ((key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key) as unknown as TFunction;

const buildTeamInvite = (overrides: Partial<TeamInvite> = {}): TeamInvite => ({
  language: translate,
  from: "Alice",
  to: "bob@example.com",
  teamName: "Engineering",
  joinLink: "https://cal.com/teams",
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
  it("returns TO_ORG for organization invites", () => {
    expect(getTypeOfInvite(buildTeamInvite({ isOrg: true }))).toBe("TO_ORG");
  });

  it("prefers TO_ORG over TO_SUBTEAM when both apply", () => {
    expect(getTypeOfInvite(buildTeamInvite({ isOrg: true, parentTeamName: "Acme" }))).toBe("TO_ORG");
  });

  it("returns TO_SUBTEAM when the team belongs to an organization", () => {
    expect(getTypeOfInvite(buildTeamInvite({ parentTeamName: "Acme" }))).toBe("TO_SUBTEAM");
  });

  it("returns TO_REGULAR_TEAM for a standalone team", () => {
    expect(getTypeOfInvite(buildTeamInvite())).toBe("TO_REGULAR_TEAM");
  });

  it("throws when auto-join is requested for a regular team", () => {
    expect(() => getTypeOfInvite(buildTeamInvite({ isAutoJoin: true }))).toThrow(
      "Auto-join is not supported for regular teams"
    );
  });
});

describe("getSubject", () => {
  it("uses the org subject key and the organization entity", () => {
    const subject = getSubject(buildTeamInvite({ isOrg: true }));

    expect(subject).toContain("email_team_invite|subject|invited_to_org");
    expect(subject).toContain(`"entity":"organization"`);
    expect(subject).toContain(`"appName":"${APP_NAME}"`);
  });

  it("uses the `added` variant for auto-joined org invites", () => {
    expect(getSubject(buildTeamInvite({ isOrg: true, isAutoJoin: true }))).toContain(
      "email_team_invite|subject|added_to_org"
    );
  });

  it("uses the subteam subject key and passes the parent team name", () => {
    const subject = getSubject(buildTeamInvite({ parentTeamName: "Acme" }));

    expect(subject).toContain("email_team_invite|subject|invited_to_subteam");
    expect(subject).toContain(`"parentTeamName":"Acme"`);
  });

  it("uses the regular team subject key and the team entity", () => {
    const subject = getSubject(buildTeamInvite({ from: "Alice", teamName: "Engineering" }));

    expect(subject).toContain("email_team_invite|subject|invited_to_regular_team");
    expect(subject).toContain(`"user":"Alice"`);
    expect(subject).toContain(`"team":"Engineering"`);
    expect(subject).toContain(`"entity":"team"`);
  });
});
