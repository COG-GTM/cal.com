import { ChildrenEventTypeSelect } from "@calcom/features/eventtypes/components/ChildrenEventTypeSelect";
import type { ChildrenEventType } from "@calcom/features/eventtypes/lib/childrenEventType";
import { MembershipRole } from "@calcom/prisma/enums";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { installBrowserApiStubs } from "./domStubs";

installBrowserApiStubs();

vi.mock("@formkit/auto-animate/react", () => ({
  useAutoAnimate: () => [vi.fn()],
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

vi.mock("@calcom/features/ee/organizations/lib/getBookerBaseUrlSync", () => ({
  getBookerBaseUrlSync: (orgSlug: string | null) =>
    orgSlug ? `https://${orgSlug}.cal.com` : "https://cal.com",
}));

const buildChild = (overrides: Partial<ChildrenEventType> = {}): ChildrenEventType =>
  ({
    hidden: false,
    created: true,
    slug: "thirty-min",
    owner: {
      id: 1,
      name: "Alice",
      email: "alice@example.com",
      username: "alice",
      membership: MembershipRole.MEMBER,
      eventTypeSlugs: [],
      profile: { organization: null },
    },
    ...overrides,
  }) as unknown as ChildrenEventType;

const renderSelect = (value: ChildrenEventType[]) => {
  const onChange = vi.fn();
  const result = render(
    <TooltipProvider>
      <ChildrenEventTypeSelect value={value} options={[]} onChange={onChange} />
    </TooltipProvider>
  );
  return { onChange, ...result };
};

describe("ChildrenEventTypeSelect", () => {
  it("shows the owner name, the member badge and the booking link", () => {
    renderSelect([buildChild()]);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("member")).toBeInTheDocument();
    expect(screen.getByText("/alice/thirty-min")).toBeInTheDocument();
    expect(screen.queryByText("hidden")).toBeNull();
  });

  it("falls back to the email when the owner has no name and hides the link without a username", () => {
    renderSelect([
      buildChild({
        owner: {
          id: 2,
          name: null,
          email: "bob@example.com",
          username: null,
          membership: MembershipRole.OWNER,
          eventTypeSlugs: [],
        },
      } as unknown as Partial<ChildrenEventType>),
    ]);

    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-button")).toBeNull();
  });

  it("marks hidden children with a badge and an unchecked switch", () => {
    renderSelect([buildChild({ hidden: true })]);

    expect(screen.getByText("hidden")).toBeInTheDocument();
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("only flips the visibility of the child that was toggled", async () => {
    const first = buildChild();
    const second = buildChild({
      slug: "sixty-min",
      owner: {
        id: 2,
        name: "Bob",
        email: "bob@example.com",
        username: "bob",
        membership: MembershipRole.MEMBER,
        eventTypeSlugs: [],
      },
    } as unknown as Partial<ChildrenEventType>);
    const { onChange } = renderSelect([first, second]);

    await userEvent.click(screen.getAllByRole("switch")[0]);

    expect(onChange).toHaveBeenCalledWith([{ ...first, hidden: true }, second]);
  });

  it("links the preview button to the organization booker url", () => {
    renderSelect([
      buildChild({
        owner: {
          id: 1,
          name: "Alice",
          email: "alice@example.com",
          username: "alice",
          membership: MembershipRole.MEMBER,
          eventTypeSlugs: [],
          profile: { organization: { slug: "acme" } },
        },
      } as unknown as Partial<ChildrenEventType>),
    ]);

    expect(screen.getByTestId("preview-button")).toHaveAttribute(
      "href",
      "https://acme.cal.com/alice/thirty-min"
    );
  });

  it("hides the preview button for a child event type that was not created yet", () => {
    renderSelect([buildChild({ created: false })]);

    expect(screen.queryByTestId("preview-button")).toBeNull();
  });

  it("removes the child event type when the delete button is clicked", async () => {
    const child = buildChild();
    const { onChange } = renderSelect([child]);

    const buttons = within(screen.getByRole("list")).getAllByRole("button");
    await userEvent.click(buttons[buttons.length - 1]);

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
