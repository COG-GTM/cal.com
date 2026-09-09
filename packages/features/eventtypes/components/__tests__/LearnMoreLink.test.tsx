import { render, screen } from "@testing-library/react";
import type { TFunction } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const constantsMock = vi.hoisted(() => ({ IS_CALCOM: true }));

vi.mock("@calcom/lib/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@calcom/lib/constants")>();
  return {
    ...actual,
    get IS_CALCOM() {
      return constantsMock.IS_CALCOM;
    },
  };
});

import { LearnMoreLink } from "@calcom/features/eventtypes/components/LearnMoreLink";

const t = ((key: string) => {
  if (key === "with_link") return "Some description <0>Learn more</0> about it";
  return key;
}) as unknown as TFunction;

beforeEach(() => {
  constantsMock.IS_CALCOM = true;
});

describe("LearnMoreLink", () => {
  it("renders a link to the documentation on cal.com", () => {
    render(<LearnMoreLink t={t} i18nKey="with_link" href="https://cal.com/help/limits" />);

    const link = screen.getByRole("link", { name: "Learn more" });
    expect(link).toHaveAttribute("href", "https://cal.com/help/limits");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("strips the link out of the copy on self hosted instances", () => {
    constantsMock.IS_CALCOM = false;

    const { container } = render(
      <LearnMoreLink t={t} i18nKey="with_link" href="https://cal.com/help/limits" />
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(container.textContent).toBe("Some description  about it");
  });
});
