import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  blend,
  contrastRatio,
  relativeLuminance as luminance,
  parseColour,
  type Rgba,
} from "./test/contrast.ts";
import {
  colourToken,
  control,
  css,
  type Mode,
  modeValue,
  plainVariables,
  text,
  themeTokens,
} from "./test/theme-colours.spec.ts";
import { blockBody, lightDarkPair } from "./test/theme-file.spec.ts";

const characterNames = [1, 2, 3, 4, 5].flatMap((pair) => [
  `--character-${pair}a`,
  `--character-${pair}b`,
]);

/** A plain variable for one mode, with `var(--color-*)` read from the theme. */
function variableColour(name: string, mode: Mode): Rgba {
  const value = modeValue(plainVariables.get(name) ?? "", mode);
  const token = /^var\(--color-([\w-]+)\)$/.exec(value)?.[1];
  return token === undefined ? parseColour(value) : colourToken(token, mode);
}

/** The fills a card or an orb can sit on: the surfaces and the two stack shades. */
function fill(name: string, mode: Mode): Rgba {
  return name.startsWith("--") ? variableColour(name, mode) : colourToken(name, mode);
}

const stackShades = ["--stack-shade-1", "--stack-shade-2"];
const orbFills = [
  "canvas",
  "surface",
  "surface-subtle",
  "surface-muted",
  "surface-raised",
  ...stackShades,
];

verifies("kit.agent-page-tokens", () => {
  describe("theme.css character", () => {
    it("has exactly ten character colours, each a plain hex in :root and not in @theme", () => {
      const names = [...plainVariables.keys()].filter((name) => name.startsWith("--character-"));
      expect(names).toEqual(characterNames);
      for (const name of names) {
        expect(plainVariables.get(name), name).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect([...themeTokens.keys()].filter((name) => name.includes("character"))).toEqual([]);
    });

    it("never reads the halo, so a frame colour preset doesn't recolour the agents", () => {
      for (const name of characterNames) {
        expect(plainVariables.get(name), name).not.toContain("--halo-");
      }
    });
  });

  describe("theme.css stack", () => {
    it("shades one card behind with surface-subtle", () => {
      expect(plainVariables.get("--stack-shade-1")).toBe("var(--color-surface-subtle)");
    });

    it("shades two behind with surface-muted in light and surface in dark", () => {
      const shade = lightDarkPair(plainVariables.get("--stack-shade-2") ?? "");
      expect(shade?.light).toBe(
        lightDarkPair(themeTokens.get("--color-surface-muted") ?? "")?.light,
      );
      expect(shade?.dark).toBe(lightDarkPair(themeTokens.get("--color-surface") ?? "")?.dark);
    });

    for (const mode of ["light", "dark"] as const) {
      it(`gets darker further back in ${mode} mode`, () => {
        const raised = luminance(colourToken("surface-raised", mode));
        const one = luminance(fill("--stack-shade-1", mode));
        const two = luminance(fill("--stack-shade-2", mode));
        expect(raised).toBeGreaterThan(one);
        expect(one).toBeGreaterThan(two);
      });
    }

    it("offsets each card behind in px, outside @theme so they never become classes", () => {
      expect(plainVariables.get("--stack-peek")).toBe("10px");
      expect(plainVariables.get("--stack-inset")).toBe("12px");
      expect([...themeTokens.keys()].filter((name) => name.includes("stack"))).toEqual([]);
    });
  });

  describe("theme.css canvas grid", () => {
    it("draws 20px dots from the grid dot on surface-subtle, with no hard-coded colour", () => {
      const body = blockBody(css, "@utility bg-canvas-grid");
      expect(new Set([...body.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]))).toEqual(
        new Set(["--color-surface-subtle", "--canvas-grid-dot"]),
      );
      expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
      expect(body).toContain("background-size: 20px 20px;");
    });
  });

  describe("theme.css agent page contrast", () => {
    for (const mode of ["light", "dark"] as const) {
      it.each(characterNames.filter((name) => name.endsWith("b")))(
        `keeps the orb edge %s at 3:1 on every fill in ${mode} mode`,
        (name) => {
          for (const background of orbFills) {
            const ratio = contrastRatio(
              parseColour(plainVariables.get(name) ?? ""),
              fill(background, mode),
            );
            expect(ratio, `on ${background}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(control);
          }
        },
      );

      it.each(stackShades)(`keeps text and field edges readable on %s in ${mode} mode`, (shade) => {
        const textColours = ["fg", "fg-muted", "fg-subtle", "accent-text"];
        for (const foreground of [...textColours, "running", "warning", "danger", "success"]) {
          const ratio = contrastRatio(colourToken(foreground, mode), fill(shade, mode));
          expect(ratio, `${foreground}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(text);
        }
        const edge = contrastRatio(colourToken("border-control", mode), fill(shade, mode));
        expect(edge, `border-control: ${edge.toFixed(2)}`).toBeGreaterThanOrEqual(control);
      });

      it(`keeps text readable on a surface under the stack scrim in ${mode} mode`, () => {
        const dimmed = blend(variableColour("--stack-scrim", mode), colourToken("surface", mode));
        for (const foreground of ["fg", "fg-muted"]) {
          const ratio = contrastRatio(colourToken(foreground, mode), dimmed);
          expect(ratio, `${foreground}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(text);
        }
      });
    }
  });
});
