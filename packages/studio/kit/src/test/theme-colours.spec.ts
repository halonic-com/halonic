/** The theme's tokens, read once, and its colours as the token tests need them. */
import { blend, parseColour, type Rgba } from "./contrast.ts";
import { blockBody, customProperties, lightDarkPair, readThemeFile } from "./theme-file.spec.ts";

export const css = readThemeFile();
export const themeTokens = customProperties(blockBody(css, "@theme static"));
export const plainVariables = customProperties(blockBody(css, ":root"));

export type Mode = "light" | "dark";

/** One half of a `light-dark()` value, or the value itself when it's the same in both modes. */
export function modeValue(value: string, mode: Mode): string {
  return lightDarkPair(value)?.[mode] ?? value;
}

export function colourToken(name: string, mode: Mode): Rgba {
  const value = themeTokens.get(`--color-${name}`);
  const pair = value === undefined ? undefined : lightDarkPair(value);
  if (pair === undefined) {
    throw new Error(`--color-${name} is missing or isn't written as light-dark().`);
  }
  return parseColour(pair[mode]);
}

/**
 * A background as the eye sees it: a see-through colour (a `-soft` badge) painted over the
 * surface beneath it. Opaque backgrounds ignore `beneath`.
 */
export function backgroundToken(name: string, beneath: string, mode: Mode): Rgba {
  const colour = colourToken(name, mode);
  if (colour.alpha === 1) {
    return colour;
  }
  return blend(colour, colourToken(beneath, mode));
}

export const text = 4.5;
export const control = 3;
