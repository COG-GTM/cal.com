import "@calcom/lib/__mocks__/logger";

import { getResponseToStore } from "@calcom/app-store/routing-forms/lib/getResponseToStore";
import { getSerializableForm } from "@calcom/app-store/routing-forms/lib/getSerializableForm";
import { findMatchingRoute } from "@calcom/app-store/routing-forms/lib/processRoute";
import { orgDomainConfig } from "@calcom/features/ee/organizations/lib/orgDomains";
import { isAuthorizedToViewFormOnOrgDomain } from "@calcom/features/routing-forms/lib/isAuthorizedToViewForm";
import { PrismaRoutingFormRepository } from "@calcom/features/routing-forms/repositories/PrismaRoutingFormRepository";
import { getRoutingTraceService } from "@calcom/features/routing-trace/di/RoutingTraceService.container";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { HttpError } from "@calcom/lib/http-error";
import { TRPCError } from "@trpc/server";
import type { GetServerSidePropsContext } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRoutedUrl } from "./getRoutedUrl";
import { getUrlSearchParamsToForward } from "./getUrlSearchParamsToForward";
import { handleResponse } from "./handleResponse";

vi.mock("./getUrlSearchParamsToForward");
vi.mock("./handleResponse");
vi.mock("@calcom/lib/checkRateLimitAndThrowError");
vi.mock("@calcom/features/routing-forms/repositories/PrismaRoutingFormRepository");
vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: vi.fn().mockImplementation(function () {
    return { enrichUserWithItsProfile: vi.fn() };
  }),
}));
vi.mock("@calcom/features/ee/organizations/lib/orgDomains");
vi.mock("@calcom/features/routing-forms/lib/isAuthorizedToViewForm");
vi.mock("@calcom/app-store/routing-forms/lib/getSerializableForm");
vi.mock("@calcom/app-store/routing-forms/lib/getResponseToStore");
vi.mock("@calcom/app-store/routing-forms/lib/processRoute");
vi.mock("@calcom/app-store/routing-forms/lib/substituteVariables");
vi.mock("@calcom/app-store/routing-forms/getEventTypeRedirectUrl");
vi.mock("@calcom/app-store/routing-forms/enrichFormWithMigrationData", () => ({
  enrichFormWithMigrationData: vi.fn((form) => form),
}));
vi.mock("@calcom/lib/sentryWrapper", () => ({
  withReporting: (fn: unknown) => fn,
}));

const savePendingRoutingTrace = vi.fn();

