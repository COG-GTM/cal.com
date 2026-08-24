import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefaultOutOfOfficeSlot } from "../DefaultOutOfOfficeSlot";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join(",")}` : key,
  }),
}));

vi.mock("@calcom/lib/components/ServerTrans", () => ({
  default: ({ i18nKey, values }: { i18nKey: string; values?: Record<string, string> }) => (
    <span>{values ? `${i18nKey}:${Object.values(values).join(",")}` : i18nKey}</span>
  ),
}));

describe("DefaultOutOfOfficeSlot", () => {
  const fromUser = { id: 1, displayName: "Alice" };

  it("renders nothing when there is neither an absent user nor a holiday reason", () => {
    const { container } = render(<DefaultOutOfOfficeSlot />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the holiday variant when only a reason is given", () => {
    render(<DefaultOutOfOfficeSlot reason="Christmas" />);

    expect(screen.getByText("Christmas")).toBeInTheDocument();
    expect(screen.getByText("holiday_no_availability")).toBeInTheDocument();
  });

  it("renders the absent user with the default emoji and dashed border", () => {
    const { container } = render(<DefaultOutOfOfficeSlot fromUser={fromUser} />);

    expect(screen.getByText("ooo_user_is_ooo:Alice")).toBeInTheDocument();
    expect(screen.getByText("\u{1F3DD}\uFE0F")).toBeInTheDocument();
    expect(container.querySelector(".border-dashed")).toBeInTheDocument();
  });

  it("honours a custom emoji, class name and a solid border", () => {
    const { container } = render(
      <DefaultOutOfOfficeSlot fromUser={fromUser} emoji="🌴" borderDashed={false} className="custom" />
    );

    expect(screen.getByText("🌴")).toBeInTheDocument();
    expect(container.querySelector(".border-dashed")).not.toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain("custom");
  });

  it("shows the notes only when they may be shown publicly", () => {
    const { rerender } = render(
      <DefaultOutOfOfficeSlot fromUser={fromUser} notes="Back soon" showNotePublicly={false} />
    );

    expect(screen.queryByText("Back soon")).not.toBeInTheDocument();

    rerender(<DefaultOutOfOfficeSlot fromUser={fromUser} notes="Back soon" showNotePublicly />);

    expect(screen.getByText("Back soon")).toBeInTheDocument();
  });

  it("mentions the forwarding user when there is one", () => {
    render(<DefaultOutOfOfficeSlot fromUser={fromUser} toUser={{ id: 2, displayName: "Bob" }} />);

    expect(screen.getByText("ooo_slots_returning:Bob")).toBeInTheDocument();
  });
});
