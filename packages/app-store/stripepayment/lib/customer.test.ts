import { HttpError } from "@calcom/lib/http-error";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  customersList: vi.fn(),
  customersCreate: vi.fn(),
  customersDelete: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));
vi.mock("./server", () => ({
  default: {
    customers: {
      list: mocks.customersList,
      create: mocks.customersCreate,
      del: mocks.customersDelete,
    },
  },
}));

import {
  deleteStripeCustomer,
  getStripeCustomerId,
  getStripeCustomerIdFromUserId,
  retrieveOrCreateStripeCustomerByEmail,
} from "./customer";

type CustomerUser = Parameters<typeof getStripeCustomerId>[0];

describe("stripe customer helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userUpdate.mockResolvedValue({});
    mocks.customersList.mockResolvedValue({ data: [] });
    mocks.customersCreate.mockResolvedValue({ id: "cus_created" });
    mocks.customersDelete.mockResolvedValue({ id: "cus_deleted" });
  });

  it("rejects when a user or email is missing", async () => {
    mocks.userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ email: null });

    await expect(getStripeCustomerIdFromUserId(1)).rejects.toMatchObject({
      statusCode: 404,
      message: "User email not found",
    });
    await expect(getStripeCustomerIdFromUserId(2)).rejects.toBeInstanceOf(HttpError);
  });

  it("looks up a user's Stripe customer", async () => {
    mocks.userFindUnique.mockResolvedValue({ email: "user@example.com", name: "User", metadata: null });
    mocks.customersList.mockResolvedValue({ data: [{ id: "cus_existing" }] });

    await expect(getStripeCustomerIdFromUserId(1)).resolves.toBe("cus_existing");
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { email: true, name: true, metadata: true },
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
      data: { metadata: { stripeCustomerId: "cus_existing" } },
    });
  });

  it("returns a metadata customer without Stripe or Prisma calls", async () => {
    const user = {
      email: "user@example.com",
      metadata: { stripeCustomerId: "cus_metadata" },
    } as CustomerUser;

    await expect(getStripeCustomerId(user)).resolves.toBe("cus_metadata");
    expect(mocks.customersList).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("creates and persists a customer when email lookup is empty", async () => {
    const user = { email: "user@example.com", metadata: { plan: "premium" } } as CustomerUser;

    await expect(getStripeCustomerId(user)).resolves.toBe("cus_created");
    expect(mocks.customersCreate).toHaveBeenCalledWith({ email: "user@example.com" });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
      data: { metadata: { plan: "premium", stripeCustomerId: "cus_created" } },
    });
  });

  it.each([null, "legacy-metadata"])("falls through for non-object metadata: %s", async (metadata) => {
    const user = { email: "user@example.com", metadata } as CustomerUser;

    await expect(getStripeCustomerId(user)).resolves.toBe("cus_created");
    expect(mocks.customersList).toHaveBeenCalledWith({ email: "user@example.com", limit: 1 });
  });

  it("deletes an existing customer", async () => {
    const user = {
      email: "user@example.com",
      metadata: { stripeCustomerId: "cus_existing" },
    } as CustomerUser;

    await expect(deleteStripeCustomer(user)).resolves.toBe("cus_deleted");
    expect(mocks.customersDelete).toHaveBeenCalledWith("cus_existing");
  });

  it("does not delete a customer when Stripe returns an empty id", async () => {
    const user = { email: "user@example.com", metadata: null } as CustomerUser;
    mocks.customersCreate.mockResolvedValue({ id: "" });

    await expect(deleteStripeCustomer(user)).resolves.toBeNull();
    expect(mocks.customersDelete).not.toHaveBeenCalled();
  });

  it("returns an existing customer for a connected Stripe account", async () => {
    mocks.customersList.mockResolvedValue({ data: [{ id: "cus_existing" }] });

    await expect(
      retrieveOrCreateStripeCustomerByEmail("acct_123", "user@example.com", "+15550001111")
    ).resolves.toEqual({ id: "cus_existing" });
    expect(mocks.customersList).toHaveBeenCalledWith(
      { email: "user@example.com", limit: 1 },
      { stripeAccount: "acct_123" }
    );
    expect(mocks.customersCreate).not.toHaveBeenCalled();
  });

  it.each([
    null,
    undefined,
  ])("creates a connected customer with undefined phone for %s", async (phoneNumber) => {
    await retrieveOrCreateStripeCustomerByEmail("acct_123", "user@example.com", phoneNumber);

    expect(mocks.customersCreate).toHaveBeenCalledWith(
      { email: "user@example.com", phone: undefined },
      { stripeAccount: "acct_123" }
    );
  });
});
