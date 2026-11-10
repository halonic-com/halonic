/** Six hex digits, with or without the `#`. Three-digit shorthand isn't a colour here. */
const SIX_DIGITS = /^#?([0-9a-f]{6})$/i;

/**
 * The colour `text` names, written the one way the field shows it ("#3B8BFF"), or `null` when it
 * isn't six hex digits. Spaces round it don't count.
 */
export function parseHex(text: string): string | null {
  const match = SIX_DIGITS.exec(text.trim());
  return match?.[1] === undefined ? null : `#${match[1].toUpperCase()}`;
}

/** Whether two texts name the same colour: "#3b8bff" and "3B8BFF" do. */
export function sameColour(first: string, second: string): boolean {
  const colour = parseHex(first);
  return colour !== null && colour === parseHex(second);
}

/** One sRGB channel, 0 to 255, as linear light (WCAG's relative luminance). */
function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * Whether white reads better than ink on `colour`: its luminance is below the point where the
 * two have the same contrast. The picked swatch's check takes white on a dark colour, ink on a
 * light one, so it shows on any preset.
 */
export function isDark(colour: string): boolean {
  const hex = parseHex(colour);
  if (hex === null) {
    return false;
  }
  const [red, green, blue] = [1, 3, 5].map((start) =>
    linear(Number.parseInt(hex.slice(start, start + 2), 16)),
  ) as [number, number, number];
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  // White and near-black ink (luminance about 0.004) give the same contrast at about 0.19.
  return luminance < 0.19;
}
