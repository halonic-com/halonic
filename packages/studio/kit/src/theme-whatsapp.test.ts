import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { blend, contrastRatio } from "./test/contrast.ts";
import { colourToken, control, text, themeTokens } from "./test/theme-colours.spec.ts";

/** Every surface text sits on in the WhatsApp layout: the frame, the sidebar, panels and menus. */
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

verifies("kit.whatsapp-theme", () => {
  describe("theme.css WhatsApp surfaces", () => {
    it("takes WhatsApp's frame, panels and ink in our blue's hue", () => {
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
      expect(themeTokens.get("--ease-press")).toBeDefined();
      expect(themeTokens.get("--ease-menu")).toBeDefined();
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
      }
    }
  });
});
