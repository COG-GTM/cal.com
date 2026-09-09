import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { deleteStripeCustomer } from "@calcom/app-store/stripepayment/lib/customer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteUser } from "./deleteUser";

vi.mock("@calcom/app-store/stripepayment/lib/customer", () => ({
  deleteStripeCustomer: vi.fn(),
}));

const deleteStripeCustomerMock = vi.mocked(deleteStripeCustomer);

describe("deleteUser", () => {
  const user = { id: 1, email: "alice@example.com", metadata: null };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the stripe customer before deleting the user", async () => {
    deleteStripeCustomerMock.mockResolvedValue("cus_1");

    await deleteUser(user);

    expect(deleteStripeCustomerMock).toHaveBeenCalledWith(user);
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it("still deletes the user when the stripe customer deletion fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    deleteStripeCustomerMock.mockRejectedValue(new Error("stripe down"));

    await deleteUser(user);

    expect(warn).toHaveBeenCalled();
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    warn.mockRestore();
  });

  it("propagates a failure to delete the user record", async () => {
    deleteStripeCustomerMock.mockResolvedValue("cus_1");
    prismaMock.user.delete.mockRejectedValue(new Error("db down"));

    await expect(deleteUser(user)).rejects.toThrow("db down");
  });
});
