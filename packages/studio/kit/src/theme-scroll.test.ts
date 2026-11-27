import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { buildCss } from "./test/build-css.spec.ts";

/** The declarations of the first rule whose selector is exactly `selector`, by property. */
function declarations(css: string, selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = new RegExp(`(?:^|[{};\\s])${escaped}\\s*\\{([^{}]*)\\}`).exec(css)?.[1] ?? "";
  return new Map(
    body
      .split(";")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => {
        const colon = line.indexOf(":");
        return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
      }),
  );
}

/** The CSS with each run of white space as one space, so a nested rule reads on one line. */
function squeezed(css: string): string {
  return css.replace(/\s+/g, " ");
}

/** The CSS from the block that opens with `opening`, so a rule is checked on the engine it's for. */
function block(css: string, opening: string): string {
  return css.slice(css.indexOf(opening));
}

const standardOnly = "@supports not selector(::-webkit-scrollbar) {";
const parts = "@supports selector(::-webkit-scrollbar) { @media not (forced-colors: active) {";

verifies("kit.slim-scrollbars", () => {
  it("shows a region's thumb colour on hover and keyboard focus only, through a property on the region", async () => {
    const css = squeezed(await buildCss([]));
    expect(css).toContain(
      "* { --scrollbar-thumb-now: transparent; &:hover { @media (hover: hover) { --scrollbar-thumb-now: var(--scrollbar-thumb); } } &:has(:focus-visible) { --scrollbar-thumb-now: var(--scrollbar-thumb); }",
    );
  });

  it("gives an engine without the scrollbar parts a thin bar in the region's thumb colour", async () => {
    const css = squeezed(await buildCss([]));
    expect(css).toContain(
      `${standardOnly} * { scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb-now) transparent; } }`,
    );
  });

  it("sets the standard properties nowhere else, as Chromium drops its parts once they're set", async () => {
    const css = squeezed(await buildCss([]));
    const theme = css.slice(css.indexOf("--scrollbar-thumb:"), css.indexOf(":where( button"));
    expect(theme.split("scrollbar-width").length - 1).toBe(1);
    expect(block(theme, parts)).not.toMatch(/scrollbar-(width|color)/);
  });

  it("uses about 3:1 of the mode's ink, 45% light and 38% dark", async () => {
    const css = squeezed(await buildCss([]));
    expect(css).toContain(
      "--scrollbar-thumb: light-dark(rgb(16 16 46 / 0.45), rgb(242 242 255 / 0.38));",
    );
  });

  it("draws a 6px rounded thumb with no arrow buttons from the scrollbar parts", async () => {
    const webkit = block(squeezed(await buildCss([])), parts);
    expect(declarations(webkit, "::-webkit-scrollbar").get("width")).toBe("10px");
    expect(declarations(webkit, "::-webkit-scrollbar-button").get("display")).toBe("none");
    // A 10px bar less a 2px see-through border on each side.
    expect(webkit).toContain(
      "::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: var(--radius-full); background-clip: padding-box; background-color: var(--scrollbar-thumb-now); }",
    );
  });

  it("never styles the thumb from the region's state, which Chromium doesn't redo after the first paint", async () => {
    const css = squeezed(await buildCss([]));
    const theme = css.slice(css.indexOf("--scrollbar-thumb:"), css.indexOf(":where( button"));
    expect(theme).not.toMatch(/:(hover|has\([^)]*\))::-webkit-scrollbar/);
  });

  it("doesn't show the thumb for focus a pointer click left behind", async () => {
    const css = squeezed(await buildCss([]));
    const theme = css.slice(css.indexOf("--scrollbar-thumb:"), css.indexOf(":where( button"));
    expect(theme).not.toContain("focus-within");
  });

  it("keeps the thumb shown at rest, and stronger on hover and focus too, under more contrast", async () => {
    const css = squeezed(await buildCss([]));
    expect(css).toContain(
      "--scrollbar-thumb-strong: light-dark(rgb(16 16 46 / 0.7), rgb(242 242 255 / 0.7)); @media (prefers-contrast: more) { --scrollbar-thumb: var(--scrollbar-thumb-strong); }",
    );
    expect(css).toContain(
      "@media (prefers-contrast: more) { --scrollbar-thumb-now: var(--scrollbar-thumb); } }",
    );
  });

  it("leaves forced colours to the system's own bar: the parts stay out of them", async () => {
    // Forced colours reset `scrollbar-color` to `auto` themselves (CSS Color Adjust).
    const css = squeezed(await buildCss([]));
    expect(css).toContain(`${parts} ::-webkit-scrollbar {`);
    expect(css).not.toMatch(/@media \(forced-colors: active\) \{[^@]*scrollbar/);
  });

  it("lets a part that hides its bar on purpose win, as the theme's rules sit in the base layer", async () => {
    const css = await buildCss(["[scrollbar-width:none]"]);
    const thin = css.indexOf("scrollbar-width: thin");
    const base = css.lastIndexOf("\n@layer base {", thin);
    // No top-level block closes between the base layer's start and the rule: it sits inside it.
    expect(base).toBeGreaterThan(-1);
    expect(css.slice(base, thin)).not.toContain("\n}\n");
    expect(css).toMatch(
      /@layer utilities \{\s*\.\\\[scrollbar-width\\:none\\\] \{\s*scrollbar-width: none;/,
    );
  });
});
