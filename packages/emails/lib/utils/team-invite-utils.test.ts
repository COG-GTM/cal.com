import type { TFunction } from "i18next";
import { describe, expect, test } from "vitest";

import { APP_NAME } from "@calcom/lib/constants";

import type { TeamInvite } from "./team-invite-utils";
import { getSubject, getTypeOfInvite } from "./team-invite-utils";

const translate = ((key: string, variables?: Record<string, string | undefined>): string => {
  if (!variables) return key;
  return `${key}|${JSON.stringify(variables)}`;
}) as TFunction;

const buildTeamInvite = (overrides: Partial<TeamInvite> = {}): TeamInvite => ({
  language: translate,
  from: "Alice",
  to: "bob@example.com",
  teamName: "Engineering",
  joinLink: "https://cal.com/join",
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
  test("returns TO_ORG for an organization invite", () => {
    expect(getTypeOfInvite(buildTeamInvite({ isOrg: true }))).toEqual("TO_ORG");
  });

  test("prefers TO_ORG over TO_SUBTEAM when both apply", () => {
    expect(getTypeOfInvite(buildTeamInvite({ isOrg: true, parentTeamName: "Acme" }))).toEqual("TO_ORG");
  });

  test("returns TO_SUBTEAM when the team belongs to a parent team", () => {
    expect(getTypeOfInvite(buildTeamInvite({ parentTeamName: "Acme" }))).toEqual("TO_SUBTEAM");
  });

  test("returns TO_REGULAR_TEAM for a standalone team invite", () => {
    expect(getTypeOfInvite(buildTeamInvite())).toEqual("TO_REGULAR_TEAM");
  });

  test("throws when auto-joining a regular team", () => {
    expect(() => getTypeOfInvite(buildTeamInvite({ isAutoJoin: true }))).toThrow(
      "Auto-join is not supported for regular teams"
    );
  });

  test("allows auto-join for a subteam", () => {
    expect(getTypeOfInvite(buildTeamInvite({ isAutoJoin: true, parentTeamName: "Acme" }))).toEqual(
      "TO_SUBTEAM"
    );
  });
});

describe("getSubject", () => {
  test("uses the org subject key and the organization entity", () => {
    const subject = getSubject(buildTeamInvite({ isOrg: true, teamName: "Acme" }));

    expect(subject).toContain("email_team_invite|subject|invited_to_org");
    expect(subject).toContain(`"entity":"organization"`);
    expect(subject).toContain(`"team":"Acme"`);
    expect(subject).toContain(`"user":"Alice"`);
    expect(subject).toContain(`"appName":"${APP_NAME}"`);
  });

  test("uses the subteam subject key and passes the parent team name", () => {
    const subject = getSubject(buildTeamInvite({ parentTeamName: "Acme" }));

    expect(subject).toContain("email_team_invite|subject|invited_to_subteam");
    expect(subject).toContain(`"parentTeamName":"Acme"`);
    expect(subject).toContain(`"entity":"team"`);
  });

  test("uses the regular team subject key", () => {
    expect(getSubject(buildTeamInvite())).toContain("email_team_invite|subject|invited_to_regular_team");
  });

  test("uses the `added` variant when the invitee is auto-joined", () => {
    expect(getSubject(buildTeamInvite({ isAutoJoin: true, isOrg: true }))).toContain(
      "email_team_invite|subject|added_to_org"
    );
    expect(getSubject(buildTeamInvite({ isAutoJoin: true, parentTeamName: "Acme" }))).toContain(
      "email_team_invite|subject|added_to_subteam"
    );
  });
});
