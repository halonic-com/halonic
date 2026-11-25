import { deviceCrop, isSelection, type Point, type Rect, type Screen } from "../crop.ts";
import type { StillImage } from "./still.ts";

/** A drag on an overlay: where the pointer went down and where it is now, in CSS pixels. */
export interface Drag {
  readonly start: Point;
  readonly current: Point;
}

/** The box `plugin:feedback|select` takes, in the still's device pixels. */
export interface SelectedArea {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The screen an overlay covers, as the crop maths sees it: the window's own CSS pixels from its
 * top-left corner, scaled by how many of the still's pixels each one holds. The scale comes from
 * the still rather than `devicePixelRatio`, so a crop always lands on the picture the person saw.
 */
export function overlayScreen(
  still: StillImage,
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
