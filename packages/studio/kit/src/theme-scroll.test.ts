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

verifies("kit.slim-scrollbars", () => {
  it("gives every region a thin bar on a see-through track, its thumb shown on hover and focus", async () => {
    const css = squeezed(await buildCss([]));
    expect(css).toContain(
      "* { scrollbar-width: thin; scrollbar-color: transparent transparent; &:hover { @media (hover: hover) { scrollbar-color: var(--scrollbar-thumb) transparent; } } &:focus-within { scrollbar-color: var(--scrollbar-thumb) transparent; }",
    );
    // One alpha of the mode's ink in each mode, so the thumb fits light and dark.
    expect(css).toMatch(
      /--scrollbar-thumb: light-dark\(rgb\(16 16 46 \/ [\d.]+\), rgb\(242 242 255/,
    );
  });

  it("draws a 6px rounded thumb where WebKit reads only its own scrollbar parts", async () => {
    const css = squeezed(await buildCss([]));
    const webkit = css.slice(css.indexOf("@supports not (scrollbar-color: auto)"));
    expect(declarations(webkit, "::-webkit-scrollbar").get("width")).toBe("10px");
    // A 10px bar less a 2px see-through border on each side.
    expect(webkit).toContain(
      "::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: var(--radius-full); background-clip: padding-box; background-color: transparent;",
    );
    expect(webkit).toContain(
      ":hover::-webkit-scrollbar-thumb { background-color: var(--scrollbar-thumb); }",
    );
    expect(webkit).toContain(
      ":focus-within::-webkit-scrollbar-thumb { background-color: var(--scrollbar-thumb); }",
    );
  });

  it("keeps the thumb shown at rest under more contrast", async () => {
    const css = squeezed(await buildCss([]));
    expect(css).toContain(
      "@media (prefers-contrast: more) { scrollbar-color: var(--scrollbar-thumb) transparent; } }",
    );
    expect(css).toContain(
      "background-color: transparent; @media (prefers-contrast: more) { background-color: var(--scrollbar-thumb); } }",
    );
  });

  it("leaves forced colours to the system's own bar: no theme rule sets a scrollbar there", async () => {
    // Forced colours reset `scrollbar-color` to `auto` themselves (CSS Color Adjust).
    const css = await buildCss([]);
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
