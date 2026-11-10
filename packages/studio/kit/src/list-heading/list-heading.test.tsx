// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { createRef } from "react";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { ListHeading } from "./list-heading.tsx";

afterEach(() => {
  unmountAll();
});

/** What a screen reader says: the text without the parts hidden from it. */
function spokenText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  return copy.textContent ?? "";
}

verifies("kit.list-heading", () => {
  it("is a level 2 heading in the caption look, padded to line up with the rows' text", () => {
    const { container } = render(<ListHeading name="Agents" />);
    const heading = container.querySelector("h2") as HTMLElement;
    expect(heading.textContent).toBe("Agents");
    expect(heading.className).toContain(
      "px-4 pt-4 pb-1 text-caption uppercase tracking-label text-fg-muted",
    );
  });

  it("takes another heading level and an id", () => {
    const { container } = render(<ListHeading name="Agents" headingLevel={3} id="agents" />);
    expect(container.querySelector("h3")?.id).toBe("agents");
  });

  it("puts the detail after a dot that is read as a comma, wrapping it rather than cutting it", () => {
    const { container } = render(<ListHeading name="Acme" detail="Workspace settings" />);
    const heading = container.querySelector("h2") as HTMLElement;
    const [name, detail] = Array.from(heading.children) as HTMLElement[];
    expect(heading.className).toContain("flex flex-wrap");
    expect(name?.className).toBe("min-w-0 truncate");
    expect(detail?.className).toBe("min-w-0 wrap-break-word");
    expect(heading.textContent).toBe("Acme· , Workspace settings");
    expect(spokenText(heading)).toBe("Acme, Workspace settings");
  });

  it("puts the name over the detail when stacked, with no dot", () => {
    const { container } = render(
      <ListHeading name="Acme" detail="Workspace settings" layout="stacked" />,
    );
    const heading = container.querySelector("h2") as HTMLElement;
    const detail = heading.lastElementChild as HTMLElement;
    expect(heading.className).toContain("flex flex-col gap-0.5");
    expect(heading.textContent).not.toContain("·");
    expect(detail.className).toBe("min-w-0 wrap-break-word");
    expect(spokenText(heading)).toBe("Acme, Workspace settings");
  });

  it("can be focused from code only, with no ring, when it has a ref", () => {
    const ref = createRef<HTMLHeadingElement>();
    const { container } = render(<ListHeading name="Needs you" headingRef={ref} />);
    const heading = container.querySelector("h2") as HTMLElement;
    expect(ref.current).toBe(heading);
    expect(heading.tabIndex).toBe(-1);
    expect(heading.className).toContain("outline-none");
    const plain = render(<ListHeading name="Agents" />).container.querySelector("h2");
    expect(plain?.hasAttribute("tabindex")).toBe(false);
  });

  it("leaves out an empty detail", () => {
    const { container } = render(<ListHeading name="Agents" detail="" />);
    expect(container.querySelector("h2")?.children).toHaveLength(1);
  });
});
