import { EventRecurringTab } from "@calcom/features/eventtypes/components/tabs/recurring/EventRecurringTab";
import type { EventTypeSetup, FormValues } from "@calcom/features/eventtypes/lib/types";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { installBrowserApiStubs } from "../../../__tests__/domStubs";

installBrowserApiStubs();

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

const buildEventType = (metadata: Record<string, unknown>) =>
  ({
    id: 1,
    schedulingType: null,
    userId: 1,
    recurringEvent: null,
    metadata,
  }) as unknown as EventTypeSetup;

const Wrapper = ({ children }: { children: ReactNode }) => {
  const form = useForm<FormValues>({ defaultValues: { recurringEvent: null } });
  return <FormProvider {...form}>{children}</FormProvider>;
};

describe("EventRecurringTab", () => {
  it("allows recurrence when the event type is not paid", () => {
    render(
      <Wrapper>
        <EventRecurringTab eventType={buildEventType({})} />
      </Wrapper>
    );

    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.queryByText("warning_payment_recurring_event")).toBeNull();
  });

  it("warns instead of allowing recurrence when the event type has a price", () => {
    render(
      <Wrapper>
        <EventRecurringTab
          eventType={buildEventType({
            apps: { stripe: { enabled: true, price: 1000, currency: "usd", credentialId: 1 } },
          })}
        />
      </Wrapper>
    );

    expect(screen.getByText("warning_payment_recurring_event")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
