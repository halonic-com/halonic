/**
 * The kit's small positioning helper for the Menu and the Tooltip (component specs 14). CSS anchor
 * positioning isn't reliable in all three webviews yet, so a popover in the top layer is placed
 * by hand: below its trigger, above it when it doesn't fit there, and never closer than 8px to
 * the window's edges.
 */

/** How far a popover stays from every edge of the window. */
export const EDGE_GAP = 8;

/** Where a popover lines up with its trigger: left edges, right edges, or centres. */
export type PopoverAlign = "start" | "end" | "center";

export interface PlaceOptions {
  /** Space between the trigger and the popover. */
  readonly gap: number;
  readonly align: PopoverAlign;
}

/** Only the parts of a `DOMRect` the helper reads, so a test can write one by hand. */
export interface Box {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Placement {
  readonly top: number;
  readonly left: number;
  /** Set when the popover fits on neither side: it then scrolls inside this height. */
  readonly maxHeight: number | undefined;
  readonly side: "below" | "above";
}

/** Where a popover of `size` goes next to `trigger` in a window of size `view`. */
export function place(trigger: Box, size: Size, view: Size, options: PlaceOptions): Placement {
  const { gap } = options;
  const below = view.height - EDGE_GAP - (trigger.bottom + gap);
  const above = trigger.top - gap - EDGE_GAP;
  // Below when it fits there, above when it fits only there, else the side with more room.
  const side = size.height <= below || (size.height > above && below >= above) ? "below" : "above";
  const room = side === "below" ? below : above;
  const height = Math.min(size.height, room);
  return {
    top: side === "below" ? trigger.bottom + gap : trigger.top - gap - height,
    left: horizontal(trigger, size.width, view.width, options.align),
    maxHeight: size.height > room ? room : undefined,
    side,
  };
}

function horizontal(trigger: Box, width: number, windowWidth: number, align: PopoverAlign): number {
  const clamp = (left: number) =>
    Math.max(EDGE_GAP, Math.min(left, windowWidth - EDGE_GAP - width));
  if (align === "center") {
    // Whole pixels, so the text doesn't blur.
    return clamp(Math.round((trigger.left + trigger.right - width) / 2));
  }
  const fromLeft = trigger.left;
  const fromRight = trigger.right - width;
  const fits = (left: number) => left >= EDGE_GAP && left + width <= windowWidth - EDGE_GAP;
  // The asked side, else the other side, else as close as the edges allow.
  const [first, second] = align === "start" ? [fromLeft, fromRight] : [fromRight, fromLeft];
  return clamp(fits(first) || !fits(second) ? first : second);
}

/**
 * Places an open `popover` next to `trigger`. Its classes set `m-0` and `inset-auto`, so only
 * `top` and `left` place it.
 */
export function placePopover(popover: HTMLElement, trigger: Element, options: PlaceOptions): void {
  placePopoverBy(popover, trigger.getBoundingClientRect(), options);
}

/**
 * Places an open `popover` next to `box`: a trigger's box, or the point a right-click was at as a
 * box with no size.
 */
export function placePopoverBy(popover: HTMLElement, box: Box, options: PlaceOptions): void {
  popover.style.maxHeight = "";
  const { width, height } = popover.getBoundingClientRect();
  // The root's client size leaves out a page scrollbar, so a popover never ends up under one.
  const { clientWidth, clientHeight } = document.documentElement;
  const view = { width: clientWidth, height: clientHeight };
  const placement = place(box, { width, height }, view, options);
  popover.style.top = `${placement.top}px`;
  popover.style.left = `${placement.left}px`;
  popover.style.maxHeight = placement.maxHeight === undefined ? "" : `${placement.maxHeight}px`;
  popover.dataset["side"] = placement.side;
}
