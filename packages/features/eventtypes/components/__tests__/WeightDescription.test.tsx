import WeightDescription from "@calcom/features/eventtypes/components/WeightDescription";
import { render, screen } from "@testing-library/react";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

const t = ((key: string) => {
  if (key === "weights_description") return "Distribute bookings by weight <0>Learn more</0>";
  return key;
}) as unknown as TFunction;

describe("WeightDescription", () => {
  it("renders the description with a link to the round robin docs", () => {
    render(<WeightDescription t={t} />);

    expect(screen.getByText(/Distribute bookings by weight/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute(
      "href",
      "https://cal.com/docs/enterprise-features/teams/round-robin-scheduling#weights"
    );
  });
});
