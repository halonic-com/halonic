/** A point on the canvas, in canvas units (before zoom and pan). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A step card's place and size on the canvas. */
export interface Box extends Point {
  readonly width: number;
  readonly height: number;
}

/** How the canvas is looked at: `zoom` scales canvas units, `pan` is where canvas (0, 0) lands on screen. */
export interface View {
  readonly zoom: number;
  readonly pan: Point;
}

/** The size of a step card; every card has the same one. */
export const CARD_SIZE = { width: 200, height: 72 } as const;

/** The zoom a person can reach, and the most a fit may zoom in (never past 100 %). */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

/** The smallest box around all of `boxes`; `undefined` when there are none. */
export function boundsOf(boxes: readonly Box[]): Box | undefined {
  if (boxes.length === 0) return undefined;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The view that shows all of `content` in a viewport of `viewport` size, centred, with `padding`
 * around it. It never zooms in past 100 %, so one card isn't blown up (`workflows.canvas.fit`).
 */
export function fitView(
  content: Box | undefined,
  viewport: { readonly width: number; readonly height: number },
  padding = 32,
): View {
  if (content === undefined) return { zoom: 1, pan: { x: 0, y: 0 } };
  const room = {
    width: Math.max(viewport.width - 2 * padding, 1),
    height: Math.max(viewport.height - 2 * padding, 1),
  };
  const zoom = clampZoom(Math.min(1, room.width / content.width, room.height / content.height));
  return {
    zoom,
    pan: {
      x: (viewport.width - content.width * zoom) / 2 - content.x * zoom,
      y: (viewport.height - content.height * zoom) / 2 - content.y * zoom,
    },
  };
}

/** `zoom` kept between {@link MIN_ZOOM} and {@link MAX_ZOOM}. */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Zooms by `factor` and keeps the canvas point under `anchor` (a screen point) where it is. */
export function zoomAround(view: View, factor: number, anchor: Point): View {
  const zoom = clampZoom(view.zoom * factor);
  const scale = zoom / view.zoom;
  return {
    zoom,
    pan: {
      x: anchor.x - (anchor.x - view.pan.x) * scale,
      y: anchor.y - (anchor.y - view.pan.y) * scale,
    },
  };
}

/** Moves the view by `delta` screen pixels. */
export function panBy(view: View, delta: Point): View {
  return { zoom: view.zoom, pan: { x: view.pan.x + delta.x, y: view.pan.y + delta.y } };
}
