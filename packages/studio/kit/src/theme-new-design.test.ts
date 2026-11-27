import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { blend, contrastRatio, parseColour, type Rgba } from "./test/contrast.ts";
import {
  colourToken,
  control,
  css,
  type Mode,
  moreContrast,
  text,
  themeTokens,
} from "./test/theme-colours.spec.ts";
import { lightDarkPair } from "./test/theme-file.spec.ts";

/** Every surface text sits on in the two-column layout: the frame, the sidebar, panels and menus. */
const surfaces = [
  "canvas",
  "surface",
  "surface-subtle",
  "surface-muted",
  "surface-raised",
  "app-frame",
  "app-panel",
];

const textColours = ["fg", "fg-muted", "fg-subtle"];

/** A text colour as `prefers-contrast: more` raises it. */
function moreContrastColour(name: string, mode: Mode): Rgba {
  const pair = lightDarkPair(moreContrast.get(`--color-${name}`) ?? "");
  if (pair === undefined) {
    throw new Error(`--color-${name} isn't raised as light-dark() under more contrast.`);
  }
  return parseColour(pair[mode]);
}

verifies("kit.new-design-theme", () => {
  describe("theme.css new design surfaces", () => {
    it("keeps none of Studio's old blue-violet ink", () => {
      expect(css).not.toMatch(/16 16 46|242 242 255/);
    });

    it("takes the new design's frame, panels and ink in our blue's hue", () => {
      expect(themeTokens.get("--color-canvas")).toBe("light-dark(#f3f5fa, #0a1630)");
      expect(themeTokens.get("--color-app-frame")).toBe("light-dark(#f3f5fa, #0a1630)");
      expect(themeTokens.get("--color-surface")).toBe("light-dark(#ffffff, #060d1d)");
      expect(themeTokens.get("--color-app-panel")).toBe("light-dark(#ffffff, #060d1d)");
      expect(themeTokens.get("--color-surface-raised")).toBe("light-dark(#ffffff, #0a1630)");
      expect(themeTokens.get("--color-fg")).toBe("light-dark(#090a0d, #f9fafd)");
    });

    it("has the layout's new sizes and curves", () => {
      expect(themeTokens.get("--spacing-rail")).toBe("64px");
      expect(themeTokens.get("--spacing-row")).toBe("72px");
      expect(themeTokens.get("--radius-panel")).toBe("8px");
      expect(themeTokens.get("--ease-press")).toBe("var(--ease-standard)");
      expect(themeTokens.get("--ease-standard")).toBe("cubic-bezier(0.2, 0, 0, 1)");
      expect(themeTokens.get("--ease-menu")).toBe("cubic-bezier(0.17, 0.17, 0, 1)");
    });

    for (const mode of ["light", "dark"] as const) {
      for (const surface of surfaces) {
        it(`keeps text at 4.5:1 and the control edge at 3:1 on ${surface} in ${mode} mode`, () => {
          const background = colourToken(surface, mode);
          for (const foreground of textColours) {
            const seen = blend(colourToken(foreground, mode), background);
            expect(contrastRatio(seen, background), foreground).toBeGreaterThanOrEqual(text);
          }
          const edge = colourToken("border-control", mode);
          expect(contrastRatio(edge, background)).toBeGreaterThanOrEqual(control);
        });

        it(`keeps raised quiet text at 4.5:1 on ${surface} in ${mode} mode with more contrast`, () => {
          const background = colourToken(surface, mode);
          for (const foreground of ["fg-muted", "fg-subtle"]) {
            const seen = blend(moreContrastColour(foreground, mode), background);
            expect(contrastRatio(seen, background), foreground).toBeGreaterThanOrEqual(text);
          }
        });
      }
    }
  });
});
