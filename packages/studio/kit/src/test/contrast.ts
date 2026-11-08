/**
 * The WCAG 2 contrast formula, for the token tests. Colours with alpha are blended onto the
 * background they sit on first, because that's the colour the eye actually sees.
 */

/** A colour as 0-255 channels and a 0-1 alpha. */
export interface Rgba {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

const hexPattern = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const rgbPattern = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)\s*)?\)$/;

/** Reads the two colour forms the theme uses: `#rrggbb` and `rgb(r g b / a)`. */
export function parseColour(text: string): Rgba {
  const trimmed = text.trim();
  const hex = hexPattern.exec(trimmed);
  if (hex !== null) {
    const [, red = "", green = "", blue = ""] = hex;
    return {
      red: Number.parseInt(red, 16),
      green: Number.parseInt(green, 16),
      blue: Number.parseInt(blue, 16),
      alpha: 1,
    };
  }
  const rgb = rgbPattern.exec(trimmed);
  if (rgb !== null) {
    const [, red = "", green = "", blue = "", alpha = "1"] = rgb;
    return { red: Number(red), green: Number(green), blue: Number(blue), alpha: Number(alpha) };
  }
  throw new Error(`Can't read the colour "${text}". Use #rrggbb or rgb(r g b / a).`);
}

/** Paints `top` over an opaque `bottom` and returns the opaque result. */
export function blend(top: Rgba, bottom: Rgba): Rgba {
  const mix = (over: number, under: number): number => over * top.alpha + under * (1 - top.alpha);
  return {
    red: mix(top.red, bottom.red),
    green: mix(top.green, bottom.green),
    blue: mix(top.blue, bottom.blue),
    alpha: 1,
  };
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(colour: Rgba): number {
  return (
    0.2126 * channelLuminance(colour.red) +
    0.7152 * channelLuminance(colour.green) +
    0.0722 * channelLuminance(colour.blue)
  );
}

/**
 * The contrast ratio (1 to 21) of `foreground` on an opaque `background`. AA asks for 4.5 for
 * text and 3 for the edges of controls.
 */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const seen = blend(foreground, background);
  const lighter = Math.max(relativeLuminance(seen), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(seen), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}
