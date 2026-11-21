/** A point on the map, in its own pixels (before the fit scales it). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A card's place and size on the map. */
export interface Box extends Point {
  readonly width: number;
  readonly height: number;
}

/** Which side of the centre card a card is on: what brings it work, what it can use, who it hands work to. */
export type MapSide = "in" | "use" | "out";

/** One line of the map: from a side card's port to the centre card's, or the other way round. */
export interface MapLine {
  readonly from: Point;
  readonly to: Point;
  /**
   * The line's path: straight out from the first port's edge, a square turn halfway, and straight
   * into the second port (flow-agents 6, T12; HAL-15064). Ports in line, or less than
   * {@link LEVEL_PX} out of line, make one straight segment (C560 b, c).
   */
  readonly path: string;
}

/**
 * The least the fit shrinks the map to on the desktop: its 12 px captions stay about 10 px. Smaller,
 * the panel scrolls instead.
 */
export const MIN_FIT_SCALE = 0.8;

/**
 * The least on the phone presentation (narrower than 600 px, a 640 px window at 200 % zoom too):
 * the map keeps its natural size and the panel scrolls, so a zoom isn't undone and its buttons
 * stay 24 px or more (WCAG 1.4.4, 2.5.8).
 */
export const PHONE_MIN_FIT_SCALE = 1;

/**
 * Ports closer than this across the line's direction are drawn in line, so a few pixels between
 * them make a straight line rather than a step too small to read as a turn (C560 b).
 */
export const LEVEL_PX = 8;

/** The free space between the map's first row and what it can use, where the lines below turn. */
export interface Band {
  /** The lowest bottom edge of the first row: the centre card and the sides with their add buttons. */
  readonly top: number;
  /** The top of what it can use, its heading included. */
  readonly bottom: number;
}

/** How long after the last resize the map fits again, like the workflow canvas. */
export const FIT_DELAY_MS = 260;

/**
 * The scale that fits `content` into `room`: never above 1, so a small map isn't blown up, and
 * never below `floor` ({@link MIN_FIT_SCALE}, or {@link PHONE_MIN_FIT_SCALE} on a phone). 1 while
 * either isn't measured (a test without a layout).
 */
export function fitScale(
  content: { readonly width: number; readonly height: number },
  room: { readonly width: number; readonly height: number },
  floor: number = MIN_FIT_SCALE,
): number {
  if (content.width <= 0 || content.height <= 0 || room.width <= 0 || room.height <= 0) return 1;
  const scale = Math.min(1, room.width / content.width, room.height / content.height);
  return Math.max(floor, scale);
}

/**
 * The lines from each side's cards to the centre card (flow-agents 6, T12): a card on the left
 * joins the centre's left edge from its right edge, one on the right its right edge from its left
 * edge, one below its bottom edge from its top. The centre card has a port for every line, spread
 * evenly along the facing edge in the cards' order, so no two lines share one. Ports sit on whole
 * pixels, and a side card's port less than {@link LEVEL_PX} out of line with its centre port moves
 * into line, so the line is straight (C560 b, c). A line below turns in the middle of `band`, the
 * free space under the first row, so it never runs along a side's add button (C560 a); halfway
 * between its ports while the band isn't measured.
 */
export function mapLines(
  centre: Box,
  sides: Readonly<Record<MapSide, readonly Box[]>>,
  band?: Band,
): readonly MapLine[] {
  const spread = (count: number, index: number) => (index + 1) / (count + 1);
  const point = (x: number, y: number): Point => ({ x: Math.round(x), y: Math.round(y) });
  const level = (card: Point, port: Point): Point =>
    Math.abs(card.y - port.y) < LEVEL_PX ? { x: card.x, y: port.y } : card;
  const plumb = (card: Point, port: Point): Point =>
    Math.abs(card.x - port.x) < LEVEL_PX ? { x: port.x, y: card.y } : card;
  const across = (from: Point, to: Point): MapLine => {
    const middle = Math.round((from.x + to.x) / 2);
    return { from, to, path: `M ${from.x} ${from.y} H ${middle} V ${to.y} H ${to.x}` };
  };
  const turn =
    band !== undefined && band.bottom > band.top
      ? () => Math.round((band.top + band.bottom) / 2)
      : (from: Point, to: Point) => Math.round((from.y + to.y) / 2);
  const down = (from: Point, to: Point): MapLine => {
    const middle = turn(from, to);
    return { from, to, path: `M ${from.x} ${from.y} V ${middle} H ${to.x} V ${to.y}` };
  };
  return [
    ...sides.in.map((card, index) => {
      const port = point(centre.x, centre.y + centre.height * spread(sides.in.length, index));
      return across(level(point(card.x + card.width, card.y + card.height / 2), port), port);
    }),
    ...sides.use.map((card, index) => {
      const port = point(
        centre.x + centre.width * spread(sides.use.length, index),
        centre.y + centre.height,
      );
      return down(port, plumb(point(card.x + card.width / 2, card.y), port));
    }),
    ...sides.out.map((card, index) => {
      const port = point(
        centre.x + centre.width,
        centre.y + centre.height * spread(sides.out.length, index),
      );
      return across(port, level(point(card.x, card.y + card.height / 2), port));
    }),
  ];
}
