/** A point on the desktop, in logical pixels (what the pointer reports). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A rectangle, with its top-left corner at `x`, `y`. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * One screen of the desktop: where it sits, in logical pixels, and how many
 * device pixels make one logical pixel (2 on a Retina screen).
 */
export interface Screen {
  readonly id: string;
  readonly bounds: Rect;
  readonly scaleFactor: number;
}

/**
 * The smallest box, in logical pixels per side, that counts as a selection.
 * A click or a smaller box does nothing, so a stray click never opens the
 * modal with a dot in it (Sofia's sketch, HAL-18562).
 */
export const minimumSelection = 8;

/** The screen a point is on, or `undefined` when it is between screens. */
export function screenAt(screens: readonly Screen[], point: Point): Screen | undefined {
  return screens.find((screen) => contains(screen.bounds, point));
}

/**
 * The box a drag from `start` to `current` draws. It stays on `screen`, the
 * screen where the drag started: a pointer that leaves it pins the box to
 * the screen's edge, so a box never spans two screens.
 */
export function selectionBox(screen: Screen, start: Point, current: Point): Rect {
  const from = clampToRect(screen.bounds, start);
  const to = clampToRect(screen.bounds, current);
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}

/** Whether a box is big enough to send; a smaller one leaves the overlay open. */
export function isSelection(box: Rect): boolean {
  return box.width >= minimumSelection && box.height >= minimumSelection;
}

/**
 * The part of the screen's still that a box covers, in device pixels from
 * the still's top-left corner. Edges round outwards, so the crop never cuts
 * off a pixel the box showed, and stay inside the still.
 */
export function deviceCrop(screen: Screen, box: Rect): Rect {
  const scale = screen.scaleFactor;
  const still = stillSize(screen);
  const left = clamp(Math.floor((box.x - screen.bounds.x) * scale), 0, still.width);
  const top = clamp(Math.floor((box.y - screen.bounds.y) * scale), 0, still.height);
  const right = clamp(Math.ceil((box.x + box.width - screen.bounds.x) * scale), 0, still.width);
  const bottom = clamp(Math.ceil((box.y + box.height - screen.bounds.y) * scale), 0, still.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The size of a screen's still, in device pixels. */
export function stillSize(screen: Screen): { readonly width: number; readonly height: number } {
  return {
    width: Math.round(screen.bounds.width * screen.scaleFactor),
    height: Math.round(screen.bounds.height * screen.scaleFactor),
  };
}

/** The size label shown by the box and in the modal, such as "640 × 330". */
export function sizeLabel(crop: Rect): string {
  return `${crop.width} × ${crop.height}`;
}

/**
 * Where the size label goes: below the box's bottom-right corner, or inside
 * the box when that would push it off the screen.
 */
export function sizeLabelPlacement(
  screen: Screen,
  box: Rect,
  label: { readonly width: number; readonly height: number },
): "below" | "inside" {
  const labelBottom = box.y + box.height + label.height;
  const labelLeft = box.x + box.width - label.width;
  const screenBottom = screen.bounds.y + screen.bounds.height;
  if (labelBottom > screenBottom || labelLeft < screen.bounds.x) {
    return "inside";
  }
  return "below";
}

function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

function clampToRect(rect: Rect, point: Point): Point {
  return {
    x: clamp(point.x, rect.x, rect.x + rect.width),
    y: clamp(point.y, rect.y, rect.y + rect.height),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
