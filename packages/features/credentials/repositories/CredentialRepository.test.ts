import prismock from "@calcom/testing/lib/__mocks__/prisma";
import logger from "@calcom/lib/logger";
import type { PrismaClient } from "@calcom/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialRepository } from "./CredentialRepository";

const USER_ID = 101;
const OTHER_USER_ID = 202;
const TEAM_ID = 303;

const createUser = async (id: number, email: string) =>
  prismock.user.create({ data: { id, email, username: email.split("@")[0] } });

const createCredential = async (
  data: Partial<{
    id: number;
    type: string;
    key: object;
    userId: number | null;
    teamId: number | null;
    appId: string | null;
    delegationCredentialId: string | null;
    encryptedKey: string | null;
    invalid: boolean;
  }> = {}
) =>
  prismock.credential.create({
    data: {
      id: 1,
      type: "google_calendar",
      key: { placeholder: true },
      userId: USER_ID,
      appId: "google-calendar",
      ...data,
    },
  });

describe("CredentialRepository", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await createUser(USER_ID, "owner@example.com");
    await createUser(OTHER_USER_ID, "other@example.com");
  });

  describe("instance methods", () => {
    const repository = () => new CredentialRepository(prismock as unknown as PrismaClient);

    it("findByCredentialId does not return the key field", async () => {
      await createCredential({ id: 11, key: { access_token: "should-not-be-returned" } });

      const credential = await repository().findByCredentialId(11);

      expect(credential).toMatchObject({ id: 11, type: "google_calendar", userId: USER_ID });
      expect(credential).not.toHaveProperty("key");
      expect(credential).not.toHaveProperty("encryptedKey");
    });

    it("findByCredentialId returns null for an unknown id", async () => {
      expect(await repository().findByCredentialId(99999)).toBeNull();
    });

    it("findByIds short-circuits on an empty list without querying", async () => {
      const findMany = vi.fn();
      const credentialRepository = new CredentialRepository({
        credential: { findMany },
      } as unknown as PrismaClient);

      expect(await credentialRepository.findByIds({ ids: [] })).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it("findByIds returns only the requested credentials", async () => {
      await createCredential({ id: 21, appId: "zoom" });
      await createCredential({ id: 22, appId: "stripe" });
      await createCredential({ id: 23, appId: "make" });

      const credentials = await repository().findByIds({ ids: [21, 23] });

      expect(credentials).toEqual(
        expect.arrayContaining([
          { id: 21, appId: "zoom" },
          { id: 23, appId: "make" },
        ])
      );
      expect(credentials).toHaveLength(2);
    });

    it("findByIdWithDelegationCredential returns the calendar-service shape", async () => {
      await createCredential({ id: 31 });

      const credential = await repository().findByIdWithDelegationCredential(31);

      expect(credential).toMatchObject({ id: 31, type: "google_calendar", invalid: false });
      expect(credential).toHaveProperty("delegationCredential", null);
    });

    it("findByTeamIdAndSlugs filters by team and app slugs", async () => {
      await prismock.team.create({ data: { id: TEAM_ID, name: "Team" } });
      await createCredential({ id: 41, userId: null, teamId: TEAM_ID, appId: "stripe" });
      await createCredential({ id: 42, userId: null, teamId: TEAM_ID, appId: "zoom" });

      const credentials = await repository().findByTeamIdAndSlugs({
        teamId: TEAM_ID,
        slugs: ["stripe"],
      });

      expect(credentials).toHaveLength(1);
      expect(credentials[0]).toMatchObject({ id: 41, appId: "stripe" });
      expect(credentials[0]).not.toHaveProperty("key");
    });

    it("findByIdAndTeamId returns null when the credential belongs to another team", async () => {
      await createCredential({ id: 51, userId: null, teamId: TEAM_ID, appId: "stripe" });

      expect(await repository().findByIdAndTeamId({ id: 51, teamId: 999 })).toBeNull();
      expect(await repository().findByIdAndTeamId({ id: 51, teamId: TEAM_ID })).toMatchObject({ id: 51 });
    });
  });

  describe("findByAppIdAndKeyValue", () => {
    const findFirst = vi.fn();
    const repository = () =>
      new CredentialRepository({ credential: { findFirst } } as unknown as PrismaClient);

    beforeEach(() => {
      findFirst.mockReset();
    });

    it("queries by a JSON key path and omits the key when no keyFields are requested", async () => {
      findFirst.mockResolvedValue({ id: 61, appId: "salesforce" });

      const credential = await repository().findByAppIdAndKeyValue({
        appId: "salesforce",
        keyPath: ["instance_url"],
        value: "https://example.my.salesforce.com",
      });

      expect(credential).toEqual({ id: 61, appId: "salesforce" });
      const args = findFirst.mock.calls[0][0];
      expect(args.where).toMatchObject({
        appId: "salesforce",
        key: { path: ["instance_url"], equals: "https://example.my.salesforce.com" },
      });
      expect(args.select.key).toBe(false);
    });

    it("returns null when no credential matches", async () => {
      findFirst.mockResolvedValue(null);

      expect(
        await repository().findByAppIdAndKeyValue({
          appId: "salesforce",
          keyPath: ["instance_url"],
          value: "https://example.my.salesforce.com",
          keyFields: ["instance_url"],
        })
      ).toBeNull();
    });

    it("returns only the requested key fields when keyFields are given", async () => {
      findFirst.mockResolvedValue({
        id: 62,
        appId: "salesforce",
        key: { instance_url: "https://example.my.salesforce.com", refresh_token: "secret" },
      });

      const credential = await repository().findByAppIdAndKeyValue({
        appId: "salesforce",
        keyPath: ["instance_url"],
        value: "https://example.my.salesforce.com",
        keyFields: ["instance_url", "not_present_in_key"],
      });

      expect(findFirst.mock.calls[0][0].select.key).toBe(true);
      expect(credential?.key).toEqual({ instance_url: "https://example.my.salesforce.com" });
    });
  });

  describe("static methods", () => {
    it("create returns a non-delegation credential", async () => {
      const credential = await CredentialRepository.create({
        type: "zoom_video",
        key: { placeholder: true },
        userId: USER_ID,
        appId: "zoom",
      });

      expect(credential).toMatchObject({
        type: "zoom_video",
        userId: USER_ID,
        delegatedTo: null,
        delegatedToId: null,
        delegationCredentialId: null,
      });
      expect(await prismock.credential.count()).toBe(1);
    });

    it("findByAppIdAndUserId returns null when the user has no credential for the app", async () => {
      await createCredential({ id: 71, appId: "zoom" });

      expect(
        await CredentialRepository.findByAppIdAndUserId({ appId: "zoom", userId: USER_ID })
      ).toMatchObject({ id: 71, delegatedTo: null });
      expect(
        await CredentialRepository.findByAppIdAndUserId({ appId: "zoom", userId: OTHER_USER_ID })
      ).toBeNull();
    });

    it("findFirstByIdWithUser omits the key while findFirstByIdWithKeyAndUser includes it", async () => {
      await createCredential({ id: 81, key: { token_marker: "value" }, encryptedKey: "envelope" });

      const safeCredential = await CredentialRepository.findFirstByIdWithUser({ id: 81 });
      expect(safeCredential).not.toHaveProperty("key");
      expect(safeCredential).toMatchObject({ id: 81, user: { email: "owner@example.com" } });

      const credentialWithKey = await CredentialRepository.findFirstByIdWithKeyAndUser({ id: 81 });
      expect(credentialWithKey).toHaveProperty("key");
      expect(credentialWithKey).toHaveProperty("encryptedKey");
    });

    it("findFirstByAppIdAndUserId returns the raw credential without delegation fields", async () => {
      await createCredential({ id: 91, appId: "stripe" });

      const credential = await CredentialRepository.findFirstByAppIdAndUserId({
        appId: "stripe",
        userId: USER_ID,
      });

      expect(credential).toMatchObject({ id: 91, appId: "stripe" });
      expect(credential).not.toHaveProperty("delegatedTo");
    });

    it("findFirstByUserIdAndType matches on user and type", async () => {
      await createCredential({ id: 101, type: "office365_calendar" });

      expect(
        await CredentialRepository.findFirstByUserIdAndType({ userId: USER_ID, type: "office365_calendar" })
      ).toMatchObject({ id: 101 });
      expect(
        await CredentialRepository.findFirstByUserIdAndType({ userId: USER_ID, type: "zoom_video" })
      ).toBeNull();
    });

    it("deleteById removes the credential", async () => {
      await createCredential({ id: 111 });

      await CredentialRepository.deleteById({ id: 111 });

      expect(await prismock.credential.findUnique({ where: { id: 111 } })).toBeNull();
    });

    it("updateCredentialById persists the given fields", async () => {
      await createCredential({ id: 121, invalid: false });

      await CredentialRepository.updateCredentialById({ id: 121, data: { invalid: true } });

      const credential = await prismock.credential.findUnique({ where: { id: 121 } });
      expect(credential?.invalid).toBe(true);
    });

    it("deleteAllByDelegationCredentialId only deletes the matching delegation credentials", async () => {
      await createCredential({ id: 131, delegationCredentialId: "delegation-1" });
      await createCredential({ id: 132, delegationCredentialId: "delegation-2" });

      const result = await CredentialRepository.deleteAllByDelegationCredentialId({
        delegationCredentialId: "delegation-1",
      });

      expect(result.count).toBe(1);
      expect(await prismock.credential.findUnique({ where: { id: 132 } })).not.toBeNull();
    });

    it("findCredentialForCalendarServiceById returns null for an unknown credential", async () => {
      expect(await CredentialRepository.findCredentialForCalendarServiceById({ id: 999 })).toBeNull();
    });

    it("findCredentialForCalendarServiceById returns null for an in-db delegation credential", async () => {
      await createCredential({ id: 141, delegationCredentialId: "delegation-1" });

      expect(await CredentialRepository.findCredentialForCalendarServiceById({ id: 141 })).toBeNull();
    });

    it("findCredentialForCalendarServiceById returns a non-delegation credential", async () => {
      await createCredential({ id: 142 });

      expect(await CredentialRepository.findCredentialForCalendarServiceById({ id: 142 })).toMatchObject({
        id: 142,
        delegatedTo: null,
        delegationCredentialId: null,
      });
    });

    it("findByIdIncludeDelegationCredential keeps the delegation credential id", async () => {
      await createCredential({ id: 151, delegationCredentialId: "delegation-1" });

      expect(await CredentialRepository.findByIdIncludeDelegationCredential({ id: 151 })).toMatchObject({
        id: 151,
        delegationCredentialId: "delegation-1",
      });
    });

    it("findAllDelegationByUserIdsListAndDelegationCredentialIdAndType returns matching user ids", async () => {
      await createCredential({
        id: 161,
        userId: USER_ID,
        delegationCredentialId: "delegation-1",
        type: "google_calendar",
      });
      await createCredential({
        id: 162,
        userId: OTHER_USER_ID,
        delegationCredentialId: "delegation-1",
        type: "office365_calendar",
      });

      const credentials =
        await CredentialRepository.findAllDelegationByUserIdsListAndDelegationCredentialIdAndType({
          userIds: [USER_ID, OTHER_USER_ID],
          delegationCredentialId: "delegation-1",
          type: "google_calendar",
        });

      expect(credentials).toEqual([{ userId: USER_ID }]);
    });

    it("findAllDelegationByTypeIncludeUserAndTake respects take and narrows delegationCredentialId", async () => {
      await createCredential({ id: 171, delegationCredentialId: "delegation-1" });
      await createCredential({
        id: 172,
        userId: OTHER_USER_ID,
        delegationCredentialId: "delegation-2",
      });
      await createCredential({ id: 173, delegationCredentialId: null });

      const credentials = await CredentialRepository.findAllDelegationByTypeIncludeUserAndTake({
        type: "google_calendar",
        take: 1,
      });

      expect(credentials).toHaveLength(1);
      expect(credentials[0].delegationCredentialId).toBe("delegation-1");
      expect(credentials[0].user).toMatchObject({ email: "owner@example.com" });
    });

    it("findUniqueByUserIdAndDelegationCredentialId returns the single match", async () => {
      await createCredential({ id: 181, delegationCredentialId: "delegation-1" });

      expect(
        await CredentialRepository.findUniqueByUserIdAndDelegationCredentialId({
          userId: USER_ID,
          delegationCredentialId: "delegation-1",
        })
      ).toMatchObject({ id: 181 });
    });

    it("findUniqueByUserIdAndDelegationCredentialId logs and returns the first of several matches", async () => {
      const errorSpy = vi.spyOn(Object.getPrototypeOf(logger), "error");
      await createCredential({ id: 182, delegationCredentialId: "delegation-1" });
      await createCredential({ id: 183, delegationCredentialId: "delegation-1" });

      const credential = await CredentialRepository.findUniqueByUserIdAndDelegationCredentialId({
        userId: USER_ID,
        delegationCredentialId: "delegation-1",
      });

      expect(credential).toMatchObject({ id: 182 });
      expect(errorSpy).toHaveBeenCalled();
    });

    it("findUniqueByUserIdAndDelegationCredentialId returns undefined when nothing matches", async () => {
      expect(
        await CredentialRepository.findUniqueByUserIdAndDelegationCredentialId({
          userId: USER_ID,
          delegationCredentialId: "delegation-1",
        })
      ).toBeUndefined();
    });

    it("updateWhereUserIdAndDelegationCredentialId updates every matching credential", async () => {
      await createCredential({ id: 191, delegationCredentialId: "delegation-1" });
      await createCredential({ id: 192, delegationCredentialId: "delegation-1" });
      await createCredential({ id: 193, delegationCredentialId: "delegation-2" });

      const result = await CredentialRepository.updateWhereUserIdAndDelegationCredentialId({
        userId: USER_ID,
        delegationCredentialId: "delegation-1",
        data: { key: { rotated: true } },
      });

      expect(result.count).toBe(2);
      const untouched = await prismock.credential.findUnique({ where: { id: 193 } });
      expect(untouched?.key).toEqual({ placeholder: true });
    });

    it("createDelegationCredential stores encryptedKey only when provided", async () => {
      const withoutEncryptedKey = await CredentialRepository.createDelegationCredential({
        userId: USER_ID,
        delegationCredentialId: "delegation-1",
        type: "google_calendar",
        key: {},
        appId: "google-calendar",
      });
      expect(withoutEncryptedKey.encryptedKey).toBeNull();

      const withEncryptedKey = await CredentialRepository.createDelegationCredential({
        userId: OTHER_USER_ID,
        delegationCredentialId: "delegation-2",
        type: "google_calendar",
        key: {},
        appId: "google-calendar",
        encryptedKey: "envelope",
      });
      expect(withEncryptedKey.encryptedKey).toBe("envelope");
    });

    it("updateWhereId replaces the key of a single credential", async () => {
      await createCredential({ id: 201 });

      await CredentialRepository.updateWhereId({ id: 201, data: { key: { rotated: true } } });

      const credential = await prismock.credential.findUnique({ where: { id: 201 } });
      expect(credential?.key).toEqual({ rotated: true });
    });

    describe("payment credential lookups", () => {
      beforeEach(async () => {
        await prismock.team.create({ data: { id: TEAM_ID, name: "Team" } });
        await prismock.app.create({
          data: { slug: "stripe", dirName: "stripepayment", categories: ["payment"], keys: {} },
        });
        await createCredential({ id: 211, userId: USER_ID, appId: "stripe" });
        await createCredential({ id: 212, userId: null, teamId: TEAM_ID, appId: "stripe" });
      });

      it("findPaymentCredentialByAppIdAndTeamId includes the app", async () => {
        const credential = await CredentialRepository.findPaymentCredentialByAppIdAndTeamId({
          appId: "stripe",
          teamId: TEAM_ID,
        });

        expect(credential).toMatchObject({ id: 212, app: { slug: "stripe" } });
      });

      it("findPaymentCredentialByAppIdAndUserId scopes to the user", async () => {
        expect(
          await CredentialRepository.findPaymentCredentialByAppIdAndUserId({
            appId: "stripe",
            userId: USER_ID,
          })
        ).toMatchObject({ id: 211 });
        expect(
          await CredentialRepository.findPaymentCredentialByAppIdAndUserId({
            appId: "stripe",
            userId: OTHER_USER_ID,
          })
        ).toBeNull();
      });

      it("findPaymentCredentialByAppIdAndUserIdOrTeamId prefers the team when a teamId is given", async () => {
        expect(
          await CredentialRepository.findPaymentCredentialByAppIdAndUserIdOrTeamId({
            appId: "stripe",
            userId: USER_ID,
            teamId: TEAM_ID,
          })
        ).toMatchObject({ id: 212 });

        expect(
          await CredentialRepository.findPaymentCredentialByAppIdAndUserIdOrTeamId({
            appId: "stripe",
            userId: USER_ID,
            teamId: null,
          })
        ).toMatchObject({ id: 211 });
      });
    });
  });
});
