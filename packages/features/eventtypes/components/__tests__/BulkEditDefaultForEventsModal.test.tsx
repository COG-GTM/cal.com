import { BulkEditDefaultForEventsModal } from "@calcom/features/eventtypes/components/BulkEditDefaultForEventsModal";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
    usePathname: () => "/event-types",
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

const eventTypes = [
  { id: 1, title: "30 min" },
  { id: 2, title: "60 min" },
];

const renderModal = (props: Partial<Parameters<typeof BulkEditDefaultForEventsModal>[0]> = {}) => {
  const bulkUpdateFunction = vi.fn();
  const setOpen = vi.fn();
  const handleBulkEditDialogToggle = vi.fn();

  render(
    <BulkEditDefaultForEventsModal
      open
      setOpen={setOpen}
      bulkUpdateFunction={bulkUpdateFunction}
      isPending={false}
      description="Update the default conferencing app"
      eventTypes={eventTypes}
      handleBulkEditDialogToggle={handleBulkEditDialogToggle}
      {...props}
    />
  );

  return { bulkUpdateFunction, setOpen, handleBulkEditDialogToggle };
};

describe("BulkEditDefaultForEventsModal", () => {
  it("renders nothing while the event types are loading", () => {
    renderModal({ isEventTypesFetching: true });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders nothing when there are no event types", () => {
    renderModal({ eventTypes: undefined });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("preselects every event type and submits all of them", async () => {
    const { bulkUpdateFunction } = renderModal();

    await userEvent.click(screen.getByRole("button", { name: "update" }));

    expect(bulkUpdateFunction).toHaveBeenCalledWith(expect.objectContaining({ eventTypeIds: [1, 2] }));
  });

  it("disables the submit button when everything is deselected", async () => {
    renderModal();

    await userEvent.click(screen.getByRole("checkbox", { name: "select_all" }));

    expect(screen.getByRole("button", { name: "update" })).toBeDisabled();
  });

  it("submits only the event types that are still selected", async () => {
    const { bulkUpdateFunction } = renderModal();

    await userEvent.click(screen.getByRole("checkbox", { name: "60 min" }));
    await userEvent.click(screen.getByRole("button", { name: "update" }));

    expect(bulkUpdateFunction).toHaveBeenCalledWith(expect.objectContaining({ eventTypeIds: [1] }));
  });

  it("closes the dialog through the callback passed to the update function", async () => {
    const { bulkUpdateFunction, setOpen } = renderModal();

    await userEvent.click(screen.getByRole("button", { name: "update" }));
    bulkUpdateFunction.mock.calls[0][0].callback();

    expect(setOpen).toHaveBeenCalledWith(false);
  });
});
