import type { TextStyle } from "./tape.ts";

/**
 * The website's dark code window (the `TypingTerminal` look), in the sizes
 * of a 14 px monospace font: a character is 0.6 em wide and a line 20 px
 * high. The board approved this look for the README recording (HAL-6366).
 */
export const geometry = {
  characterWidth: 8.4,
  lineHeight: 20,
  /** From the top of a line to its text's baseline. */
  baseline: 15,
  screenLeft: 20,
  /** The first row of the screen, below the window bar. */
  screenTop: 54,
  screenBottomPadding: 18,
  barLine: 36.5,
  barTextBaseline: 22,
  barInset: 16,
  /** The bar's 12 px text: 0.6 em per character. */
  barCharacterWidth: 7.2,
  /** Two bar characters between step labels. */
  stepGap: 14.4,
} as const;

/** The house colours: our status colours stand in for the terminal's own. */
export const colours = {
  window: "#08111f",
  border: "#3a4a86",
  barLine: "#1c2b4a",
  text: "#e6edf7",
  dim: "#8196b6",
  barText: "#a3b3cb",
  failed: "#fd7692",
  done: "#14b8a2",
  waiting: "#d380fe",
  prompt: "#a9b8ff",
} as const;

/**
 * The ANSI colours our CLI and the capture's prompt print, with their class
 * and colour here. Green is done (teal) and yellow is waiting for you
 * (violet, never yellow). Any other colour stops the drawing.
 */
const ansiColours: Readonly<Record<number, { readonly className: string; readonly hex: string }>> =
  {
    1: { className: "r", hex: colours.failed },
    2: { className: "g", hex: colours.done },
    3: { className: "w", hex: colours.waiting },
    4: { className: "p", hex: colours.prompt },
  };

const ansiNames = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

/** The styles every drawing shares. Class names are one letter, because they repeat on every line. */
export const baseCss = [
  `svg{font-family:ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace}`,
  `text{fill:${colours.text};font-size:14px;white-space:pre}`,
  `.d{fill:${colours.dim}}`,
  ".f{opacity:.75}",
  ".b{font-weight:600}",
  `.r{fill:${colours.failed}}`,
  `.g{fill:${colours.done}}`,
  `.w{fill:${colours.waiting}}`,
  `.p{fill:${colours.prompt}}`,
  ".k{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}",
  `.t{fill:${colours.barText};font-size:12px}`,
  `.l{fill:${colours.text}}`,
].join("");

/** The classes for a span's style. Dim text without a colour is the dim colour; a dim colour is faded. */
export function styleClasses(style: TextStyle): string[] {
  const classes: string[] = [];
  if (style.colour === "default") {
    if (style.dim) classes.push("d");
  } else {
    classes.push(ansiColour(style.colour).className);
    if (style.dim) classes.push("f");
  }
  if (style.bold) classes.push("b");
  return classes;
}

/** The colour a span's text is drawn in, for marks drawn as lines. */
export function styleHex(style: TextStyle): string {
  if (style.colour !== "default") return ansiColour(style.colour).hex;
  return style.dim ? colours.dim : colours.text;
}

function ansiColour(colour: number): { readonly className: string; readonly hex: string } {
  const known = ansiColours[colour];
  if (known === undefined) {
    const name = `${colour >= 8 ? "bright " : ""}${ansiNames[colour % 8] ?? "unknown"}`;
    throw new Error(`The drawing has no colour for ANSI colour ${colour} (${name}).`);
  }
  return known;
}

/**
 * The done mark "✓" drawn as a small check, from the left of its cell at
 * `x` and the text baseline at `y`. Some monospace fonts have no ✓, and a
 * missing glyph would show as an empty box.
 */
export function checkPath(x: number, y: number): string {
  return `M${number(x + 1.2)} ${number(y - 5)}L${number(x + 3.4)} ${number(y - 2.4)}L${number(x + 7.2)} ${number(y - 8.6)}`;
}

/** A number for SVG and CSS: at most three decimals, without float noise. */
export function number(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** Text made safe for XML. */
export function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
