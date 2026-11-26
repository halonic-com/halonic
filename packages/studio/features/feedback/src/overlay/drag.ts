import {
  deviceCrop,
  isSelection,
  minimumSelection,
  type Point,
  type Rect,
  type Screen,
} from "../crop.ts";

/** The size of the still the shell took of the window, in device pixels. */
export interface StillSize {
  readonly width: number;
  readonly height: number;
}

/**
 * A box being drawn on an overlay: its first corner and where the pointer is now, in CSS pixels.
 * It is `pressed` while the pointer is held from the first corner, as in a drag, and `anchored`
 * after a click set that corner, until a second click sets the opposite one. Two clicks say the
 * same as a drag, for a person who can't drag (WCAG 2.5.7).
 */
export interface Drag {
  readonly start: Point;
  readonly current: Point;
  readonly phase: "pressed" | "anchored";
}

/** The box `plugin:feedback|select` takes, in the still's device pixels. */
export interface SelectedArea {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The window an overlay covers, as the crop maths sees it: the window's own CSS pixels from its
 * top-left corner, scaled by how many of the still's pixels each one holds. The scale comes from
 * the still rather than `devicePixelRatio`, so a crop always lands on the picture the person saw.
 */
export function overlayScreen(
  still: StillSize,
  viewport: { readonly width: number; readonly height: number },
): Screen {
  return {
    id: "overlay",
    bounds: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    scaleFactor: viewport.width > 0 ? still.width / viewport.width : 1,
  };
}

/**
 * What letting go of a drag that drew `box` selects: its crop in device pixels, or `undefined` for a click
 * or a box under 8 × 8, which leaves the overlay open (`feedback.crop`).
 */
export function releasedArea(screen: Screen, box: Rect): SelectedArea | undefined {
  if (!isSelection(box)) return undefined;
  const crop = deviceCrop(screen, box);
  return { left: crop.x, top: crop.y, width: crop.width, height: crop.height };
}

/**
 * Whether letting go of a pressed box was a click rather than a drag: the pointer moved less than
 * the smallest box both ways, so it sets the first corner of a two-click box.
 */
export function wasClick(box: Rect): boolean {
  return box.width < minimumSelection && box.height < minimumSelection;
}

/** The whole still, which Enter selects when no box is being drawn. */
export function wholeStill(still: StillSize): SelectedArea {
  return { left: 0, top: 0, width: still.width, height: still.height };
}
