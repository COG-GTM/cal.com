import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { describe, expect, it, vi } from "vitest";
import { createContainer } from "../di";
import { DI_TOKENS } from "../tokens";
import type { OrgMembershipLookup } from "./OrgMembershipLookup";
import { orgMembershipLookupModule } from "./OrgMembershipLookup";

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: { findFirstOrganizationIdForUser: vi.fn() },
}));

describe("orgMembershipLookupModule", () => {
  it("delegates the lookup to ProfileRepository", async () => {
    vi.mocked(ProfileRepository.findFirstOrganizationIdForUser).mockResolvedValue(42);
    const container = createContainer();
    container.load(DI_TOKENS.ORG_MEMBERSHIP_LOOKUP_MODULE, orgMembershipLookupModule);

    const lookup = container.get<OrgMembershipLookup>(DI_TOKENS.ORG_MEMBERSHIP_LOOKUP);

    await expect(lookup.findFirstOrganizationIdForUser({ userId: 1 })).resolves.toBe(42);
    expect(ProfileRepository.findFirstOrganizationIdForUser).toHaveBeenCalledWith({ userId: 1 });
  });
});
