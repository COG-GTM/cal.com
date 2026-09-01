import type { MembershipRepository as MembershipRepositoryType } from "@calcom/features/membership/repositories/MembershipRepository";
import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockMembershipRepository = {
  findUniqueByUserIdAndTeamId: ReturnType<typeof vi.fn>;
};

const mockMembershipRepository: MockMembershipRepository = vi.hoisted(() => ({
  findUniqueByUserIdAndTeamId: vi.fn(),
}));

vi.mock("@calcom/features/membership/repositories/MembershipRepository", () => ({
  MembershipRepository: vi.fn().mockImplementation(function () {
    return mockMembershipRepository;
  }),
}));

vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));

import { MembershipService } from "./membershipService";

describe("MembershipService", () => {
  let service: MembershipService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MembershipRepository).mockImplementation(function () {
      return mockMembershipRepository as unknown as MembershipRepositoryType;
    });
    service = new MembershipService(mockMembershipRepository as unknown as MembershipRepositoryType);
  });

  it.each([
    [null, { isMember: false, isAdmin: false, isOwner: false, role: undefined }],
    [
      { accepted: false, role: MembershipRole.MEMBER },
      { isMember: false, isAdmin: false, isOwner: false, role: undefined },
    ],
    [
      { accepted: true, role: MembershipRole.MEMBER },
      { isMember: true, isAdmin: false, isOwner: false, role: MembershipRole.MEMBER },
    ],
    [
      { accepted: true, role: MembershipRole.ADMIN },
      { isMember: true, isAdmin: true, isOwner: false, role: MembershipRole.ADMIN },
    ],
    [
      { accepted: true, role: MembershipRole.OWNER },
      { isMember: true, isAdmin: true, isOwner: true, role: MembershipRole.OWNER },
    ],
  ])("returns the expected status for %s", async (membership, expected) => {
    mockMembershipRepository.findUniqueByUserIdAndTeamId.mockResolvedValue(membership);

    await expect(service.checkMembership(10, 20)).resolves.toEqual(expected);
    expect(mockMembershipRepository.findUniqueByUserIdAndTeamId).toHaveBeenCalledWith({
      teamId: 10,
      userId: 20,
    });
  });

  it("creates a MembershipRepository by default", () => {
    vi.mocked(MembershipRepository).mockClear();
    new MembershipService();
    expect(MembershipRepository).toHaveBeenCalledTimes(1);
  });
});
