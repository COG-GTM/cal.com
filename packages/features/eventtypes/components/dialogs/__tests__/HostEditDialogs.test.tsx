import type { CheckedSelectOption } from "@calcom/features/eventtypes/components/CheckedTeamSelect";
import { PriorityDialog, WeightDialog } from "@calcom/features/eventtypes/components/dialogs/HostEditDialogs";
import type { FormValues, Host } from "@calcom/features/eventtypes/lib/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
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
  useLocale: () => ({
    t: (key: string, vars?: Record<string, string>) => (vars?.userName ? `${key} ${vars.userName}` : key),
  }),
}));

const hosts: Host[] = [
  { userId: 1, isFixed: false, priority: 2, weight: 100, scheduleId: null },
  { userId: 2, isFixed: false, priority: 2, weight: 100, scheduleId: null },
  { userId: 3, isFixed: true, priority: 2, weight: 100, scheduleId: null },
];

const options: CheckedSelectOption[] = [
  { value: "1", label: "Alice", avatar: "alice.png", priority: 2, weight: 100, isFixed: false },
  { value: "2", label: "Bob", avatar: "bob.png", priority: 2, weight: 100, isFixed: false },
];

const Wrapper = ({ children }: { children: ReactNode }) => {
  const form = useForm<FormValues>({
    defaultValues: { hosts, isRRWeightsEnabled: true, hostGroups: [] },
  });
  return <FormProvider {...form}>{children}</FormProvider>;
};

describe("PriorityDialog", () => {
  const renderDialog = (onChange = vi.fn(), setIsOpenDialog = vi.fn()) => {
    render(
      <Wrapper>
        <PriorityDialog
          isOpenDialog
          setIsOpenDialog={setIsOpenDialog}
          option={options[0]}
          options={options}
          onChange={onChange}
        />
      </Wrapper>
    );
    return { onChange, setIsOpenDialog };
  };

  it("closes without changing the hosts when no priority was picked", async () => {
    const { onChange, setIsOpenDialog } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "confirm" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(setIsOpenDialog).toHaveBeenCalledWith(false);
  });

  it("applies the new priority to the selected host and keeps the round robin hosts only", async () => {
    const { onChange } = renderDialog();

    expect(screen.getByText("priority_for_user Alice")).toBeInTheDocument();

    await userEvent.click(screen.getByText("medium"));
    await userEvent.click(screen.getByText("highest"));
    await userEvent.click(screen.getByRole("button", { name: "confirm" }));

    const updated = onChange.mock.calls[0][0] as CheckedSelectOption[];
    expect(updated.map((host) => host.value)).toEqual(["1", "2"]);
    expect(updated.find((host) => host.value === "1")?.priority).toBe(4);
    expect(updated.find((host) => host.value === "2")?.priority).toBe(2);
  });
});

describe("WeightDialog", () => {
  const renderDialog = (onChange = vi.fn(), setIsOpenDialog = vi.fn()) => {
    render(
      <Wrapper>
        <WeightDialog
          isOpenDialog
          setIsOpenDialog={setIsOpenDialog}
          option={options[1]}
          options={options}
          onChange={onChange}
        />
      </Wrapper>
    );
    return { onChange, setIsOpenDialog };
  };

  it("closes without changing the hosts when no weight was entered", async () => {
    const { onChange, setIsOpenDialog } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "confirm" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(setIsOpenDialog).toHaveBeenCalledWith(false);
  });

  it("applies the new weight to the selected host and keeps the labels of the other hosts", async () => {
    const { onChange } = renderDialog();

    expect(screen.getByText("weight_for_user Bob")).toBeInTheDocument();

    const weightInput = screen.getByRole("spinbutton");
    await userEvent.clear(weightInput);
    await userEvent.type(weightInput, "150");
    await userEvent.click(screen.getByRole("button", { name: "confirm" }));

    const updated = onChange.mock.calls[0][0] as CheckedSelectOption[];
    expect(updated.find((host) => host.value === "2")).toMatchObject({ weight: 150, label: "Bob" });
    expect(updated.find((host) => host.value === "1")).toMatchObject({ weight: 100, label: "Alice" });
  });
});
