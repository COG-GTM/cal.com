import type { CheckedSelectOption } from "@calcom/features/eventtypes/components/CheckedTeamSelect";
import { CheckedTeamSelect } from "@calcom/features/eventtypes/components/CheckedTeamSelect";
import type { FormValues } from "@calcom/features/eventtypes/lib/types";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installBrowserApiStubs } from "./domStubs";

installBrowserApiStubs();

const isPlatform = vi.hoisted(() => ({ value: false }));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
    usePathname: () => "/event-types",
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@calcom/atoms/hooks/useIsPlatform", () => ({
  useIsPlatform: () => isPlatform.value,
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

const buildOption = (overrides: Partial<CheckedSelectOption> & { value: string }): CheckedSelectOption => ({
  avatar: `${overrides.value}.png`,
  label: `User ${overrides.value}`,
  groupId: null,
  ...overrides,
});

const options = [buildOption({ value: "1" }), buildOption({ value: "2" }), buildOption({ value: "3" })];

const Wrapper = ({ children }: { children: ReactNode }) => {
  const form = useForm<FormValues>({
    defaultValues: { hosts: [], isRRWeightsEnabled: false, hostGroups: [] },
  });
  return (
    <TooltipProvider>
      <FormProvider {...form}>{children}</FormProvider>
    </TooltipProvider>
  );
};

const renderSelect = ({
  value,
  groupId = null,
  isRRWeightsEnabled = false,
}: {
  value: CheckedSelectOption[];
  groupId?: string | null;
  isRRWeightsEnabled?: boolean;
}) => {
  const onChange = vi.fn();
  render(
    <Wrapper>
      <CheckedTeamSelect
        options={options}
        value={value}
        onChange={onChange}
        groupId={groupId}
        isRRWeightsEnabled={isRRWeightsEnabled}
      />
    </Wrapper>
  );
  return { onChange };
};

beforeEach(() => {
  isPlatform.value = false;
});

describe("CheckedTeamSelect", () => {
  it("lists the selected hosts with their priority label", () => {
    renderSelect({
      value: [buildOption({ value: "1", priority: 4 }), buildOption({ value: "2", priority: 0 })],
    });

    const list = screen.getByRole("list");
    expect(within(list).getByText("User 1")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "highest" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "lowest" })).toBeInTheDocument();
  });

  it("falls back to the medium priority for hosts without one", () => {
    renderSelect({ value: [buildOption({ value: "1" })] });

    expect(screen.getByRole("button", { name: "medium" })).toBeInTheDocument();
  });

  it("only shows the hosts of the current group", () => {
    renderSelect({
      value: [buildOption({ value: "1", groupId: "a" }), buildOption({ value: "2", groupId: "b" })],
      groupId: "a",
    });

    const list = screen.getByRole("list");
    expect(within(list).getByText("User 1")).toBeInTheDocument();
    expect(within(list).queryByText("User 2")).toBeNull();
  });

  it("shows the weight of a host when weights are enabled", () => {
    renderSelect({
      value: [buildOption({ value: "1", weight: 150 }), buildOption({ value: "2" })],
      isRRWeightsEnabled: true,
    });

    expect(screen.getByRole("button", { name: "150%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "100%" })).toBeInTheDocument();
  });

  it("hides the priority and weight controls for fixed hosts", () => {
    renderSelect({ value: [buildOption({ value: "1", isFixed: true })], isRRWeightsEnabled: true });

    expect(screen.queryByRole("button", { name: "medium" })).toBeNull();
    expect(screen.queryByRole("button", { name: "100%" })).toBeNull();
  });

  it("removes a host from every group when its remove icon is clicked", async () => {
    const value = [buildOption({ value: "1", groupId: "a" }), buildOption({ value: "2", groupId: "b" })];
    const { onChange } = renderSelect({ value, groupId: "a" });

    const list = screen.getByRole("list");
    const removeIcon = list.querySelector('use[href="#x"]')?.parentElement;
    expect(removeIcon).toBeTruthy();
    await userEvent.click(removeIcon as Element);

    expect(onChange).toHaveBeenCalledWith([value[1]]);
  });

  it("keeps the hosts of the other groups when a host is added", async () => {
    const value = [buildOption({ value: "2", groupId: "b" })];
    const { onChange } = renderSelect({ value, groupId: "a" });

    await userEvent.click(screen.getByText("select"));
    await userEvent.click(screen.getByText("User 1"));

    expect(onChange).toHaveBeenCalledWith([value[0], expect.objectContaining({ value: "1", groupId: "a" })]);
  });

  it("opens the priority dialog for the host that was clicked", async () => {
    renderSelect({ value: [buildOption({ value: "1", priority: 3 })] });

    await userEvent.click(screen.getByRole("button", { name: "high" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("set_priority");
  });

  it("opens the weight dialog for the host that was clicked", async () => {
    renderSelect({ value: [buildOption({ value: "1", weight: 100 })], isRRWeightsEnabled: true });

    await userEvent.click(screen.getByRole("button", { name: "100%" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("set_weight");
  });

  it("renders an icon instead of an avatar on the platform", () => {
    isPlatform.value = true;
    const { container } = render(
      <Wrapper>
        <CheckedTeamSelect
          options={options}
          value={[buildOption({ value: "1" })]}
          onChange={vi.fn()}
          groupId={null}
        />
      </Wrapper>
    );

    expect(container.querySelector('use[href="#user"]')).not.toBeNull();
    expect(screen.queryByAltText("User 1")).toBeNull();
  });
});
