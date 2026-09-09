import AssignAllTeamMembers from "@calcom/features/eventtypes/components/AssignAllTeamMembers";
import type { FormValues } from "@calcom/features/eventtypes/lib/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

const Wrapper = ({ children }: { children: ReactNode }) => {
  const form = useForm<FormValues>({ defaultValues: { assignAllTeamMembers: false } });
  return <FormProvider {...form}>{children}</FormProvider>;
};

describe("AssignAllTeamMembers", () => {
  it("calls onActive and updates the form when it is turned on", async () => {
    const setAssignAllTeamMembers = vi.fn();
    const onActive = vi.fn();

    render(
      <Wrapper>
        <AssignAllTeamMembers
          assignAllTeamMembers={false}
          setAssignAllTeamMembers={setAssignAllTeamMembers}
          onActive={onActive}
        />
      </Wrapper>
    );

    await userEvent.click(screen.getByRole("switch"));

    expect(setAssignAllTeamMembers).toHaveBeenCalledWith(true);
    expect(onActive).toHaveBeenCalled();
  });

  it("calls onInactive when it is turned off", async () => {
    const setAssignAllTeamMembers = vi.fn();
    const onInactive = vi.fn();

    render(
      <Wrapper>
        <AssignAllTeamMembers
          assignAllTeamMembers={true}
          setAssignAllTeamMembers={setAssignAllTeamMembers}
          onActive={vi.fn()}
          onInactive={onInactive}
        />
      </Wrapper>
    );

    await userEvent.click(screen.getByRole("switch"));

    expect(setAssignAllTeamMembers).toHaveBeenCalledWith(false);
    expect(onInactive).toHaveBeenCalled();
  });

  it("does not fail when it is turned off without an onInactive handler", async () => {
    const setAssignAllTeamMembers = vi.fn();
    const onActive = vi.fn();

    render(
      <Wrapper>
        <AssignAllTeamMembers
          assignAllTeamMembers={true}
          setAssignAllTeamMembers={setAssignAllTeamMembers}
          onActive={onActive}
        />
      </Wrapper>
    );

    await userEvent.click(screen.getByRole("switch"));

    expect(setAssignAllTeamMembers).toHaveBeenCalledWith(false);
    expect(onActive).not.toHaveBeenCalled();
  });
});
