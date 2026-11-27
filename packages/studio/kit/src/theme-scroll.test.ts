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

verifies("kit.slim-scrollbars", () => {
  it("gives every region a thin bar on a see-through track, its thumb shown on hover and focus", async () => {
    const css = await buildCss([]);
    const rest = declarations(css, "*");
    expect(rest.get("scrollbar-width")).toBe("thin");
    expect(rest.get("scrollbar-color")).toBe("transparent transparent");
    const shown = declarations(css, "*:hover, *:focus-within");
    expect(shown.get("scrollbar-color")).toBe("var(--scrollbar-thumb) transparent");
    // One alpha of the mode's ink in each mode, so the thumb fits light and dark.
    expect(css).toMatch(
      /--scrollbar-thumb: light-dark\(rgb\(16 16 46 \/ [\d.]+\), rgb\(242 242 255/,
    );
  });

  it("draws a 6px rounded thumb where WebKit reads only its own scrollbar parts", async () => {
    const css = await buildCss([]);
    const webkit = css.slice(css.indexOf("@supports not (scrollbar-color: auto)"));
    expect(declarations(webkit, "::-webkit-scrollbar").get("width")).toBe("10px");
    const thumb = declarations(webkit, "::-webkit-scrollbar-thumb");
    // A 10px bar less a 2px see-through border on each side.
    expect(thumb.get("border")).toBe("2px solid transparent");
    expect(thumb.get("background-clip")).toBe("padding-box");
    expect(thumb.get("border-radius")).toBe("var(--radius-full)");
  });

  it("keeps the thumb shown at rest under more contrast, and the system's bar in forced colours", async () => {
    const css = await buildCss([]);
    const contrast = css.slice(css.indexOf("@media (prefers-contrast: more)"));
    expect(declarations(contrast, "*, *:hover, *:focus-within").get("scrollbar-color")).toBe(
      "var(--scrollbar-thumb-hover) transparent",
    );
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(declarations(forced, "*, *:hover, *:focus-within").get("scrollbar-color")).toBe("auto");
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
