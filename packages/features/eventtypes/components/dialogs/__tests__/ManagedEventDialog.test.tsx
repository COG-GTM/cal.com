import type { ChildrenEventType } from "@calcom/features/eventtypes/components/ChildrenEventTypeSelect";
import ManagedEventDialog from "@calcom/features/eventtypes/components/dialogs/ManagedEventDialog";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const buildChild = (name: string): ChildrenEventType =>
  ({
    value: name,
    label: name,
    created: true,
    owner: { id: 1, name, email: `${name}@example.com`, membership: "ACCEPTED", eventTypeSlugs: [] },
    slug: "30min",
    hidden: false,
  }) as unknown as ChildrenEventType;

describe("ManagedEventDialog", () => {
  it("stays closed when no child event type conflicts", () => {
    render(
      <ManagedEventDialog
        slugExistsChildrenDialogOpen={[]}
        slug="30min"
        onOpenChange={vi.fn()}
        isPending={false}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names the single conflicting owner and confirms", async () => {
    const onConfirm = vi.fn();

    render(
      <ManagedEventDialog
        slugExistsChildrenDialogOpen={[buildChild("Alice")]}
        slug="30min"
        onOpenChange={vi.fn()}
        isPending={false}
        onConfirm={onConfirm}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("managed_event_dialog_information_one");
    expect(dialog).toHaveTextContent("Alice");

    await userEvent.click(screen.getByRole("button", { name: /managed_event_dialog_confirm_button/ }));

    expect(onConfirm).toHaveBeenCalled();
  });

  it("joins the owners for multiple conflicts", () => {
    render(
      <ManagedEventDialog
        slugExistsChildrenDialogOpen={[buildChild("Alice"), buildChild("Bob")]}
        slug="30min"
        onOpenChange={vi.fn()}
        isPending={false}
        onConfirm={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("managed_event_dialog_information_other");
    expect(dialog).toHaveTextContent("Alice");
    expect(dialog).toHaveTextContent("Bob");
  });
});
