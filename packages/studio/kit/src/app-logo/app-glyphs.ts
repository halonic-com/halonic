/**
 * Every Halonic app that has a logo, in the order of Noah's set (HAL-17379, approved with the
 * Halonic apps card, HAL-17358).
 */
export const appLogoIds = [
  "studio",
  "messenger",
  "inbox",
  "workspaces",
  "code",
  "runs",
  "ask",
] as const;

/** A Halonic app that has a logo: `studio`, `messenger`, `inbox` and so on. */
export type AppLogoId = (typeof appLogoIds)[number];

/**
 * One shape of a glyph on the ring's 100-unit box. `solid` is filled, with a 4.5 round stroke for
 * soft corners, as the teaser's play shape; `line` is a round stroke of `width`; `dot` is a disc.
 */
export type AppGlyphShape =
  | { readonly kind: "solid"; readonly d: string }
  | { readonly kind: "line"; readonly d: string; readonly width: number }
  | { readonly kind: "dot"; readonly cx: number; readonly cy: number; readonly r: number };

/**
 * Each app's glyph, where the ring's point of light sits: centred on 50,50, about the play shape's
 * 29 by 33. Copied from the masters' `icons.mjs` on HAL-17379, the one source for the kit's
 * `AppLogo` and the Studio's native icons (`apps/studio/src-tauri/icons/draw-app-icons.mjs`).
 */
export const appGlyphs: Readonly<Record<AppLogoId, readonly AppGlyphShape[]>> = {
  studio: [{ kind: "dot", cx: 50, cy: 50, r: 7 }],
  messenger: [
    {
      kind: "solid",
      d: "M42 36.25 H58 A5.75 5.75 0 0 1 63.75 42 V49.5 A5.75 5.75 0 0 1 58 55.25 H50 L38.5 64.75 L40 55.25 A5.75 5.75 0 0 1 36.25 49.5 V42 A5.75 5.75 0 0 1 42 36.25 Z",
    },
  ],
  inbox: [
    {
      kind: "line",
      d: "M39 37 H61 A4 4 0 0 1 65 41 V59 A4 4 0 0 1 61 63 H39 A4 4 0 0 1 35 59 V41 A4 4 0 0 1 39 37 Z",
      width: 7,
    },
    { kind: "solid", d: "M37.25 52 H43 L45.75 57.25 H54.25 L57 52 H62.75 V60.75 H37.25 Z" },
  ],
  workspaces: [
    { kind: "solid", d: "M36.5 43.5 L50 36.25 L63.5 43.5 L50 50.75 Z" },
    { kind: "line", d: "M35 52.5 L50 60.75 L65 52.5", width: 7 },
  ],
  code: [{ kind: "line", d: "M42 38 L33 50 L42 62 M58 38 L67 50 L58 62", width: 8 }],
  runs: [{ kind: "solid", d: "M42 35.5 L66 50 L42 64.5 Z" }],
  ask: [
    {
      kind: "line",
      d: "M42 41.5 C42 36.5 45.5 33.5 50 33.5 C54.5 33.5 58 36.5 58 41 C58 45 55 46.5 52.5 48 C50.7 49.1 50 50.5 50 53.5 V55",
      width: 8,
    },
    { kind: "dot", cx: 50, cy: 64, r: 4.6 },
  ],
};

/**
 * How much the glyph grows about the centre at a size, so it stays readable (HAL-17379,
 * recommendation a): 1.4 at 24 px and under, 1.2 at 32 px, as drawn from 48 px up.
 */
export function appGlyphScale(pixels: number): number {
  if (pixels >= 48) {
    return 1;
  }
  return pixels >= 32 ? 1.2 : 1.4;
}
