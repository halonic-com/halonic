/** A colour as 0-255 sRGB channels and a 0-1 alpha. */
type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

/** A colour as drawn and the backgrounds behind it, nearest first. */
export interface Drawn {
  readonly what: string;
  readonly colour: Rgba;
  readonly behind: readonly Rgba[];
}

/** One measured pair: what was measured and its WCAG 2 contrast ratio. */
export interface Measured {
  readonly what: string;
  readonly ratio: number;
}

/** The colours {@link readColours} read in the page. */
export interface DrawnColours {
  /** Each element's own text. */
  readonly texts: readonly Drawn[];
  /** Each visible border, and the focused element's focus ring. */
  readonly edges: readonly Drawn[];
}

/** What {@link contrasts} measured. */
export interface Contrasts {
  /** Each element's own text against the background it sits on. */
  readonly texts: readonly Measured[];
  /** Each visible border, and the focus ring, against what's around them. */
  readonly edges: readonly Measured[];
}

/*
 * For UX checklist row X-5 in a real browser: a spec runs {@link readColours} on an element
 * (`locator.evaluate(readColours)`), which reads the colours the browser computed, so a token in
 * any colour form counts as drawn, and passes them to {@link contrasts}. A colour with alpha is
 * laid over what's behind it, as the kit's token tests do (kit/src/test/contrast.ts). This file
 * doesn't import Playwright, which only tests and config files may.
 */

/** The WCAG 2 contrast ratios of what {@link readColours} read. */
export function contrasts(drawn: DrawnColours): Contrasts {
  return { texts: drawn.texts.map(measured), edges: drawn.edges.map(measured) };
}

function measured({ what, colour, behind }: Drawn): Measured {
  const background = behind.reduceRight(over, [255, 255, 255, 1]);
  return { what, ratio: contrastRatio(over(background, colour), background) };
}

/** Paints `top` over an opaque `bottom`; the result is opaque. */
function over(bottom: Rgba, top: Rgba): Rgba {
  const mix = (upper: number, lower: number) => upper * top[3] + lower * (1 - top[3]);
  return [mix(top[0], bottom[0]), mix(top[1], bottom[1]), mix(top[2], bottom[2]), 1];
}

function contrastRatio(first: Rgba, second: Rgba): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance([red, green, blue]: Rgba): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/**
 * Reads, in the page, the colours of `root`'s text (4.5:1), of its own and its buttons' borders,
 * and of the focus ring of the focused element (3:1). It uses nothing from outside itself, as
 * Playwright sends only its text; a 1 × 1 canvas turns each computed colour into sRGB channels.
 */
export function readColours(root: Element): DrawnColours {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const paint = canvas.getContext("2d", { willReadFrequently: true });
  if (paint === null) throw new Error("The page can't draw on a canvas.");
  const channels = (colour: string): Rgba => {
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = colour;
    paint.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0, alpha = 0] = paint.getImageData(0, 0, 1, 1).data;
    return [red, green, blue, alpha / 255];
  };
  // The backgrounds from `element` outwards, up to the first opaque one.
  const behind = (element: Element | null): Rgba[] => {
    const layers: Rgba[] = [];
    for (let at = element; at !== null; at = at.parentElement) {
      const layer = channels(getComputedStyle(at).backgroundColor);
      if (layer[3] > 0) layers.push(layer);
      if (layer[3] === 1) break;
    }
    return layers;
  };
  const shown = [root, ...root.querySelectorAll("*")].filter(
    (element) => element.getClientRects().length > 0,
  );

  const texts = shown.flatMap((element) => {
    const own = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();
    if (own === "") return [];
    const colour = channels(getComputedStyle(element).color);
    return [{ what: own, colour, behind: behind(element) }];
  });

  // The dialog's border separates its own surface; a button's sits on its parent's.
  const edges = [root, ...root.querySelectorAll("button")].flatMap((element) => {
    const style = getComputedStyle(element);
    const colour = channels(style.borderTopColor);
    if (Number.parseFloat(style.borderTopWidth) === 0 || colour[3] === 0) return [];
    const surface = element === root ? behind(root) : behind(element.parentElement);
    return [{ what: `the border of ${describe(element)}`, colour, behind: surface }];
  });

  // The ring is the box shadow's outer colour: an inner one in the surface's colour makes a gap.
  const focused = document.activeElement;
  if (focused !== null && root.contains(focused)) {
    const shadow = getComputedStyle(focused).boxShadow;
    const colours = shadow.match(/(?:rgba?|color|oklch|oklab|lab|lch|hsla?)\([^)]*\)/g) ?? [];
    const ring = colours.at(-1);
    if (ring !== undefined) {
      edges.push({
        what: `the focus ring of ${describe(focused)}`,
        colour: channels(ring),
        behind: behind(focused.parentElement),
      });
    }
  }
  return { texts, edges };

  // Declared here so it goes to the page with the rest.
  function describe(element: Element): string {
    if (element === root) return "the dialog";
    const name = element.textContent?.trim();
    return name ? `"${name}"` : element.tagName.toLowerCase();
  }
}
