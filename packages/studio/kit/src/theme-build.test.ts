import { describe, expect, it } from "vitest";
import { buildCss, ruleSelectors } from "./test/build-css.spec.ts";

/** These check the CSS Tailwind really writes from theme.css, not the file's text. */

describe("theme.css built by Tailwind: touch and phone", () => {
  it("writes touch: before phone:, so a phone with a coarse pointer gets the phone's sizes", async () => {
    const css = await buildCss(["phone:size-touch", "touch:size-control-lg"]);
    const touch = css.indexOf("@media (pointer: coarse)");
    const phone = css.indexOf("@media (width < 600px)");
    expect(touch).toBeGreaterThan(-1);
    expect(phone).toBeGreaterThan(touch);
  });
});

describe("theme.css built by Tailwind: focus", () => {
  it("draws the focus utilities on keyboard focus and on a field's text focus only", async () => {
    const rules = ruleSelectors(
      await buildCss(["focus-ring", "focus-ring-inset", "focus-field", "focus-field-danger"]),
    );
    expect(rules).toContainEqual([".focus-ring:focus-visible"]);
    expect(rules).toContainEqual([".focus-ring-inset:focus-visible"]);
    expect(rules).toContainEqual([".focus-field:has([data-field-text]:focus)"]);
    expect(rules).toContainEqual([".focus-field-danger:has([data-field-text]:focus)"]);
  });

  it("turns every focus utility's outline Highlight in high contrast (specs 23.5)", async () => {
    const css = await buildCss([
      "focus-ring",
      "focus-ring-inset",
      "focus-field",
      "focus-field-danger",
    ]);
    for (const head of [
      ".focus-ring:focus-visible",
      ".focus-ring-inset:focus-visible",
      ".focus-field:has([data-field-text]:focus)",
      ".focus-field-danger:has([data-field-text]:focus)",
    ]) {
      const rule = css.slice(
        css.indexOf(`${head} {`),
        css.indexOf("\n  }", css.indexOf(`${head} {`)),
      );
      expect(rule).toMatch(
        /@media \(forced-colors: active\) \{\s*outline(-color)?: [^;]*Highlight/,
      );
    }
  });
});

describe("theme.css built by Tailwind: the selected bar", () => {
  it("comes before after:top-2 and after:bottom-2, so a List's corner rows can inset it 8px", async () => {
    const css = await buildCss(["selected-bar", "after:top-2", "after:bottom-2"]);
    const bar = css.indexOf(".selected-bar");
    expect(bar).toBeGreaterThan(-1);
    expect(css.indexOf(".after\\:top-2::after")).toBeGreaterThan(bar);
    expect(css.indexOf(".after\\:bottom-2::after")).toBeGreaterThan(bar);
  });
});

describe("theme.css built by Tailwind: on a muted fill", () => {
  it("matches inside a muted fill, and inside a hovered or pressed one, without more specificity", async () => {
    const css = await buildCss(["on-muted:bg-border"]);
    const rules = ruleSelectors(css).filter((selectors) =>
      selectors.some((selector) => selector.includes("on-muted")),
    );
    expect(rules).toEqual([
      [':where([data-fill="muted"]) .on-muted\\:bg-border'],
      [':where([data-hover-fill="muted"]:hover) .on-muted\\:bg-border'],
      [':where([data-hover-fill="muted"]:active) .on-muted\\:bg-border'],
    ]);
    // Hover only where there is one, as Tailwind's own hover: does.
    expect(css).toMatch(/@media \(hover: hover\) \{\s*:where\(\[data-hover-fill="muted"\]:hover\)/);
  });

  it("comes after the plain fill, so a neutral chip on a muted fill takes border", async () => {
    const css = await buildCss(["bg-surface-muted", "on-muted:bg-border"]);
    expect(css.indexOf(".on-muted\\:bg-border")).toBeGreaterThan(css.indexOf(".bg-surface-muted"));
  });

  it("takes surface there instead with more contrast, where border is too dark for the text", async () => {
    const css = await buildCss(["on-muted:bg-border", "contrast-more:on-muted:bg-surface"]);
    const moreContrast = css.indexOf(".contrast-more\\:on-muted\\:bg-surface");
    expect(moreContrast).toBeGreaterThan(css.indexOf(".on-muted\\:bg-border"));
    expect(css.lastIndexOf("@media (prefers-contrast: more)", moreContrast)).toBeGreaterThan(-1);
  });
});

describe("theme.css built by Tailwind: lines", () => {
  it("colours a line after the preflight's `border: 0 solid`, so the border token wins", async () => {
    const css = await buildCss([]);
    const preflight = css.indexOf("border: 0 solid;");
    const token = css.indexOf("border-color: var(--color-border);");
    expect(preflight).toBeGreaterThan(-1);
    expect(token).toBeGreaterThan(preflight);
  });
});

describe("theme.css built by Tailwind: more contrast", () => {
  it("keeps the raised tokens and their media query in the output", async () => {
    const css = await buildCss([]);
    const block = css.slice(css.indexOf("@media (prefers-contrast: more)"));
    expect(block).toContain("--color-fg-muted: light-dark(");
    expect(block).toContain("--color-border: var(--color-border-control);");
    expect(block).toContain("--focus-ring: 0 0 0 2px var(--color-surface), 0 0 0 5px");
  });
});

describe("theme.css built by Tailwind: the Checkbox in high contrast", () => {
  it("fills a checked or mixed box Highlight with a HighlightText mark, and an unavailable one GrayText", async () => {
    const css = await buildCss(["checkbox-forced"]);
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(
      /:is\(:checked, :indeterminate\) \{\s*forced-color-adjust: none;\s*border-color: Highlight;\s*background-color: Highlight;/,
    );
    expect(forced).toMatch(
      /:is\(:checked, :indeterminate\) \+ \* \{\s*forced-color-adjust: none;\s*color: HighlightText;/,
    );
    expect(forced).toMatch(/\[aria-disabled="true"\] \{\s*border-color: GrayText;/);
  });
});

describe("theme.css built by Tailwind: the Switch", () => {
  it("draws the 32×18 track, the 14px thumb and the 360px row from the 4px spacing", async () => {
    const css = await buildCss(["h-4.5", "w-8", "size-3.5", "left-4", "max-w-90"]);
    expect(css).toMatch(/\.h-4\\\.5 \{\s*height: calc\(var\(--spacing\) \* 4\.5\);/);
    expect(css).toMatch(/\.size-3\\\.5 \{\s*width: calc\(var\(--spacing\) \* 3\.5\);/);
    expect(css).toMatch(/\.max-w-90 \{\s*max-width: calc\(var\(--spacing\) \* 90\);/);
  });

  it("draws the thumb CanvasText and an on track Highlight in high contrast, and an unavailable one GrayText", async () => {
    const css = await buildCss(["switch-forced"]);
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(/\+ \* \{\s*forced-color-adjust: none;\s*background-color: CanvasText;/);
    expect(forced).toMatch(
      /:checked \{\s*forced-color-adjust: none;\s*border-color: Highlight;\s*background-color: Highlight;/,
    );
    expect(forced).toMatch(/:checked \+ \* \{\s*background-color: HighlightText;/);
    expect(forced).toMatch(/\[aria-disabled="true"\] \+ \* \{\s*background-color: GrayText;/);
  });
});

describe("theme.css built by Tailwind: the Radio", () => {
  it("draws a picked circle's 5px ring, in Highlight round a Canvas centre in high contrast", async () => {
    const css = await buildCss(["checked:border-5", "radio-forced"]);
    expect(css).toMatch(
      /\.checked\\:border-5:checked \{\s*border-style: var\(--tw-border-style\);\s*border-width: 5px;/,
    );
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(
      /:checked \{\s*forced-color-adjust: none;\s*border-color: Highlight;\s*background-color: Canvas;/,
    );
    expect(forced).toMatch(/:disabled \{\s*border-color: GrayText;/);
  });
});

describe("theme.css built by Tailwind: the start screen and canvas utilities", () => {
  it("writes the halo spot, the halo glow and the canvas grid as the theme gives them", async () => {
    const css = await buildCss(["bg-halo-spot", "shadow-halo-glow", "bg-canvas-grid"]);
    expect(css).toMatch(
      /\.bg-halo-spot \{\s*background: linear-gradient\(90deg, var\(--halo-tint-blue\)/,
    );
    expect(css).toMatch(/\.shadow-halo-glow \{\s*box-shadow: -6px 0 16px light-dark\(/);
    expect(css).toMatch(/\.bg-canvas-grid \{\s*background-color: var\(--color-surface-subtle\);/);
  });
});

describe("theme.css built by Tailwind: the ActionBar", () => {
  it("hides a whileTyping='hide' bar in a rule of its own, so an engine without :has() keeps it", async () => {
    const css = await buildCss([]);
    const rule =
      /(^|\})\s*\.page:has\(> \.page-scroll \[data-text-entry\]:focus\) > \.action-bar\[data-while-typing="hide"\] \{\s*display: none;\s*\}/;
    expect(css).toMatch(rule);
  });

  it("gives each button half the row less half the 8px gap, and never less than its label", async () => {
    const css = await buildCss(["basis-[calc(50%-var(--spacing))]", "min-w-fit"]);
    expect(css).toMatch(/flex-basis: calc\(50% - var\(--spacing\)\);/);
    expect(css).toMatch(/min-width: fit-content;/);
  });
});
