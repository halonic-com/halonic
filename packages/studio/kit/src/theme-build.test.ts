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
});
