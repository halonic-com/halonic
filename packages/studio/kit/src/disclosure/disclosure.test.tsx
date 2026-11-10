// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { buildCss } from "../test/build-css.spec.ts";
import { click, render, unmountAll } from "../test/render.tsx";
import { Disclosure } from "./disclosure.tsx";

afterEach(() => {
  unmountAll();
});

/** What a screen reader says for an element: its text without the parts hidden from it. */
function spokenText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  return copy.textContent ?? "";
}

function parts(container: HTMLElement) {
  const details = container.querySelector("details") as HTMLDetailsElement;
  const summary = details.querySelector("summary") as HTMLElement;
  return { details, summary };
}

verifies("kit.disclosure", () => {
  it("is a native details whose summary is its first child, so the browser opens it with Enter and Space", () => {
    const { container } = render(<Disclosure summary="How the budget works">Text</Disclosure>);
    const { details, summary } = parts(container);
    expect(details.firstElementChild).toBe(summary);
    // Nothing overrides what the browser does with the summary: no role, no tab stop of our own.
    expect(summary.getAttribute("role")).toBeNull();
    expect(summary.getAttribute("tabindex")).toBeNull();
    expect(summary.querySelector("button, a, input")).toBeNull();
  });

  it("opens and closes in place when the summary is activated, closed at first", async () => {
    const { container } = render(<Disclosure summary="How the budget works">Text</Disclosure>);
    const { details, summary } = parts(container);
    expect(details.open).toBe(false);
    await click(summary);
    expect(details.open).toBe(true);
    await click(summary);
    expect(details.open).toBe(false);
  });

  it("starts open with defaultOpen", () => {
    const { container } = render(
      <Disclosure summary="How the budget works" defaultOpen>
        Text
      </Disclosure>,
    );
    expect(parts(container).details.open).toBe(true);
  });

  it("is named by its summary alone, with a 20px chevron hidden from screen readers", () => {
    const { container } = render(<Disclosure summary="How the budget works">Text</Disclosure>);
    const { summary } = parts(container);
    expect(spokenText(summary)).toBe("How the budget works");
    const chevron = summary.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(chevron.className).toContain("size-icon-md");
    expect(chevron.className).toContain("text-fg-subtle");
    // Flipped by the open state, with no transition.
    expect(chevron.className).toContain("group-open/disclosure:rotate-180");
    expect(chevron.className).not.toContain("transition");
  });

  it("with a label, shows the caption above the row and says it inside the row's name", () => {
    const { container } = render(
      <Disclosure label="What's in it" summary="3 items" tone="value">
        Text
      </Disclosure>,
    );
    const { details, summary } = parts(container);
    const caption = details.previousElementSibling as HTMLElement;
    expect(caption.textContent).toBe("What's in it");
    expect(caption.getAttribute("aria-hidden")).toBe("true");
    expect(caption.className).toContain("text-caption text-fg-muted");
    expect(spokenText(summary)).toBe("What's in it, 3 items");
    expect(spokenText(container)).toBe("What's in it, 3 itemsText");
  });

  it("is at least 48px, padded 16px, in the tone's weight, with an inset ring", () => {
    const { container, rerender } = render(<Disclosure summary="Budget">Text</Disclosure>);
    const summary = () => parts(container).summary;
    expect(summary().className).toContain("min-h-touch");
    expect(summary().className).toContain("px-4");
    expect(summary().className).toContain("focus-ring-inset");
    expect(summary().className).toContain("text-body-strong");
    rerender(
      <Disclosure summary="Budget" tone="value">
        Text
      </Disclosure>,
    );
    expect(summary().className).toContain("text-body");
    expect(summary().className).not.toContain("text-body-strong");
  });

  it("hides the browser's own triangle and draws no line of its own", () => {
    const { container } = render(<Disclosure summary="Budget">Text</Disclosure>);
    const { details, summary } = parts(container);
    expect(summary.className).toContain("summary-plain");
    expect(details.outerHTML).not.toMatch(/border/);
  });

  it("wraps a long summary rather than cutting it", () => {
    const { container } = render(<Disclosure summary="How the budget works">Text</Disclosure>);
    const words = parts(container).summary.firstElementChild as HTMLElement;
    expect(words.className).toBe("min-w-0 flex-1 wrap-break-word");
  });

  it("hides the triangle with list-style and the WebKit marker both", async () => {
    const css = await buildCss(["summary-plain"]);
    // Tailwind keeps the nesting; the browser reads it as `.summary-plain::-webkit-details-marker`.
    expect(css).toMatch(
      /\.summary-plain\s*\{\s*list-style:\s*none;\s*&::-webkit-details-marker\s*\{\s*display:\s*none;/,
    );
  });

  /** Where the forced-colours CanvasText rule starts in built CSS, or -1. */
  const forcedColourRule =
    /@media \(forced-colors: active\)\s*\{\s*\.forced-colors\\:text-\\\[CanvasText\\\]\s*\{\s*color:\s*CanvasText;/;

  it("keeps the row in the text colour in forced colours, not the link colour", async () => {
    const { container } = render(<Disclosure summary="Budget">Text</Disclosure>);
    const css = await buildCss(parts(container).summary.className.split(" "));
    // Every rule has the same weight, so the one written last wins: CanvasText after text-fg.
    const textColour = css.indexOf("color: var(--color-fg);");
    expect(textColour).toBeGreaterThan(-1);
    expect(css.search(forcedColourRule)).toBeGreaterThan(textColour);
  });

  it("keeps the chevron in the text colour in forced colours, not its own subtle colour", async () => {
    const { container } = render(<Disclosure summary="Budget">Text</Disclosure>);
    const chevron = parts(container).summary.querySelector('[aria-hidden="true"]') as HTMLElement;
    const css = await buildCss(chevron.className.split(" "));
    // Its own text-fg-subtle beats the colour it would inherit, so CanvasText must come after it.
    const subtleColour = css.indexOf("color: var(--color-fg-subtle);");
    expect(subtleColour).toBeGreaterThan(-1);
    expect(css.search(forcedColourRule)).toBeGreaterThan(subtleColour);
  });

  it("treats an empty label as none", () => {
    const { container } = render(
      <Disclosure label="" summary="Budget">
        Text
      </Disclosure>,
    );
    expect(container.firstElementChild?.tagName).toBe("DETAILS");
  });
});