vi.mock("@calcom/features/routing-trace/di/RoutingTraceService.container", () => ({
  getRoutingTraceService: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));

const mockForm = {
  id: "form-id",
  user: { id: 1, name: "Test User" },
  team: null,
  name: "Test Form",
  fields: [],
  routes: [],
  userId: 1,
  teamId: null,
};

const mockSerializableForm = {
  id: "form-id",
  fields: [{ id: "email", type: "email", label: "Email", identifier: "email" }],
  routes: [],
  user: { id: 1 },
};

const handleResponseResult = {
  teamMembersMatchingAttributeLogic: null,
  formResponse: null,
  queuedFormResponse: null,
  attributeRoutingConfig: null,
  timeTaken: {},
  crmContactOwnerEmail: null,
  crmContactOwnerRecordType: null,
  crmAppSlug: null,
  isPreview: false,
};

const mockContext = (
  query: Record<string, unknown> = {},
  url = "/link/form-id"
): Pick<GetServerSidePropsContext, "query" | "req"> => ({
  query: { form: "form-id", ...query },
  req: { url } as GetServerSidePropsContext["req"],
});

describe("getRoutedUrl error handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    savePendingRoutingTrace.mockResolvedValue(undefined);
    vi.mocked(getRoutingTraceService).mockReturnValue({
      addStep: vi.fn(),
      getStepsCount: vi.fn().mockReturnValue(0),
      savePendingRoutingTrace,
      processForBooking: vi.fn().mockResolvedValue(undefined),
    } as never);
    vi.mocked(orgDomainConfig).mockReturnValue({ currentOrgDomain: null, isValidOrgDomain: false });
    vi.mocked(PrismaRoutingFormRepository.findFormByIdIncludeUserTeamAndOrg).mockResolvedValue(
      mockForm as never
    );
    vi.mocked(UserRepository).mockImplementation(function () {
      return {
        enrichUserWithItsProfile: vi.fn().mockImplementation(async ({ user }) => user),
      } as unknown as InstanceType<typeof UserRepository>;
    });
    vi.mocked(isAuthorizedToViewFormOnOrgDomain).mockReturnValue(true);
    vi.mocked(getSerializableForm).mockResolvedValue(mockSerializableForm as never);
    vi.mocked(getResponseToStore).mockReturnValue({
      email: { value: "test@cal.com", label: "Email" },
    });
    vi.mocked(findMatchingRoute).mockReturnValue({
      id: "route1",
      action: { type: "customPageMessage", value: "hi" },
    } as never);
    vi.mocked(handleResponse).mockResolvedValue(handleResponseResult as never);
    vi.mocked(getUrlSearchParamsToForward).mockReturnValue(new URLSearchParams());
  });

  it("throws when the serialized form has no fields", async () => {
    vi.mocked(getSerializableForm).mockResolvedValue({ id: "form-id", routes: [] } as never);

    await expect(getRoutedUrl(mockContext())).rejects.toThrow("Form has no fields");
  });

  it("returns the message of an HttpError thrown while handling the response", async () => {
    vi.mocked(handleResponse).mockRejectedValue(new HttpError({ statusCode: 400, message: "Bad response" }));

    await expect(getRoutedUrl(mockContext())).resolves.toEqual({
      props: {
        isEmbed: false,
        form: mockSerializableForm,
        message: null,
        errorMessage: "Bad response",
      },
    });
  });

  it("returns the message of a TRPCError thrown while handling the response", async () => {
    vi.mocked(handleResponse).mockRejectedValue(
      new TRPCError({ code: "UNAUTHORIZED", message: "Not allowed" })
    );

    const result = await getRoutedUrl(mockContext());

    expect(result).toMatchObject({ props: { errorMessage: "Not allowed" } });
  });

  it("rethrows a generic error as a routing failure", async () => {
    vi.mocked(handleResponse).mockRejectedValue(new Error("connection lost"));

    await expect(getRoutedUrl(mockContext())).rejects.toThrow("Error handling the response");
  });

  it("saves the pending trace against the form response id", async () => {
    vi.mocked(handleResponse).mockResolvedValue({
      ...handleResponseResult,
      formResponse: { id: 10 },
    } as never);

    await getRoutedUrl(mockContext());

    expect(savePendingRoutingTrace).toHaveBeenCalledWith({ formResponseId: 10 });
  });

  it("saves the pending trace against the queued form response id when the response was queued", async () => {
    vi.mocked(handleResponse).mockResolvedValue({
      ...handleResponseResult,
      queuedFormResponse: { id: "queued-1" },
    } as never);

    await getRoutedUrl(mockContext({ "cal.queueFormResponse": "true" }));

    expect(savePendingRoutingTrace).toHaveBeenCalledWith({ queuedFormResponseId: "queued-1" });
  });

  it("doesn't save a pending trace for a dry run booking", async () => {
    vi.mocked(handleResponse).mockResolvedValue({
      ...handleResponseResult,
      formResponse: { id: 10 },
    } as never);

    await getRoutedUrl(mockContext({ "cal.isBookingDryRun": "true" }));

    expect(savePendingRoutingTrace).not.toHaveBeenCalled();
  });

  it("returns an 'Unhandled type of action' error for an unknown action type", async () => {
    vi.mocked(findMatchingRoute).mockReturnValue({
      id: "route1",
      action: { type: "unknownAction", value: "whatever" },
    } as never);

    const result = await getRoutedUrl(mockContext());

    expect(result).toMatchObject({ props: { errorMessage: "Unhandled type of action" } });
  });

  it("uses the fallback action when the response handling returned one", async () => {
    vi.mocked(findMatchingRoute).mockReturnValue({
      id: "route1",
      action: { type: "externalRedirectUrl", value: "https://example.com" },
    } as never);
    vi.mocked(handleResponse).mockResolvedValue({
      ...handleResponseResult,
      fallbackAction: { type: "customPageMessage", value: "nobody available" },
    } as never);

    const result = await getRoutedUrl(mockContext());

    expect(result).toMatchObject({ props: { message: "nobody available" } });
  });
});
