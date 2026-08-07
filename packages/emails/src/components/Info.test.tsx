import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Info } from "./Info";

describe("Info", () => {
  it("renders nothing when there is no description", () => {
    expect(renderToStaticMarkup(<Info label="Where" description={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<Info label="Where" description={null} />)).toBe("");
    expect(renderToStaticMarkup(<Info label="Where" description="" />)).toBe("");
  });

  it("renders the label as plain text and the description as given", () => {
    const html = renderToStaticMarkup(<Info label="Where" description="Cal Video" />);

    expect(html).toContain("Where");
    expect(html).toContain("Cal Video");
  });

  it("does not interpret the label as markdown unless isLabelHTML is set", () => {
    expect(renderToStaticMarkup(<Info label="**Where**" description="Cal Video" />)).toContain("**Where**");

    expect(renderToStaticMarkup(<Info label="**Where**" description="Cal Video" isLabelHTML />)).toContain(
      "<strong>Where</strong>"
    );
  });

  it("renders the description as sanitized markdown when formatted is set", () => {
    const html = renderToStaticMarkup(
      <Info label="Notes" description="**bold** and [link](https://cal.com)" formatted />
    );

    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain(`href="https://cal.com"`);
  });

  it("strips unsafe markup from formatted descriptions", () => {
    const html = renderToStaticMarkup(
      <Info label="Notes" description="<script>alert(1)</script>safe" formatted />
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("safe");
  });

  it("applies a line-through decoration when lineThrough is set", () => {
    expect(renderToStaticMarkup(<Info label="When" description="Old time" lineThrough />)).toContain(
      "text-decoration:line-through"
    );
    expect(renderToStaticMarkup(<Info label="When" description="New time" />)).not.toContain(
      "text-decoration"
    );
  });

  it("renders extraInfo and the spacer when requested", () => {
    const html = renderToStaticMarkup(
      <Info label="Where" description="Cal Video" extraInfo={<span>joining link</span>} withSpacer />
    );

    expect(html).toContain("joining link");
    expect(html).toContain("height:6px");
  });
});
