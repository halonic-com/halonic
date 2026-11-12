import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { haloPresets } from "./halo-presets.ts";
import { blend, contrastRatio, parseColour, type Rgba } from "./test/contrast.ts";
import {
  colourToken,
  css,
  type Mode,
  modeValue,
  plainVariables,
  text,
  themeTokens,
} from "./test/theme-colours.spec.ts";
import { blockBody, topLevelBlocks } from "./test/theme-file.spec.ts";

/**
 * The four frame colour presets, the same list Settings shows. A preset sets only --halo-blue and
 * --halo-violet; every halo utility follows.
 */
const presets = Object.entries(haloPresets).map(([name, [blue, violet]]) => ({
  name,
  blue,
  violet,
}));

type Preset = (typeof presets)[number];
type End = "blue" | "violet";

const haloUtilities = topLevelBlocks(css)
  .map((block) => block.header)
  .filter((header) => header.startsWith("@utility") && header.includes("halo"));

/** The `var()`s a block reads, in order. */
function variablesRead(body: string): string[] {
  return [...body.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1] ?? "");
}

/** A colour written in the theme with `var(--halo-*)` in it, read for one preset. */
function withPreset(value: string, preset: Preset): Rgba {
  return parseColour(
    value
      .replaceAll("var(--halo-blue)", preset.blue)
      .replaceAll("var(--halo-violet)", preset.violet),
  );
}

/** The spot's colour at one end of its gradient: the tint, blended onto surface. */
function spot(preset: Preset, end: End, mode: Mode): Rgba {
  const tint = modeValue(plainVariables.get(`--halo-tint-${end}`) ?? "", mode);
  return blend(withPreset(tint, preset), colourToken("surface", mode));
}

/** The window frame's colour at one end: bg-halo-frame's colour-mix(), blended onto canvas. */
function frame(preset: Preset, end: End, mode: Mode): Rgba {
  const mix = new RegExp(`color-mix\\(in srgb, var\\(--halo-${end}\\) [\\d.]+%, transparent\\)`);
  const value = mix.exec(blockBody(css, "@utility bg-halo-frame"))?.[0] ?? "";
  return blend(withPreset(value, preset), colourToken("canvas", mode));
}

verifies("kit.halo-start-screen", () => {
  describe("theme.css halo", () => {
    it("has exactly six halo utilities", () => {
      expect(haloUtilities).toEqual([
        "@utility bg-halo-frame",
        "@utility bg-halo-tint",
        "@utility bg-halo-wash",
        "@utility bg-halo-line",
        "@utility bg-halo-spot",
        "@utility shadow-halo-glow",
      ]);
    });

    it("holds no hard-coded colour in any halo utility (the spot's mask only shapes it)", () => {
      for (const header of haloUtilities) {
        const body = blockBody(css, header).replace(/mask-image:[^;]*;/, "");
        expect(body, header).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
      }
    });

    it("draws the spot from the tints, masked to fade out from its middle", () => {
      const body = blockBody(css, "@utility bg-halo-spot");
      expect(new Set(variablesRead(body))).toEqual(
        new Set(["--halo-tint-blue", "--halo-tint-violet"]),
      );
      expect(body).toContain(
        "background: linear-gradient(90deg, var(--halo-tint-blue), var(--halo-tint-violet));",
      );
      expect(body).toContain("mask-image: radial-gradient(closest-side, #000 45%, transparent);");
    });

    it("draws the glow from the two halo hues, 40% in light and 48% in dark", () => {
      const body = blockBody(css, "@utility shadow-halo-glow").replace(/\s+/g, " ");
      expect(new Set(variablesRead(body))).toEqual(new Set(["--halo-blue", "--halo-violet"]));
      for (const [offset, hue] of [
        ["-6px", "blue"],
        ["6px", "violet"],
      ]) {
        expect(body).toContain(
          `${offset} 0 16px light-dark( color-mix(in srgb, var(--halo-${hue}) 40%, transparent), color-mix(in srgb, var(--halo-${hue}) 48%, transparent) )`,
        );
      }
    });

    it("makes the tints from the halo hues, so a preset sets only those two", () => {
      expect(plainVariables.get("--halo-tint-blue")).toBe(
        "light-dark( color-mix(in srgb, var(--halo-blue) 14%, transparent), color-mix(in srgb, var(--halo-blue) 20%, transparent) )",
      );
      expect(plainVariables.get("--halo-tint-violet")).toBe(
        "light-dark( color-mix(in srgb, var(--halo-violet) 12%, transparent), color-mix(in srgb, var(--halo-violet) 20%, transparent) )",
      );
    });

    it("starts from the default preset, Blue and purple", () => {
      const [blue, violet] = haloPresets["blue-and-purple"];
      for (const [variable, hex] of [
        ["--halo-blue", blue],
        ["--halo-violet", violet],
      ] as const) {
        expect(parseColour(plainVariables.get(variable) ?? ""), variable).toEqual(parseColour(hex));
      }
    });

    it("has no halo shadow token, so the glow can't become a fourth shadow", () => {
      const names = [...themeTokens.keys(), ...plainVariables.keys()];
      expect(names.filter((name) => name.startsWith("--shadow-halo"))).toEqual([]);
    });
  });

  describe("theme.css halo contrast with every frame colour preset", () => {
    const cases = presets.flatMap((preset) =>
      (["blue", "violet"] as const).map((end) => ({ preset, end, name: preset.name })),
    );

    for (const mode of ["light", "dark"] as const) {
      it.each(cases)(
        `keeps text on the spot readable at its $end end with the $name preset in ${mode} mode`,
        ({ preset, end }) => {
          for (const foreground of ["fg", "fg-muted", "accent-text"]) {
            const ratio = contrastRatio(colourToken(foreground, mode), spot(preset, end, mode));
            expect(ratio, `${foreground}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(text);
          }
        },
      );

      it.each(cases)(
        `keeps an inactive window tab readable on the frame's $end end with the $name preset in ${mode} mode`,
        ({ preset, end }) => {
          const ratio = contrastRatio(colourToken("fg-muted", mode), frame(preset, end, mode));
          expect(ratio, `fg-muted: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(text);
        },
      );
    }
  });
});

verifies("kit.tab-hover", () => {
  describe("theme.css bg-tab-hover", () => {
    const body = blockBody(css, "@utility bg-tab-hover").replace(/\s+/g, " ").trim();
    const layer = "color-mix(in srgb, var(--color-surface) 45%, transparent)";

    it("is one layer of surface at 45%, so the frame under the tab shows through", () => {
      expect(body).toBe(`background-image: linear-gradient( ${layer}, ${layer} );`);
    });

    /** A hovered tab at one end of the frame: surface at 45% over the frame there. */
    function hover(preset: Preset, end: End, mode: Mode): Rgba {
      const surface = colourToken("surface", mode);
      return blend({ ...surface, alpha: 0.45 }, frame(preset, end, mode));
    }

    const cases = presets.flatMap((preset) =>
      (["blue", "violet"] as const).map((end) => ({ preset, end, name: preset.name })),
    );

    for (const mode of ["light", "dark"] as const) {
      it.each(cases)(
        `keeps a hovered tab readable at the frame's $end end with the $name preset in ${mode} mode`,
        ({ preset, end }) => {
          for (const foreground of ["fg", "fg-muted", "accent-text"]) {
            const ratio = contrastRatio(colourToken(foreground, mode), hover(preset, end, mode));
            expect(ratio, `${foreground}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(text);
          }
        },
      );
    }
  });
});
