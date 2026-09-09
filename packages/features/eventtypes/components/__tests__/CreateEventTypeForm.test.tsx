import CreateEventTypeForm from "@calcom/features/eventtypes/components/CreateEventTypeForm";
import type { createEventTypeInput } from "@calcom/features/eventtypes/lib/types";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { installBrowserApiStubs } from "./domStubs";

installBrowserApiStubs();

const isPlatform = vi.hoisted(() => ({ value: false }));

vi.mock("@calcom/atoms/hooks/useIsPlatform", () => ({
  useIsPlatform: () => isPlatform.value,
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

vi.mock("@calcom/ui/components/editor", () => ({
  Editor: ({
    label,
    getText,
    setText,
  }: {
    label: string;
    getText: () => string;
    setText: (value: string) => void;
  }) => (
    <div data-testid="rich-text-editor">
      <span data-testid="editor-html">{getText()}</span>
      <button type="button" onClick={() => setText("<p>Some <strong>description</strong></p>")}>
        set-description
      </button>
      {label}
    </div>
  ),
}));

type CreateEventTypeFormValues = z.infer<typeof createEventTypeInput>;

const Harness = ({
  isManagedEventType = false,
  urlPrefix,
  handleSubmit,
}: {
  isManagedEventType?: boolean;
  urlPrefix?: string;
  handleSubmit: (values: CreateEventTypeFormValues) => void;
}) => {
  const form = useForm<CreateEventTypeFormValues>({
    defaultValues: { title: "", slug: "", description: "", length: 15 },
  });
  return (
    <TooltipProvider>
      <CreateEventTypeForm
        form={form}
        isManagedEventType={isManagedEventType}
        handleSubmit={handleSubmit}
        pageSlug="pro"
        isPending={false}
        urlPrefix={urlPrefix}
        SubmitButton={(isPending) => (
          <button type="submit" disabled={isPending}>
            create
          </button>
        )}
      />
    </TooltipProvider>
  );
};

beforeEach(() => {
  isPlatform.value = false;
});

describe("CreateEventTypeForm", () => {
  it("derives the slug from the title until the slug is edited", async () => {
    const handleSubmit = vi.fn();
    render(<Harness handleSubmit={handleSubmit} urlPrefix="https://cal.com" />);

    await userEvent.type(screen.getByTestId("event-type-quick-chat"), "Quick Chat");
    await userEvent.click(screen.getByRole("button", { name: "create" }));

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Quick Chat", slug: "quick-chat", length: 15 })
    );
  });

  it("slugifies the slug field on every keystroke", async () => {
    const handleSubmit = vi.fn();
    render(<Harness handleSubmit={handleSubmit} urlPrefix="https://cal.com" />);

    const slugInput = screen.getByLabelText("url");
    await userEvent.type(slugInput, "My Custom Slug");
    await userEvent.click(screen.getByRole("button", { name: "create" }));

    expect(slugInput).toHaveValue("mycustomslug");
    expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({ slug: "mycustomslug" }));
  });

  it("shows the page slug of the user for a personal event type", () => {
    render(<Harness handleSubmit={vi.fn()} urlPrefix="https://cal.com" />);

    expect(screen.getByText("https://cal.com/pro/")).toBeInTheDocument();
    expect(screen.queryByText("managed_event_url_clarification")).toBeNull();
  });

  it("shows a username placeholder and a clarification for a managed event type", () => {
    render(<Harness handleSubmit={vi.fn()} urlPrefix="https://cal.com" isManagedEventType />);

    expect(screen.getByText("https://cal.com/username_placeholder/")).toBeInTheDocument();
    expect(screen.getByText("managed_event_url_clarification")).toBeInTheDocument();
  });

  it("renders the long url prefix as a leading path instead of a tooltip", () => {
    render(<Harness handleSubmit={vi.fn()} urlPrefix="https://a-very-long-organization.cal.com" />);

    expect(screen.getByText("url: https://a-very-long-organization.cal.com")).toBeInTheDocument();
    expect(screen.getByText("/pro/")).toBeInTheDocument();
  });

  it("slugifies the slug field of the long url prefix layout too", async () => {
    const handleSubmit = vi.fn();
    render(
      <Harness handleSubmit={handleSubmit} urlPrefix="https://a-very-long-organization.cal.com" />
    );

    await userEvent.type(screen.getByLabelText(/^url:/), "Deep Dive");
    await userEvent.click(screen.getByRole("button", { name: "create" }));

    expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({ slug: "deepdive" }));
  });

  it("round-trips the description between markdown and the rich text editor", async () => {
    const handleSubmit = vi.fn();
    render(<Harness handleSubmit={handleSubmit} urlPrefix="https://cal.com" />);

    await userEvent.type(screen.getByTestId("event-type-quick-chat"), "Deep dive");
    await userEvent.click(screen.getByRole("button", { name: "set-description" }));

    await userEvent.click(screen.getByRole("button", { name: "create" }));

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Some **description**" })
    );
  });

  it("renders the managed clarification for a long url prefix too", () => {
    render(
      <Harness
        handleSubmit={vi.fn()}
        urlPrefix="https://a-very-long-organization.cal.com"
        isManagedEventType
      />
    );

    expect(screen.getByText("/username_placeholder/")).toBeInTheDocument();
    expect(screen.getByText("managed_event_url_clarification")).toBeInTheDocument();
  });

  it("uses a plain textarea and no url prefix on the platform", () => {
    isPlatform.value = true;
    render(<Harness handleSubmit={vi.fn()} urlPrefix="https://cal.com" />);

    expect(screen.getByPlaceholderText("quick_video_meeting")).toBeInTheDocument();
    expect(screen.queryByTestId("rich-text-editor")).toBeNull();
    expect(screen.getByLabelText("Slug")).toBeInTheDocument();
  });

  it("rejects a duration below the allowed minimum", async () => {
    const handleSubmit = vi.fn();
    render(<Harness handleSubmit={handleSubmit} urlPrefix="https://cal.com" />);

    const duration = screen.getByLabelText("duration");
    await userEvent.clear(duration);
    await userEvent.type(duration, "0");
    await userEvent.click(screen.getByRole("button", { name: "create" }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
